import { useEffect, useState } from "react";
import { WidgetFrame } from "../../../components/WidgetFrame";
import {
  createReminder,
  deleteReminder,
  listReminders,
  markReminderFired,
  Reminder,
  setReminderEnabled,
} from "../../../storage/reminders";
import { SCHEDULER_EVENT } from "../../../core/scheduler";
import "./GentleReminders.css";

const INTERVAL_PRESETS = [15, 30, 45, 60, 90];

/**
 * Sprout/Finch-style interval nudges — repeats every N minutes, not tied to a
 * clock time (that's the Alarm widget). The nudges themselves are sent by the
 * app-wide scheduler (src/core/scheduler.ts), so they keep coming when this
 * widget is closed.
 */
export function GentleReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [interval, setIntervalMinutes] = useState(45);

  const [dbError, setDbError] = useState(false);

  async function refresh() {
    setReminders(await listReminders());
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load reminders", err);
      setDbError(true);
    });
  }, []);

  useEffect(() => {
    const onFired = () => void refresh().catch(() => {});
    window.addEventListener(SCHEDULER_EVENT, onFired);
    return () => window.removeEventListener(SCHEDULER_EVENT, onFired);
  }, []);

  async function add() {
    if (!label.trim()) return;
    await createReminder(label.trim(), interval);
    const created = await listReminders();
    const newest = created[created.length - 1];
    if (newest) await markReminderFired(newest.id, new Date().toISOString());
    setLabel("");
    setShowForm(false);
    await refresh();
  }

  return (
    <WidgetFrame title="Gentle Reminders">
      <div className="reminders-widget">
        {dbError && <p className="reminders-widget__hint">⚠ Failed to load reminders. Restart the app to retry.</p>}
        <ul className="reminders-widget__list">
          {reminders.map((r) => (
            <li key={r.id} className="reminders-widget__item">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => setReminderEnabled(r.id, e.target.checked).then(refresh)}
                aria-label="Enabled"
              />
              <div className="reminders-widget__info">
                <span className="reminders-widget__label">{r.label}</span>
                <span className="reminders-widget__meta">every {r.interval_minutes}m</span>
              </div>
              <button className="reminders-widget__delete" onClick={() => deleteReminder(r.id).then(refresh)} aria-label="Delete">
                ×
              </button>
            </li>
          ))}
          {reminders.length === 0 && <li className="reminders-widget__empty">No gentle nudges set.</li>}
        </ul>

        {showForm ? (
          <div className="reminders-widget__form">
            <input
              placeholder="e.g. Drink water"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
            <div className="reminders-widget__presets">
              {INTERVAL_PRESETS.map((m) => (
                <button
                  key={m}
                  className={interval === m ? "is-active" : ""}
                  onClick={() => setIntervalMinutes(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            <div className="reminders-widget__form-actions">
              <button onClick={() => setShowForm(false)}>Cancel</button>
              <button className="reminders-widget__btn--primary" onClick={add}>
                Add
              </button>
            </div>
          </div>
        ) : (
          <button className="reminders-widget__add" onClick={() => setShowForm(true)}>
            + New reminder
          </button>
        )}
      </div>
    </WidgetFrame>
  );
}
