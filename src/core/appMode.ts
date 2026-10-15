import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Desktop mode: widgets live in a resizable window pinned behind every app.
 * Island mode: everything, widgets included, lives in the island at the top
 * of the screen and the desktop window stays hidden.
 *
 * Rust owns the choice (src-tauri/src/app_mode.rs) because it decides which
 * windows to show before any JavaScript loads; this is the JS view of it.
 */
export type AppMode = "desktop" | "island";

export const APP_MODE_CHANGED_EVENT = "app-mode-changed";

export const APP_MODE_OPTIONS = [
  { value: "desktop", label: "Desktop" },
  { value: "island", label: "Island" },
] as const;

export const APP_MODE_HINTS: Record<AppMode, string> = {
  desktop: "Widgets sit in a window that always stays behind your other apps. Resize, minimise or maximise it as you like.",
  island: "Everything lives in the island at the top of your screen — hover it to open your widgets, music, plans and more.",
};

export function toAppMode(value: unknown): AppMode {
  return value === "island" ? "island" : "desktop";
}

export async function getAppMode(): Promise<AppMode> {
  try {
    return toAppMode(await invoke<string>("get_app_mode"));
  } catch {
    return "desktop"; // no Tauri runtime (tests, plain browser preview)
  }
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await invoke("set_app_mode", { mode });
}

/** Shows (or puts away) the window that hosts full Settings / the Block Builder. */
export async function showToolWindow(visible: boolean): Promise<void> {
  await invoke("show_tool_window", { visible }).catch(() => {});
}

/** The current mode, kept up to date when it's switched from any window or the tray. `null` until known. */
export function useAppMode(): AppMode | null {
  const [mode, setMode] = useState<AppMode | null>(null);
  useEffect(() => {
    let alive = true;
    getAppMode().then((m) => alive && setMode(m));
    let unlisten: (() => void) | undefined;
    try {
      listen<string>(APP_MODE_CHANGED_EVENT, (e) => setMode(toAppMode(e.payload)))
        .then((fn) => {
          if (alive) unlisten = fn;
          else fn();
        })
        .catch(() => {});
    } catch {
      /* no Tauri runtime */
    }
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return mode;
}
