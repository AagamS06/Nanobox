import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ClipItem {
  id: number;
  text: string;
  copiedAt: number;
}

const CHANGED_EVENT = "clipboard-history-changed";

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

/**
 * Recent copied text. Kept in memory only (gone when Nanobox quits), and
 * anything copied from a password manager is never recorded — see
 * src-tauri/src/clipboard.rs.
 */
export function ClipboardTab() {
  const [items, setItems] = useState<ClipItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    invoke<ClipItem[]>("clipboard_history").then(setItems).catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    refresh();
    invoke<boolean>("clipboard_is_paused").then(setPaused).catch(() => {});
    const unlisten = listen(CHANGED_EVENT, refresh);
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [refresh]);

  async function copy(id: number) {
    await invoke("clipboard_copy", { id });
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  }

  async function togglePause() {
    const next = !paused;
    await invoke("clipboard_set_paused", { paused: next });
    setPaused(next);
  }

  const now = Date.now();

  return (
    <div className="island-clipboard">
      <div className="island-toolbar">
        <span className="island-muted">Memory only · password managers skipped</span>
        <button className="island-btn" onClick={togglePause} aria-pressed={paused}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="island-btn" onClick={() => invoke("clipboard_clear")} disabled={items.length === 0}>
          Clear
        </button>
      </div>
      {paused && <p className="island-notice">Paused — new copies aren't being recorded.</p>}
      {items.length === 0 ? (
        <div className="island-empty">
          <p>Nothing copied yet.</p>
          <p className="island-muted">Text you copy anywhere shows up here. Click an item to copy it again.</p>
        </div>
      ) : (
        <ul className="island-list">
          {items.map((item) => (
            <li key={item.id} className="island-clip">
              <button className="island-clip__body" onClick={() => copy(item.id)} title="Copy again">
                <span className="island-clip__text">{item.text}</span>
                <span className="island-muted island-clip__meta">{copiedId === item.id ? "Copied ✓" : ago(item.copiedAt, now)}</span>
              </button>
              <button className="island-x" onClick={() => invoke("clipboard_remove", { id: item.id })} aria-label="Remove from history">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
