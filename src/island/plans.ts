import type { Alarm } from "../storage/alarms";
import type { Countdown } from "../storage/countdowns";
import type { Routine } from "../storage/routines";
import type { TimelineBlock } from "../storage/timeline";
import type { Todo } from "../storage/todos";
import type { CalendarEvent } from "../integrations/calendar/types";
import { dayMatches, localDateIso, minutesOf } from "../core/schedule";

export interface PlanItem {
  key: string;
  /** "HH:MM" for timed items; null for "anytime" to-dos. */
  time: string | null;
  icon: string;
  title: string;
  detail?: string;
  /** Set for to-dos so the island can tick them off. */
  todoId?: number;
  done?: boolean;
}

export interface Plans {
  /** Today's timed items in order, including ones already past. */
  today: PlanItem[];
  /** Open to-dos without a time. */
  anytime: PlanItem[];
  /** The next few countdowns. */
  comingUp: { key: string; title: string; when: string }[];
}

function hhmmOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function daysUntil(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Builds the island's Plans tab: everything happening today, from every
 * widget that knows about time. Pure, so it's tested without a database.
 */
export function buildPlans(
  data: {
    alarms: Alarm[];
    routines: Routine[];
    todos: Todo[];
    timeline: TimelineBlock[];
    events: CalendarEvent[];
    countdowns: Countdown[];
  },
  now: Date,
): Plans {
  const today = localDateIso(now);
  const items: PlanItem[] = [];

  for (const a of data.alarms) {
    if (a.enabled && dayMatches(a.days, now)) {
      items.push({ key: `alarm-${a.id}`, time: a.time, icon: "⏰", title: a.label || "Alarm" });
    }
  }
  for (const r of data.routines) {
    const runsToday = r.run_on_date ? r.run_on_date === today : dayMatches(r.days, now);
    if (r.enabled && runsToday) {
      items.push({ key: `routine-${r.id}`, time: r.time, icon: "🔁", title: r.name, detail: "Routine" });
    }
  }
  for (const b of data.timeline) {
    items.push({
      key: `block-${b.id}`,
      time: b.start_time,
      icon: b.icon || "▪",
      title: b.label,
      detail: b.end_time ? `until ${b.end_time}` : undefined,
    });
  }
  for (const e of data.events) {
    const start = new Date(e.start);
    if (Number.isNaN(start.getTime()) || localDateIso(start) !== today) continue;
    items.push({
      key: `event-${e.id}`,
      time: e.allDay ? "00:00" : hhmmOf(start),
      icon: "📅",
      title: e.title,
      detail: e.allDay ? "All day" : e.location,
    });
  }

  const anytime: PlanItem[] = [];
  for (const t of data.todos) {
    if (t.done) continue;
    const item: PlanItem = { key: `todo-${t.id}`, time: t.due_time, icon: "☐", title: t.text, todoId: t.id, done: t.done };
    if (t.due_time && minutesOf(t.due_time) !== null) items.push(item);
    else anytime.push({ ...item, time: null });
  }

  items.sort((a, b) => (minutesOf(a.time ?? "") ?? 0) - (minutesOf(b.time ?? "") ?? 0));

  const comingUp = data.countdowns
    .map((c) => ({ c, at: new Date(c.target_date) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()) && at.getTime() >= now.getTime())
    .sort((x, y) => x.at.getTime() - y.at.getTime())
    .slice(0, 3)
    .map(({ c, at }) => {
      const d = daysUntil(at, now);
      return { key: `countdown-${c.id}`, title: c.label, when: d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days` };
    });

  return { today: items, anytime, comingUp };
}

/** The next timed item that hasn't started yet, for the collapsed pill. */
export function nextUp(plans: Plans, now: Date): PlanItem | null {
  const current = now.getHours() * 60 + now.getMinutes();
  return plans.today.find((i) => (minutesOf(i.time ?? "") ?? -1) >= current) ?? null;
}
