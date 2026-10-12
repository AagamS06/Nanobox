import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";

/**
 * Auto-update via tauri-plugin-updater.
 *
 * The plugin fetches `latest.json` from the newest *published* GitHub
 * Release (see `plugins.updater.endpoints` in tauri.conf.json, and
 * .github/workflows/release.yml which generates that file). Every update
 * bundle is verified against the public key in tauri.conf.json before it's
 * installed, independently of OS code signing — so this works today, with
 * unsigned installers, and keeps working once Windows/macOS signing lands.
 *
 * Deliberately low-key for a calm-by-default app:
 *  - never runs in `npm run tauri dev` (nothing to update, and no release
 *    exists for a dev build's version anyway);
 *  - waits a while after startup instead of competing with first paint;
 *  - asks once per version — "Later" is remembered, so a dismissed update
 *    doesn't re-prompt on every launch;
 *  - any failure (offline, no releases yet, placeholder pubkey) is silent.
 */

const STARTUP_DELAY_MS = 15_000;
const DISMISSED_KEY = "nanobox.updater.dismissedVersion";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* storage unavailable — worst case we ask again next launch */
  }
}

/**
 * Checks for an update and, if one exists, asks before installing.
 * `force` skips the "already dismissed this version" check — for a manual
 * "Check for updates" button, if one is added to Settings later.
 * Resolves to the version found, or null when up to date / on error.
 */
export async function checkForUpdates(force = false): Promise<string | null> {
  try {
    const update = await check();
    if (!update) return null;

    if (!force && readDismissed() === update.version) return update.version;

    const notes = update.body?.trim();
    const install = await ask(
      `Nanobox ${update.version} is available (you have ${update.currentVersion}).` +
        (notes ? `\n\n${notes}` : "") +
        "\n\nInstall it now? Nanobox will restart.",
      { title: "Update available", kind: "info", okLabel: "Install", cancelLabel: "Later" },
    );

    if (!install) {
      writeDismissed(update.version);
      return update.version;
    }

    await update.downloadAndInstall();
    await relaunch();
    return update.version;
  } catch (err) {
    console.warn("[updater] update check failed:", err);
    return null;
  }
}

/** Fire-and-forget startup check. Call once, outside React's render cycle. */
export function scheduleStartupUpdateCheck(): void {
  if (import.meta.env.DEV) return;
  setTimeout(() => {
    void checkForUpdates();
  }, STARTUP_DELAY_MS);
}
