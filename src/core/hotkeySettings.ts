import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../storage/settings";

const KEY = "hotkeysEnabled";

/** The two system-wide hotkeys (registered in src-tauri/src/hotkeys.rs). */
export const HOTKEYS = {
  capture: { mac: "⌘⇧Space", other: "Ctrl+Shift+Space", what: "Quick capture" },
  peek: { mac: "⌘⇧\\", other: "Ctrl+Shift+\\", what: "Bring widgets to front" },
} as const;

export function hotkeyLabel(which: keyof typeof HOTKEYS): string {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
  return isMac ? HOTKEYS[which].mac : HOTKEYS[which].other;
}

export async function getHotkeysEnabled(): Promise<boolean> {
  return (await getSetting(KEY)) !== "false";
}

/**
 * Turns the hotkeys on or off and remembers the choice. Resolves to the
 * shortcuts that couldn't be registered (another app already uses them).
 */
export async function setHotkeysEnabled(enabled: boolean): Promise<string[]> {
  await setSetting(KEY, String(enabled));
  return invoke<string[]>("set_hotkeys_enabled", { enabled });
}

/** Called once at startup by the main window. */
export async function applySavedHotkeys(): Promise<string[]> {
  const enabled = await getHotkeysEnabled();
  return invoke<string[]>("set_hotkeys_enabled", { enabled });
}
