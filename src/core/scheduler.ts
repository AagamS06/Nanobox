import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { Alarm, AlarmSound, listAlarms, markAlarmFired, snoozeAlarm as snoozeAlarmRecord } from "../storage/alarms";
import { listReminders, markReminderFired } from "../storage/reminders";
import { listRoutines, markRoutineRun, Routine } from "../storage/routines";
import { listTodos, markTodoNotified } from "../storage/todos";
import { playTone } from "../widgets/built-in/Alarm/tones";
import { openTarget, targetLabel } from "./launcher";
import { isDue, isReminderDue, localDateIso } from "./schedule";

/**
 * The one place Nanobox checks the clock. Runs in the main window for as long
 * as the app is open — independent of which widgets are on the desktop.
 *
 * Before this existed, alarms and gentle reminders were checked inside their
 * own widgets, so closing the Alarms widget silently stopped every alarm.
 * Widgets now only *show* state; this module fires things.
 */

const TICK_MS = 15_000;
export const SNOOZE_MINUTES = 5;
/** A ringing alarm nobody answers stops ringing (and counts as fired) after this. */
const AUTO_DISMISS_MS = 10 * 60_000;

/** Window event widgets listen to so they can refresh after the scheduler acts. */
export const SCHEDULER_EVENT = "nanobox:scheduler-fired";

type Listener = () => void;

const ringing = new Map<number, { alarm: Alarm; since: number }>();
const ringingListeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

function notifyRingingChanged() {
  ringingListeners.forEach((l) => l());
}

function announce(kind: string) {
  window.dispatchEvent(new CustomEvent(SCHEDULER_EVENT, { detail: { kind } }));
}

function notify(title: string, body: string) {
  try {
    sendNotification({ title, body });
  } catch (err) {
    console.error("notification failed", err);
  }
}

export function getRingingAlarms(): Alarm[] {
  return [...ringing.values()].map((r) => r.alarm);
}

export function isRinging(id: number): boolean {
  return ringing.has(id);
}

export function subscribeRinging(listener: Listener): () => void {
  ringingListeners.add(listener);
  return () => ringingListeners.delete(listener);
}

function ring(alarm: Alarm, now: Date) {
  ringing.set(alarm.id, { alarm, since: now.getTime() });
  notifyRingingChanged();
  playTone(alarm.sound as AlarmSound);
  notify(alarm.label || "Nanobox alarm", alarm.time);
  announce("alarm");
}

export async function dismissAlarm(id: number): Promise<void> {
  ringing.delete(id);
  notifyRingingChanged();
  await markAlarmFired(id, localDateIso(new Date()));
  announce("alarm");
}

export async function snoozeAlarm(id: number): Promise<void> {
  ringing.delete(id);
  notifyRingingChanged();
  await snoozeAlarmRecord(id, new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString());
  announce("alarm");
}

/**
 * Runs every action in a routine, then posts one notification saying what it
 * did — including anything that failed, so a routine never fails silently.
 */
export async function runRoutine(routine: Routine): Promise<{ opened: string[]; failed: string[] }> {
  const opened: string[] = [];
  const failed: string[] = [];
  const messages: string[] = [];
  for (const action of routine.actions) {
    if (action.type === "open") {
      const name = action.label || targetLabel(action.target);
      try {
        await openTarget(action.target);
        opened.push(name);
      } catch (err) {
        console.error("routine action failed", action, err);
        failed.push(name);
      }
    } else if (action.type === "notify") {
      messages.push(action.text);
    }
  }
  const parts = [...messages];
  if (opened.length) parts.push(`Opened ${opened.join(", ")}.`);
  if (failed.length) parts.push(`Couldn't open ${failed.join(", ")}.`);
  notify(routine.name || "Routine", parts.join(" ") || "Done.");
  return { opened, failed };
}

async function checkAlarms(now: Date) {
  for (const alarm of await listAlarms()) {
    if (!alarm.enabled || ringing.has(alarm.id)) continue;
    if (alarm.snoozed_until) {
      if (new Date(alarm.snoozed_until) <= now) ring(alarm, now);
      continue;
    }
    if (isDue({ time: alarm.time, days: alarm.days, lastRunOn: alarm.last_fired_on }, now)) ring(alarm, now);
  }
  for (const [id, r] of ringing) {
    if (now.getTime() - r.since > AUTO_DISMISS_MS) await dismissAlarm(id);
  }
}

async function checkReminders(now: Date) {
  for (const r of await listReminders()) {
    if (!r.enabled || !isReminderDue(r.last_fired_at, r.interval_minutes, now)) continue;
    notify("Nanobox", r.label);
    playTone("beep");
    await markReminderFired(r.id, now.toISOString());
    announce("reminder");
  }
}

async function checkRoutines(now: Date) {
  for (const routine of await listRoutines()) {
    if (!routine.enabled) continue;
    const schedule = { time: routine.time, days: routine.days, onDate: routine.run_on_date, lastRunOn: routine.last_run_on };
    if (!isDue(schedule, now)) continue;
    // Mark first so a slow app launch can't make the next tick run it twice.
    await markRoutineRun(routine.id, localDateIso(now));
    await runRoutine(routine);
    announce("routine");
  }
}

async function checkTodos(now: Date) {
  for (const todo of await listTodos()) {
    if (todo.done || !todo.due_time) continue;
    if (!isDue({ time: todo.due_time, days: "", lastRunOn: todo.notified_on }, now)) continue;
    await markTodoNotified(todo.id, localDateIso(now));
    notify("To-do", todo.text);
    playTone("chime");
    announce("todo");
  }
}

/** One pass over everything. Exported for tests. */
export async function tick(now = new Date()): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Each check is independent: a broken row in one table can't stop the others.
    for (const check of [checkAlarms, checkReminders, checkRoutines, checkTodos]) {
      try {
        await check(now);
      } catch (err) {
        console.error(`scheduler: ${check.name} failed`, err);
      }
    }
  } finally {
    ticking = false;
  }
}

/** Starts the scheduler once per app session. Returns a stop function. */
export function startScheduler(): () => void {
  if (!timer) {
    isPermissionGranted()
      .then((granted) => (granted ? undefined : requestPermission()))
      .catch(() => {});
    void tick();
    timer = setInterval(() => void tick(), TICK_MS);
  }
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
