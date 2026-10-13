/**
 * Pure "is it time yet?" rules shared by the app-wide scheduler (alarms,
 * routines, to-dos). No I/O here, so it's easy to test.
 *
 * Everything uses the computer's *local* date and time. (The old alarm code
 * stored UTC dates, which in Sydney meant "today" flipped at 11 am.)
 */

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** How late something may still fire, e.g. after the computer wakes from sleep. */
export const GRACE_MINUTES = 5;

/** "YYYY-MM-DD" in local time. */
export function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "HH:MM" (24 h) → minutes since midnight, or null if malformed. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Empty `days` means every day; otherwise a comma list like "Mon,Wed,Fri". */
export function dayMatches(days: string, date: Date): boolean {
  if (!days.trim()) return true;
  return days.split(",").map((d) => d.trim()).includes(DAY_LABELS[date.getDay()]);
}

export interface Schedule {
  /** "HH:MM" */
  time: string;
  /** Comma list of weekday labels; empty = every day. Ignored when `onDate` is set. */
  days: string;
  /** "YYYY-MM-DD" for a one-off; null for repeating. */
  onDate?: string | null;
  /** Local date it last fired, "YYYY-MM-DD". */
  lastRunOn: string | null;
}

/**
 * True when `now` is at or up to GRACE_MINUTES after the scheduled time, on a
 * matching day, and it hasn't already fired today. The grace window means a
 * scheduler tick that lands a few seconds late — or a laptop waking just after
 * the minute — still fires, but opening Nanobox at lunchtime doesn't replay
 * the morning's routines.
 */
export function isDue(schedule: Schedule, now: Date, graceMinutes = GRACE_MINUTES): boolean {
  const target = minutesOf(schedule.time);
  if (target === null) return false;
  const today = localDateIso(now);
  if (schedule.lastRunOn === today) return false;
  if (schedule.onDate) {
    if (schedule.onDate !== today) return false;
  } else if (!dayMatches(schedule.days, now)) {
    return false;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= target && current - target <= graceMinutes;
}

/** True once a one-off schedule's date and time have both passed. */
export function isExpiredOneOff(schedule: Schedule, now: Date): boolean {
  if (!schedule.onDate) return false;
  const today = localDateIso(now);
  if (schedule.onDate < today) return true;
  if (schedule.onDate > today) return false;
  const target = minutesOf(schedule.time);
  return target !== null && now.getHours() * 60 + now.getMinutes() > target + GRACE_MINUTES;
}

/** Interval reminders: due once `intervalMinutes` have passed since the last nudge. */
export function isReminderDue(lastFiredAt: string | null, intervalMinutes: number, now: Date): boolean {
  if (!lastFiredAt) return false;
  const last = new Date(lastFiredAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last >= intervalMinutes * 60_000;
}

/** Human summary for a schedule, e.g. "9:00 · Weekdays", "07:30 · Every day", "11:00 · 10 Nov". */
export function describeSchedule(time: string, days: string, onDate?: string | null): string {
  if (onDate) {
    const [y, m, d] = onDate.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${time} · ${label}`;
  }
  const set = new Set(days.split(",").map((s) => s.trim()).filter(Boolean));
  if (set.size === 0 || set.size === 7) return `${time} · Every day`;
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  if (set.size === 5 && weekdays.every((d) => set.has(d))) return `${time} · Weekdays`;
  if (set.size === 2 && set.has("Sat") && set.has("Sun")) return `${time} · Weekends`;
  return `${time} · ${DAY_LABELS.filter((d) => set.has(d)).join(", ")}`;
}
