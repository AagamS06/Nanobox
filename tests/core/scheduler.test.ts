import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alarm } from "../../src/storage/alarms";
import type { Routine } from "../../src/storage/routines";
import type { Todo } from "../../src/storage/todos";
import type { Reminder } from "../../src/storage/reminders";

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: vi.fn(),
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn(),
}));
vi.mock("../../src/widgets/built-in/Alarm/tones", () => ({ playTone: vi.fn() }));
vi.mock("../../src/core/launcher", async (orig) => ({
  ...(await orig<typeof import("../../src/core/launcher")>()),
  openTarget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/storage/alarms", () => ({ listAlarms: vi.fn(), markAlarmFired: vi.fn(), snoozeAlarm: vi.fn() }));
vi.mock("../../src/storage/reminders", () => ({ listReminders: vi.fn(), markReminderFired: vi.fn() }));
vi.mock("../../src/storage/routines", () => ({ listRoutines: vi.fn(), markRoutineRun: vi.fn() }));
vi.mock("../../src/storage/todos", () => ({ listTodos: vi.fn(), markTodoNotified: vi.fn() }));

import { sendNotification } from "@tauri-apps/plugin-notification";
import { openTarget } from "../../src/core/launcher";
import { listAlarms, markAlarmFired, snoozeAlarm as snoozeRecord } from "../../src/storage/alarms";
import { listReminders, markReminderFired } from "../../src/storage/reminders";
import { listRoutines, markRoutineRun } from "../../src/storage/routines";
import { listTodos, markTodoNotified } from "../../src/storage/todos";
import { dismissAlarm, getRingingAlarms, runRoutine, snoozeAlarm, tick } from "../../src/core/scheduler";

const NINE = new Date(2026, 9, 14, 9, 0, 10); // Wed 14 Oct 2026, 09:00:10

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 1,
  label: "Wake up",
  time: "09:00",
  days: "",
  sound: "chime",
  enabled: true,
  snoozed_until: null,
  last_fired_on: null,
  ...over,
});

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 7,
  name: "Morning setup",
  time: "09:00",
  days: "",
  run_on_date: null,
  actions: [
    { type: "open", target: "C:\\Apps\\Spotify.exe" },
    { type: "open", target: "https://example.com/plan" },
    { type: "notify", text: "Good morning!" },
  ],
  enabled: true,
  last_run_on: null,
  ...over,
});

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 3,
  text: "Gym",
  due_time: "09:00",
  done: false,
  done_at: null,
  notified_on: null,
  ...over,
});

