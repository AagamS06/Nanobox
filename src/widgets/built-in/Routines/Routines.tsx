import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { WidgetFrame } from "../../../components/WidgetFrame";
import { ModeSwitch } from "../../../components/ModeSwitch";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  Routine,
  RoutineAction,
  setRoutineEnabled,
} from "../../../storage/routines";
import { DAY_LABELS, describeSchedule, isExpiredOneOff, localDateIso } from "../../../core/schedule";
import { runRoutine, SCHEDULER_EVENT } from "../../../core/scheduler";
import { isWebLink, targetLabel } from "../../../core/launcher";
import "./Routines.css";

type RepeatMode = "repeat" | "once";
const REPEAT_OPTIONS = [
  { value: "repeat", label: "Repeat" },
  { value: "once", label: "Once" },
] as const;

export function summariseActions(actions: RoutineAction[]): string {
  const opens = actions.filter((a) => a.type === "open").map((a) => (a.type === "open" ? a.label || targetLabel(a.target) : ""));
  const hasMessage = actions.some((a) => a.type === "notify");
  const parts: string[] = [];
  if (opens.length) parts.push(`Opens ${opens.join(", ")}`);
  if (hasMessage) parts.push("shows a message");
  return parts.join(" · ") || "Does nothing yet";
}

/**
 * "Every morning at 9, open Spotify and my notes." Routines open apps, files,
 * folders or links and/or show a message at a set time — repeating on chosen
 * days, or once on a date. The app-wide scheduler runs them whether or not
 * this widget is open, then posts a notification saying what it did.
 */
