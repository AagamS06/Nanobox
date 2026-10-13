import { describe, expect, it } from "vitest";
import { buildPlans, nextUp } from "../../src/island/plans";
import { pillSummary } from "../../src/island/Island";
import type { Alarm } from "../../src/storage/alarms";
import type { Routine } from "../../src/storage/routines";
import type { Todo } from "../../src/storage/todos";

const NOW = new Date(2026, 9, 14, 12, 0); // Wed 14 Oct 2026, noon

const empty = { alarms: [], routines: [], todos: [], timeline: [], events: [], countdowns: [] };

const alarm = (over: Partial<Alarm>): Alarm => ({
  id: 1, label: "", time: "07:00", days: "", sound: "chime", enabled: true, snoozed_until: null, last_fired_on: null, ...over,
});
const routine = (over: Partial<Routine>): Routine => ({
  id: 1, name: "Routine", time: "09:00", days: "", run_on_date: null, actions: [], enabled: true, last_run_on: null, ...over,
});
const todo = (over: Partial<Todo>): Todo => ({
  id: 1, text: "Thing", due_time: null, done: false, done_at: null, notified_on: null, ...over,
});

describe("buildPlans", () => {
  it("merges every source into one timeline sorted by time", () => {
    const plans = buildPlans(
      {
        ...empty,
        alarms: [alarm({ id: 1, time: "07:00", label: "Wake" })],
        routines: [routine({ id: 2, time: "18:30", name: "Wind down" })],
        todos: [todo({ id: 3, text: "Gym", due_time: "17:00" })],
        timeline: [{ id: 4, label: "Lecture", icon: "🎓", color: "#fff", start_time: "10:00", end_time: "12:00" }],
        events: [
          { id: "e1", sourceId: 1, title: "Dentist", start: new Date(2026, 9, 14, 15, 0).toISOString(), end: "", allDay: false },
          { id: "e2", sourceId: 1, title: "Tomorrow thing", start: new Date(2026, 9, 15, 9, 0).toISOString(), end: "", allDay: false },
        ],
      },
      NOW,
    );
    expect(plans.today.map((i) => i.title)).toEqual(["Wake", "Lecture", "Dentist", "Gym", "Wind down"]);
  });

  it("only includes alarms and routines that apply today", () => {
    const plans = buildPlans(
      {
        ...empty,
        alarms: [alarm({ id: 1, days: "Sat" }), alarm({ id: 2, enabled: false }), alarm({ id: 3, days: "Wed", label: "Yes" })],
        routines: [
          routine({ id: 1, run_on_date: "2026-10-20", name: "Later" }),
          routine({ id: 2, run_on_date: "2026-10-14", name: "One-off today" }),
        ],
      },
      NOW,
    );
    expect(plans.today.map((i) => i.title)).toEqual(["Yes", "One-off today"]);
  });

  it("puts untimed open to-dos under anytime and drops finished ones", () => {
    const plans = buildPlans({ ...empty, todos: [todo({ id: 1, text: "Call Mom" }), todo({ id: 2, text: "Done", done: true })] }, NOW);
    expect(plans.anytime.map((i) => i.title)).toEqual(["Call Mom"]);
    expect(plans.anytime[0].todoId).toBe(1);
    expect(plans.today).toEqual([]);
  });

  it("lists the next three upcoming countdowns", () => {
    const plans = buildPlans(
      {
        ...empty,
        countdowns: [
          { id: 1, label: "Past", target_date: new Date(2026, 9, 1).toISOString() },
          { id: 2, label: "Finals", target_date: new Date(2026, 10, 20).toISOString() },
          { id: 3, label: "Tomorrow", target_date: new Date(2026, 9, 15, 9).toISOString() },
          { id: 4, label: "Trip", target_date: new Date(2026, 11, 1).toISOString() },
          { id: 5, label: "Far", target_date: new Date(2027, 5, 1).toISOString() },
        ],
      },
      NOW,
    );
    expect(plans.comingUp.map((c) => [c.title, c.when])).toEqual([
      ["Tomorrow", "Tomorrow"],
      ["Finals", "in 37 days"],
      ["Trip", "in 48 days"],
    ]);
  });
});

describe("nextUp and the pill", () => {
  const plans = buildPlans(
    { ...empty, alarms: [alarm({ time: "07:00", label: "Wake" })], todos: [todo({ text: "Gym", due_time: "17:00" })] },
    NOW,
  );

  it("finds the next item that hasn't started", () => {
    expect(nextUp(plans, NOW)?.title).toBe("Gym");
    expect(nextUp(plans, new Date(2026, 9, 14, 18, 0))).toBeNull();
  });

  it("shows the song when music is playing, otherwise what's next, otherwise the date", () => {
    const song = { provider: "system" as const, isPlaying: true, trackTitle: "Song", artist: "Artist" };
    expect(pillSummary(song, null, NOW)).toBe("♪ Song – Artist");
    expect(pillSummary({ ...song, isPlaying: false }, nextUp(plans, NOW), NOW)).toMatch(/^Next: Gym · 5:00/);
    expect(pillSummary(null, null, NOW)).toMatch(/14/);
  });
});
