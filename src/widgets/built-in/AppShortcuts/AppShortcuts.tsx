import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openTarget } from "../../../core/launcher";
import { SHORTCUTS_CHANGED_EVENT } from "../../../core/crossWindow";
import { WidgetFrame } from "../../../components/WidgetFrame";
import {
  createShortcut,
  deleteShortcut,
  extractFileIcon,
  listShortcuts,
  readImageAsDataUrl,
  renameShortcut,
  Shortcut,
  updateShortcutIcon,
} from "../../../storage/shortcuts";
import "./AppShortcuts.css";

function baseName(path: string) {
  const withoutExt = path.replace(/\.(exe|app|lnk)$/i, "");
  return withoutExt.split(/[\\/]/).pop() ?? withoutExt;
}

interface MenuState {
  id: number;
  x: number;
  y: number;
}

export function AppShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [iconWarning, setIconWarning] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setShortcuts(await listShortcuts());
  }

  useEffect(() => {
    refresh().catch((err) => console.error("failed to load shortcuts", err));
    // The island's Apps tab can add shortcuts from the other window.
    const onChanged = () => void refresh().catch(() => {});
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, onChanged);
  }, []);

  // Close the right-click menu on outside click or Escape — same pattern as
  // ThemeSwitcher/SettingsPanel elsewhere in this codebase.
  useEffect(() => {
    if (!menu) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenu(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  /** Extracts (or re-extracts) a shortcut's OS icon and persists it, best-effort. */
  async function refreshIcon(id: number, targetPath: string) {
    const iconData = await extractFileIcon(targetPath);
    await updateShortcutIcon(id, iconData);
    await refresh();
  }

  async function addShortcuts(paths: string[]) {
    const failedIcons: string[] = [];
    for (const p of paths) {
      const id = await createShortcut({ label: baseName(p), target_path: p });
      // Populate icon_data once at creation time rather than re-extracting
      // on every list load — extraction can be relatively slow.
      const iconData = await extractFileIcon(p);
      if (iconData) {
        await updateShortcutIcon(id, iconData);
      } else {
        failedIcons.push(baseName(p));
      }
    }
    await refresh();
    if (failedIcons.length > 0) {
      setIconWarning(`Could not extract icon for: ${failedIcons.join(", ")} — letter avatar shown instead.`);
    }
  }

  useEffect(() => {
    if (!iconWarning) return;
    const timer = setTimeout(() => setIconWarning(null), 5000);
    return () => clearTimeout(timer);
  }, [iconWarning]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragOver(true);
        } else if (event.payload.type === "drop") {
          setDragOver(false);
          addShortcuts(event.payload.paths).catch((err) => console.error("failed to add dropped shortcut", err));
        } else {
          setDragOver(false);
        }
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  async function browse() {
    const selected = await openDialog({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await addShortcuts(paths);
  }

  async function launch(s: Shortcut) {
    try {
      await openTarget(s.target_path);
    } catch (err) {
      console.error("failed to launch shortcut", err);
    }
  }

  async function commitRename() {
    if (renamingId !== null && renameValue.trim()) {
      await renameShortcut(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    await refresh();
  }

  function openMenu(e: React.MouseEvent, id: number) {
    e.preventDefault();
    setMenu({ id, x: e.clientX, y: e.clientY });
  }

  async function useAppIcon(s: Shortcut) {
    setMenu(null);
    await refreshIcon(s.id, s.target_path);
  }

  async function chooseCustomIcon(s: Shortcut) {
    setMenu(null);
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      const dataUrl = await readImageAsDataUrl(selected);
      await updateShortcutIcon(s.id, dataUrl);
      await refresh();
    } catch (err) {
      console.error("failed to set custom icon", err);
    }
  }

  return (
    <WidgetFrame title="Shortcuts">
      <div className={`shortcuts-widget ${dragOver ? "is-drag-over" : ""}`}>
        <div className="shortcuts-widget__grid">
          {shortcuts.map((s) => (
            <div key={s.id} className="shortcuts-widget__tile">
              <button
                className="shortcuts-widget__icon"
                onClick={() => launch(s)}
                onContextMenu={(e) => openMenu(e, s.id)}
                title={s.target_path}
                aria-label={`Launch ${s.label}`}
              >
                {s.icon_data ? (
                  <img className="shortcuts-widget__icon-img" src={s.icon_data} alt="" draggable={false} />
                ) : (
                  s.label.slice(0, 1).toUpperCase() || "?"
                )}
              </button>
              {renamingId === s.id ? (
                <input
                  className="shortcuts-widget__rename-input"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => e.key === "Enter" && commitRename()}
                />
              ) : (
                <span
                  className="shortcuts-widget__label"
                  onDoubleClick={() => {
                    setRenamingId(s.id);
                    setRenameValue(s.label);
                  }}
                >
                  {s.label}
                </span>
              )}
              <button className="shortcuts-widget__delete" onClick={() => deleteShortcut(s.id).then(refresh)} aria-label="Remove">
                ×
              </button>
            </div>
          ))}

          <button className="shortcuts-widget__add-tile" onClick={browse} title="Add a shortcut">
            +
          </button>
        </div>
        <p className="shortcuts-widget__hint">
          Drag files/apps here, or click + to browse. Double-click a name to rename, right-click to change its icon.
        </p>
        {iconWarning && <p className="shortcuts-widget__hint">⚠ {iconWarning}</p>}
      </div>

      {menu &&
        (() => {
          const target = shortcuts.find((s) => s.id === menu.id);
          if (!target) return null;
          return (
            <div
              ref={menuRef}
              className="shortcuts-widget__context-menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
            >
              <button role="menuitem" className="shortcuts-widget__context-menu-item" onClick={() => useAppIcon(target)}>
                Use app icon
              </button>
              <button role="menuitem" className="shortcuts-widget__context-menu-item" onClick={() => chooseCustomIcon(target)}>
                Choose custom icon…
              </button>
            </div>
          );
        })()}
    </WidgetFrame>
  );
}
