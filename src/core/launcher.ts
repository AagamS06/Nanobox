import { invoke } from "@tauri-apps/api/core";

/**
 * Opens an app, file, folder or web link the user chose — shortcuts, routines
 * and the island all go through here. See src-tauri/src/launcher.rs for why
 * this isn't the opener plugin's `openPath` (its scope refused local paths).
 */
export function openTarget(target: string): Promise<void> {
  return invoke("open_target", { target });
}

export function isWebLink(target: string): boolean {
  return /^https?:\/\//i.test(target.trim());
}

/** Short display name for a path or link: "Spotify", "example.com". */
export function targetLabel(target: string): string {
  const t = target.trim();
  if (isWebLink(t)) {
    try {
      return new URL(t).hostname.replace(/^www\./, "");
    } catch {
      return t;
    }
  }
  const base = t.split(/[\\/]/).filter(Boolean).pop() ?? t;
  return base.replace(/\.(exe|app|lnk|url)$/i, "");
}
