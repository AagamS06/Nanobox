import { useEffect, useState } from "react";
import { getBlockProgram, listBlockPrograms, BlockProgramRow } from "../../../storage/blockPrograms";
import { evaluateProgram } from "../../../integrations/blockEngine/evaluator";
import { initBlockLibrary } from "../../../integrations/blockEngine/blockLibrary";
import { liveBridge } from "../../../integrations/blockEngine/bridge";
import { ensureCustomBlockDefsLoaded } from "../../../integrations/blockEngine/customBlockLoader";
import type { BlockProgram } from "../../../integrations/blockEngine/types";
import { DEFAULT_BLOCK_INTERVAL_MS, type BlockWidgetConfig } from "../CustomWidget/settings";
import "./BlockWidget.css";

// Registers all built-in block defs once. Safe to call from more than one
// entry point (BlockBuilder does the same) — it just re-populates a Map.
initBlockLibrary();

const INTERVAL_PRESETS: Array<{ label: string; ms: number }> = [
  { label: "5s", ms: 5_000 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
];

const DEFAULT_CONFIG: BlockWidgetConfig = { programId: null, intervalMs: DEFAULT_BLOCK_INTERVAL_MS };

function renderValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface BlockWidgetProps {
  /** Saved config, or null if this widget has never been saved in Block mode. */
  config: BlockWidgetConfig | null;
  onSave: (config: BlockWidgetConfig) => Promise<void>;
  /** Reports the running program's name so the Custom Widget can use it as its title. */
  onProgramName?: (name: string | null) => void;
}

/**
 * Runs a saved block-engine program (built in the 🧩 Block Builder) as a
 * live desktop widget: re-evaluates it against `liveBridge` on an interval
 * and shows the root node's value. Closes the loop from "build a program"
 * to "use it" — see ROADMAP.md Milestone 7. This is the Block mode of the
 * Custom Widget and renders inside its frame — see CustomWidget.tsx.
 */
export function BlockWidget({ config: saved, onSave, onProgramName }: BlockWidgetProps) {
  const config = saved ?? DEFAULT_CONFIG;
  const [editing, setEditing] = useState(saved === null);
  const [programs, setPrograms] = useState<BlockProgramRow[]>([]);
  const [draftProgramId, setDraftProgramId] = useState<number | null>(config.programId);
  const [draftIntervalMs, setDraftIntervalMs] = useState(config.intervalMs);
  const [programName, setProgramName] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok"; value: unknown } | { kind: "error"; message: string } | null>(
    null,
  );

  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    onProgramName?.(programName);
  }, [programName, onProgramName]);

  useEffect(() => {
    listBlockPrograms()
      .then(setPrograms)
      .catch((err) => {
        console.error("failed to list block programs", err);
        setDbError(true);
      });
  }, []);

  // Re-fetches the program on every tick (not just once) so edits made in the
  // Block Builder after this widget was configured show up without having to
  // recreate the widget — the same "read from the DB, no caching" approach
  // every other storage-backed widget here already uses.
  useEffect(() => {
    if (config.programId === null) {
      setResult(null);
      setProgramName(null);
      return;
    }

    let cancelled = false;

    async function tick() {
      try {
        const row = await getBlockProgram(config.programId!);
        if (cancelled) return;
        if (!row) {
          setResult({ kind: "error", message: "This program was deleted." });
          setProgramName(null);
          return;
        }
        setProgramName(row.name);
        const program = JSON.parse(row.program_json) as BlockProgram;
        // Programs may use the user's own custom blocks, which have to be
        // registered before they can be validated or run.
        await ensureCustomBlockDefsLoaded().catch((err) => console.error("failed to load custom blocks", err));
        const evalResult = await evaluateProgram(program, liveBridge);
        if (cancelled) return;
        setResult(
          evalResult.success
            ? { kind: "ok", value: evalResult.value }
            : { kind: "error", message: evalResult.error ?? "Evaluation failed." },
        );
      } catch (err) {
        if (cancelled) return;
        setResult({ kind: "error", message: err instanceof Error ? err.message : "Evaluation failed." });
      }
    }

    tick();
    const id = setInterval(tick, config.intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [config.programId, config.intervalMs]);

  function startEditing() {
    setDraftProgramId(config.programId);
    setDraftIntervalMs(config.intervalMs);
    setEditing(true);
  }

  async function save() {
    if (draftProgramId === null) return;
    await onSave({ programId: draftProgramId, intervalMs: draftIntervalMs });
    setEditing(false);
  }

  return (
    <div className="block-widget">
      {dbError && <p className="block-widget__hint">⚠ Failed to load programs. Restart the app to retry.</p>}
      {editing ? (
        <div className="block-widget__editor" data-no-drag>
          <label>
            Program
            <select
              value={draftProgramId ?? ""}
              onChange={(e) => setDraftProgramId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a saved program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Refresh every
            <select value={draftIntervalMs} onChange={(e) => setDraftIntervalMs(Number(e.target.value))}>
              {INTERVAL_PRESETS.map((p) => (
                <option key={p.ms} value={p.ms}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {programs.length === 0 && (
            <p className="block-widget__hint">
              No saved programs yet — build one in the 🧩 Block Builder first.
            </p>
          )}
          <div className="block-widget__actions">
            <button onClick={() => setEditing(false)}>Cancel</button>
            <button className="block-widget__save" onClick={save} disabled={draftProgramId === null}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="block-widget__view" data-no-drag>
          {config.programId === null ? (
            <p className="block-widget__empty">No program selected.</p>
          ) : result?.kind === "error" ? (
            <p className="block-widget__error">{result.message}</p>
          ) : (
            <p className="block-widget__value">{renderValue(result?.value)}</p>
          )}
          <button className="block-widget__edit" onClick={startEditing}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
