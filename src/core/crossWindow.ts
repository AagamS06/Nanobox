import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { TODOS_CHANGED_EVENT } from "../storage/todos";

/**
 * Nanobox has two windows — the widgets overlay and the island — each with
 * its own JavaScript. When one changes shared data (say the island adds a
 * Brain Dump entry), the other needs to refresh.
 *
 * `broadcast(name)` sends a Tauri event to every window, including the sender;
 * `startCrossWindowBridge()` (called once per window) turns those into plain
 * `window` events, so components just use addEventListener as usual.
 */

export const BRAIN_DUMP_CHANGED_EVENT = "nanobox:brain-dump-changed";
export const SHORTCUTS_CHANGED_EVENT = "nanobox:shortcuts-changed";
export const THEME_CHANGED_EVENT = "nanobox:theme-changed";
export { TODOS_CHANGED_EVENT };

const BRIDGED = [BRAIN_DUMP_CHANGED_EVENT, SHORTCUTS_CHANGED_EVENT, THEME_CHANGED_EVENT, TODOS_CHANGED_EVENT];

export function broadcast(name: string, payload?: unknown): void {
  try {
    emit(name, payload).catch((err) => console.error(`failed to broadcast ${name}`, err));
  } catch (err) {
    // No Tauri runtime (unit tests, plain browser): nothing to sync with.
    console.debug(`broadcast ${name} skipped`, err);
  }
}

let started: Promise<UnlistenFn[]> | null = null;

export function startCrossWindowBridge(): void {
  if (started) return;
  started = Promise.all(
    BRIDGED.map((name) =>
      listen(name, (event) => window.dispatchEvent(new CustomEvent(name, { detail: event.payload }))),
    ),
  ).catch((err) => {
    console.error("cross-window bridge failed", err);
    return [];
  });
}
