import { useEffect, useState } from "react";
import { WidgetFrame } from "../../../components/WidgetFrame";
import { BRAIN_DUMP_CHANGED_EVENT } from "../../../core/crossWindow";
import { BrainDumpEntry, createBrainDumpEntry, deleteBrainDumpEntry, listBrainDumpEntries } from "../../../storage/brainDump";
import "./BrainDump.css";

/** Near-zero-friction capture: type, hit Enter, done. No title, no dialog — write it down before you lose it. */
export function BrainDump() {
  const [entries, setEntries] = useState<BrainDumpEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [dbError, setDbError] = useState(false);

  async function refresh() {
    setEntries(await listBrainDumpEntries());
  }

  useEffect(() => {
    // The island's quick-capture box adds entries from the other window.
    const onChanged = () => void refresh().catch(() => {});
    window.addEventListener(BRAIN_DUMP_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BRAIN_DUMP_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load brain dump", err);
      setDbError(true);
    });
  }, []);

  async function capture() {
    if (!draft.trim()) return;
    await createBrainDumpEntry(draft.trim());
    setDraft("");
    await refresh();
  }

  return (
    <WidgetFrame title="Brain Dump">
      <div className="braindump-widget">
        {dbError && <p className="braindump-widget__empty">⚠ Failed to load entries. Restart the app to retry.</p>}
        <input
          className="braindump-widget__input"
          placeholder="Type it, hit Enter…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && capture()}
          autoFocus
        />
        <ul className="braindump-widget__list">
          {entries.map((e) => (
            <li key={e.id} className="braindump-widget__item">
              <span>{e.text}</span>
              <button onClick={() => deleteBrainDumpEntry(e.id).then(refresh)} aria-label="Delete">
                ×
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="braindump-widget__empty">Nothing captured yet.</li>}
        </ul>
      </div>
    </WidgetFrame>
  );
}