export function Routines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [dbError, setDbError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [ranId, setRanId] = useState<number | null>(null);

  // form state
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [mode, setMode] = useState<RepeatMode>("repeat");
  const [days, setDays] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(localDateIso(new Date()));
  const [targets, setTargets] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    setRoutines(await listRoutines());
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load routines", err);
      setDbError(true);
    });
    const onFired = () => void refresh().catch(() => {});
    window.addEventListener(SCHEDULER_EVENT, onFired);
    return () => window.removeEventListener(SCHEDULER_EVENT, onFired);
  }, []);

  function resetForm() {
    setName("");
    setTime("09:00");
    setMode("repeat");
    setDays(new Set());
    setDate(localDateIso(new Date()));
    setTargets([]);
    setLink("");
    setMessage("");
    setFormError(null);
  }

  function toggleDay(day: string) {
    const next = new Set(days);
    next.has(day) ? next.delete(day) : next.add(day);
    setDays(next);
  }

  async function pickFile() {
    const picked = await openDialog({ multiple: true, directory: false, title: "Choose apps or files to open" });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    setTargets((prev) => [...prev, ...list.filter((p) => !prev.includes(p))]);
  }

  function addLink() {
    let url = link.trim();
    if (!url) return;
    if (!isWebLink(url)) url = `https://${url}`;
    setTargets((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setLink("");
  }

  async function save() {
    const actions: RoutineAction[] = targets.map((target) => ({ type: "open", target }));
    if (message.trim()) actions.push({ type: "notify", text: message.trim() });
    if (!name.trim()) return setFormError("Give it a name.");
    if (actions.length === 0) return setFormError("Add something to open, or a message.");
    await createRoutine({
      name: name.trim(),
      time,
      days: mode === "repeat" ? DAY_LABELS.filter((d) => days.has(d)).join(",") : "",
      run_on_date: mode === "once" ? date : null,
      actions,
    });
    resetForm();
    setShowForm(false);
    await refresh();
  }

  async function runNow(r: Routine) {
    setRanId(r.id);
    await runRoutine(r);
    setTimeout(() => setRanId((id) => (id === r.id ? null : id)), 2000);
  }

  return (
    <WidgetFrame title="Routines">
      <div className="routines-widget">
        {dbError && <p className="routines-widget__empty">⚠ Failed to load routines. Restart the app to retry.</p>}

        {!showForm && (
          <ul className="routines-widget__list">
            {routines.map((r) => {
              const past = isExpiredOneOff({ time: r.time, days: r.days, onDate: r.run_on_date, lastRunOn: r.last_run_on }, new Date());
              return (
              <li key={r.id} className={`routines-widget__item ${r.enabled && !past ? "" : "is-off"}`}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => setRoutineEnabled(r.id, e.target.checked).then(refresh)}
                  aria-label={`${r.name} enabled`}
                />
                <div className="routines-widget__info">
                  <span className="routines-widget__name">{r.name}</span>
                  <span className="routines-widget__meta">
                    {describeSchedule(r.time, r.days, r.run_on_date)}
                    {past && " · finished"}
                  </span>
                  <span className="routines-widget__meta">{summariseActions(r.actions)}</span>
                </div>
                <button
                  className="routines-widget__icon-btn"
                  onClick={() => runNow(r)}
                  aria-label={`Run ${r.name} now`}
                  title="Run now"
                >
                  {ranId === r.id ? "✓" : "▶"}
                </button>
                <button
                  className="routines-widget__icon-btn"
                  onClick={() => deleteRoutine(r.id).then(refresh)}
                  aria-label={`Delete ${r.name}`}
                  title="Delete"
                >
                  ×
                </button>
              </li>
              );
            })}
            {routines.length === 0 && !dbError && (
              <li className="routines-widget__empty">
                No routines yet. Try “Every weekday at 9:00, open my study apps”.
              </li>
            )}
          </ul>
        )}

        {showForm ? (
          <div className="routines-widget__form" data-no-drag>
            <input
              className="routines-widget__input"
              placeholder="Name, e.g. Morning setup"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Routine name"
              autoFocus
            />
            <div className="routines-widget__row">
              <input
                className="routines-widget__input routines-widget__input--time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Time"
              />
              <ModeSwitch label="How often" options={REPEAT_OPTIONS} value={mode} onChange={setMode} />
            </div>
            {mode === "repeat" ? (
              <div className="routines-widget__days" role="group" aria-label="Days (none selected means every day)">
                {DAY_LABELS.map((d) => (
                  <button
                    key={d}
                    className={`routines-widget__day ${days.has(d) ? "is-selected" : ""}`}
                    onClick={() => toggleDay(d)}
                    aria-pressed={days.has(d)}
                    aria-label={d}
                  >
                    {d[0]}
                  </button>
                ))}
                <span className="routines-widget__hint">{days.size === 0 ? "Every day" : ""}</span>
              </div>
            ) : (
              <input
                className="routines-widget__input"
                type="date"
                value={date}
                min={localDateIso(new Date())}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
              />
            )}

            <div className="routines-widget__label">Open</div>
            {targets.length > 0 && (
              <ul className="routines-widget__targets">
                {targets.map((t) => (
                  <li key={t}>
                    <span title={t}>{isWebLink(t) ? "🔗" : "📄"} {targetLabel(t)}</span>
                    <button
                      onClick={() => setTargets((prev) => prev.filter((x) => x !== t))}
                      aria-label={`Remove ${targetLabel(t)}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="routines-widget__row">
              <button className="routines-widget__chip" onClick={pickFile}>
                + App or file
              </button>
              <input
                className="routines-widget__input"
                placeholder="or paste a link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLink()}
                aria-label="Link to open"
              />
              <button className="routines-widget__chip" onClick={addLink} disabled={!link.trim()}>
                Add
              </button>
            </div>
            <input
              className="routines-widget__input"
              placeholder="Message to show (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-label="Message to show"
            />
            {formError && <p className="routines-widget__error">{formError}</p>}
            <div className="routines-widget__actions">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
              <button className="routines-widget__btn--primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <button className="routines-widget__add" onClick={() => setShowForm(true)}>
            + New routine
          </button>
        )}
      </div>
    </WidgetFrame>
  );
}
