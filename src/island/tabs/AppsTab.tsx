import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { createShortcut, extractFileIcon, listShortcuts, Shortcut, updateShortcutIcon } from "../../storage/shortcuts";
import { openTarget, targetLabel } from "../../core/launcher";
import { broadcast, SHORTCUTS_CHANGED_EVENT } from "../../core/crossWindow";
import { useHoldOpen } from "../holdOpen";

/** App launcher — the same list as the Shortcuts widget, one click away. */
export function AppsTab() {
  const [apps, setApps] = useState<Shortcut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const holdOpen = useHoldOpen();

  const refresh = useCallback(() => {
    listShortcuts().then(setApps).catch((err) => console.error("failed to load shortcuts", err));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  async function launch(app: Shortcut) {
    try {
      setError(null);
      await openTarget(app.target_path);
    } catch (err) {
      setError(String(err));
    }
  }

  async function add() {
    const picked = await holdOpen(openDialog({ multiple: true, directory: false, title: "Add apps or files" }));
    if (!picked) return;
    for (const path of Array.isArray(picked) ? picked : [picked]) {
      const id = await createShortcut({ label: targetLabel(path), target_path: path });
      const icon = await extractFileIcon(path).catch(() => null);
      if (icon) await updateShortcutIcon(id, icon);
    }
    broadcast(SHORTCUTS_CHANGED_EVENT);
  }

  return (
    <div className="island-apps">
      {apps.length === 0 ? (
        <div className="island-empty">
          <p>No apps yet.</p>
          <p className="island-muted">Add the apps you use most — they also appear in the Shortcuts widget.</p>
        </div>
      ) : (
        <ul className="island-apps__grid">
          {apps.map((app) => (
            <li key={app.id}>
              <button className="island-app" onClick={() => launch(app)} title={app.target_path}>
                {app.icon_data ? (
                  <img src={app.icon_data} alt="" className="island-app__icon" />
                ) : (
                  <span className="island-app__icon island-app__icon--letter" aria-hidden="true">
                    {app.label.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="island-app__label">{app.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="island-btn" onClick={add}>
        + Add app
      </button>
      {error && <p className="island-error">{error}</p>}
    </div>
  );
}