describe("scheduler", () => {
  beforeEach(() => {
    vi.mocked(listAlarms).mockResolvedValue([]);
    vi.mocked(listReminders).mockResolvedValue([]);
    vi.mocked(listRoutines).mockResolvedValue([]);
    vi.mocked(listTodos).mockResolvedValue([]);
  });

  afterEach(async () => {
    for (const a of getRingingAlarms()) await dismissAlarm(a.id);
    vi.clearAllMocks();
  });

  it("rings a due alarm even with no Alarms widget open, and only once", async () => {
    vi.mocked(listAlarms).mockResolvedValue([alarm()]);
    await tick(NINE);
    await tick(NINE);
    expect(getRingingAlarms().map((a) => a.id)).toEqual([1]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith({ title: "Wake up", body: "09:00" });
  });

  it("dismiss marks the alarm fired for today's local date", async () => {
    vi.mocked(listAlarms).mockResolvedValue([alarm()]);
    await tick(NINE);
    await dismissAlarm(1);
    expect(getRingingAlarms()).toEqual([]);
    expect(markAlarmFired).toHaveBeenCalledWith(1, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("snooze stores a time five minutes ahead", async () => {
    vi.mocked(listAlarms).mockResolvedValue([alarm()]);
    await tick(NINE);
    const before = Date.now();
    await snoozeAlarm(1);
    const until = new Date(vi.mocked(snoozeRecord).mock.calls[0][1]).getTime();
    expect(until - before).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(getRingingAlarms()).toEqual([]);
  });

  it("rings a snoozed alarm when the snooze runs out", async () => {
    vi.mocked(listAlarms).mockResolvedValue([alarm({ time: "07:00", snoozed_until: new Date(2026, 9, 14, 8, 59).toISOString() })]);
    await tick(NINE);
    expect(getRingingAlarms()).toHaveLength(1);
  });

  it("skips disabled and already-fired alarms", async () => {
    vi.mocked(listAlarms).mockResolvedValue([alarm({ enabled: false }), alarm({ id: 2, last_fired_on: "2026-10-14" })]);
    await tick(NINE);
    expect(getRingingAlarms()).toEqual([]);
  });

  it("runs a due routine: marks it first, opens everything, reports what it did", async () => {
    vi.mocked(listRoutines).mockResolvedValue([routine()]);
    await tick(NINE);
    expect(markRoutineRun).toHaveBeenCalledWith(7, "2026-10-14");
    expect(openTarget).toHaveBeenCalledWith("C:\\Apps\\Spotify.exe");
    expect(openTarget).toHaveBeenCalledWith("https://example.com/plan");
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Morning setup",
      body: "Good morning! Opened Spotify, example.com.",
    });
  });

  it("says which things a routine couldn't open instead of failing silently", async () => {
    vi.mocked(openTarget).mockRejectedValueOnce(new Error("gone"));
    const result = await runRoutine(routine({ actions: [{ type: "open", target: "/Applications/Old.app" }] }));
    expect(result.failed).toEqual(["Old"]);
    expect(sendNotification).toHaveBeenCalledWith({ title: "Morning setup", body: "Couldn't open Old." });
  });

  it("doesn't run routines on the wrong day, twice, or when switched off", async () => {
    vi.mocked(listRoutines).mockResolvedValue([
      routine({ id: 1, days: "Mon" }),
      routine({ id: 2, last_run_on: "2026-10-14" }),
      routine({ id: 3, enabled: false }),
    ]);
    await tick(NINE);
    expect(openTarget).not.toHaveBeenCalled();
  });

  it("nudges a timed to-do once and skips done ones", async () => {
    vi.mocked(listTodos).mockResolvedValue([todo(), todo({ id: 4, done: true })]);
    await tick(NINE);
    expect(markTodoNotified).toHaveBeenCalledTimes(1);
    expect(markTodoNotified).toHaveBeenCalledWith(3, "2026-10-14");
    expect(sendNotification).toHaveBeenCalledWith({ title: "To-do", body: "Gym" });
  });

  it("sends interval reminders when due", async () => {
    const r: Reminder = { id: 9, label: "Drink water", interval_minutes: 30, enabled: true, last_fired_at: new Date(2026, 9, 14, 8, 25).toISOString() };
    vi.mocked(listReminders).mockResolvedValue([r]);
    await tick(NINE);
    expect(sendNotification).toHaveBeenCalledWith({ title: "Nanobox", body: "Drink water" });
    expect(markReminderFired).toHaveBeenCalledWith(9, NINE.toISOString());
  });

  it("keeps going when one kind of item fails to load", async () => {
    vi.mocked(listAlarms).mockRejectedValue(new Error("db locked"));
    vi.mocked(listTodos).mockResolvedValue([todo()]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await tick(NINE);
    expect(markTodoNotified).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("tells widgets to refresh after it acts", async () => {
    const seen: string[] = [];
    const onFired = (e: Event) => seen.push((e as CustomEvent).detail.kind);
    window.addEventListener("nanobox:scheduler-fired", onFired);
    vi.mocked(listTodos).mockResolvedValue([todo()]);
    await tick(NINE);
    window.removeEventListener("nanobox:scheduler-fired", onFired);
    expect(seen).toContain("todo");
  });
});
