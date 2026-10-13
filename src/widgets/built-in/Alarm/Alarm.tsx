import { useEffect, useState } from "react";
import { WidgetFrame } from "../../../components/WidgetFrame";
import {
  Alarm as AlarmRecord,
  AlarmSound,
  createAlarm,
  deleteAlarm,
  listAlarms,
  setAlarmEnabled,
} from "../../../storage/alarms";
import { DAY_LABELS } from "../../../core/schedule";
import {
  dismissAlarm,
  isRinging,
  SCHEDULER_EVENT,
  SNOOZE_MINUTES,
  snoozeAlarm,
  subscribeRinging,
} from "../../../core/scheduler";
import { playTone } from "./tones";
import "./Alarm.css";

/**
 * Shows and edits alarms. Firing them is the app-wide scheduler's job
 * (src/core/scheduler.ts), so alarms keep working when this widget is closed.
 */
export function Alarm() {
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [, setRingingVersion] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("07:00");
  const [days, setDays] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState<AlarmSound>(
    (localStorage.getItem("settings:defaultSound") as AlarmSound) || "chime",
  );

  const [dbError, setDbError] = useState(false);

  async function refresh() {
    setAlarms(await listAlarms());
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load alarms", err);
      setDbError(true);
    });
    const onFired = () => void refresh().catch(() => {});
    window.addEventListener(SCHEDULER_EVENT, onFired);
    const unsubscribe = subscribeRinging(() => setRingingVersion((v) => v + 1));
    return () => {
      window.removeEventListener(SCHEDULER_EVENT, onFired);
      unsubscribe();
    };
  }, []);

  async function dismiss(id: number) {
    await dismissAlarm(id);
    await refresh();
  }

  async function snooze(id: number) {
    await snoozeAlarm(id);
    await refresh();
  }

  async function toggleDay(day: string) {
    const next = new Set(days);
    next.has(day) ? next.delete(day) : next.add(day);
    setDays(next);
  }

  async function addAlarm() {
    await createAlarm({ label: label.trim(), time, days: Array.from(days).join(","), sound });
    setLabel("");
    setDays(new Set());
    setShowForm(false);
    await refresh();
  }

  return (
    <WidgetFrame title="Alarms">
      <div className="alarm-widget">
        {dbError && <p className="alarm-widget__hint">⚠ Failed to load alarms. Restart the app to retry.</p>}
        <ul className="alarm-widget__list">
          {alarms.map((a) => (
            <li key={a.id} className={`alarm-widget__item ${isRinging(a.id) ? "is-ringing" : ""}`}>
              {isRinging(a.id) ? (
                <div className="alarm-widget__ringing">
                  <span>
                    ⏰ {a.label || "Alarm"} — {a.time}
                  </span>
                  <div className="alarm-widget__ringing-actions">
                    <button onClick={() => snooze(a.id)}>Snooze {SNOOZE_MINUTES}m</button>
                    <button onClick={() => dismiss(a.id)}>Dismiss</button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => setAlarmEnabled(a.id, e.target.checked).then(refresh)}
                    aria-label="Enabled"
                  />
                  <div className="alarm-widget__info">
                    <span className="alarm-widget__time">{a.time}</span>
                    <span className="alarm-widget__meta">
                      {a.label || "Alarm"}
                      {a.days && ` · ${a.days}`}
                      {a.snoozed_until && ` · snoozed`}
                    </span>
                  </div>
                  <button className="alarm-widget__delete" onClick={() => deleteAlarm(a.id).then(refresh)} aria-label="Delete">
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
          {alarms.length === 0 && <li className="alarm-widget__empty">No alarms set.</li>}
        </ul>

        {showForm ? (
          <div className="alarm-widget__form">
            <div className="alarm-widget__form-row">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="alarm-widget__time-input" />
              <input
                placeholder="Label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="alarm-widget__label-input"
              />
            </div>
            <div className="alarm-widget__days">
              {DAY_LABELS.map((d) => (
                <button
                  key={d}
                  className={`alarm-widget__day ${days.has(d) ? "is-selected" : ""}`}
                  onClick={() => toggleDay(d)}
                >
                  {d[0]}
                </button>
              ))}
            </div>
            <div className="alarm-widget__form-row">
              <select value={sound} onChange={(e) => setSound(e.target.value as AlarmSound)} className="alarm-widget__sound">
                <option value="chime">Chime</option>
                <option value="beep">Beep</option>
                <option value="digital">Digital</option>
              </select>
              <button className="alarm-widget__preview" onClick={() => playTone(sound)}>
                ▶
              </button>
            </div>
            <div className="alarm-widget__form-actions">
              <button onClick={() => setShowForm(false)}>Cancel</button>
              <button className="alarm-widget__btn--primary" onClick={addAlarm}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <button className="alarm-widget__add" onClick={() => setShowForm(true)}>
            + New alarm
          </button>
        )}
      </div>
    </WidgetFrame>
  );
}
