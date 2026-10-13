import { describe, expect, it } from "vitest";
import {
  dayMatches,
  describeSchedule,
  isDue,
  isExpiredOneOff,
  isReminderDue,
  localDateIso,
  minutesOf,
} from "../../src/core/schedule";

// Wednesday 14 Oct 2026, local time.
const at = (h: number, m: number, s = 0) => new Date(2026, 9, 14, h, m, s);

describe("localDateIso", () => {
  it("uses the local date, not UTC", () => {
    // 07:00 local is still "today" locally even where UTC is yesterday.
    expect(localDateIso(at(7, 0))).toBe("2026-10-14");
    expect(localDateIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("minutesOf", () => {
  it("parses HH:MM and rejects junk", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("9:05")).toBe(545);
    expect(minutesOf("24:00")).toBeNull();
    expect(minutesOf("12:60")).toBeNull();
    expect(minutesOf("noon")).toBeNull();
  });
});

describe("dayMatches", () => {
  it("treats empty as every day", () => {
    expect(dayMatches("", at(9, 0))).toBe(true);
  });
  it("matches the weekday list", () => {
    expect(dayMatches("Mon,Wed", at(9, 0))).toBe(true);
    expect(dayMatches("Sat,Sun", at(9, 0))).toBe(false);
  });
});

describe("isDue", () => {
  const daily = { time: "09:00", days: "", lastRunOn: null };

  it("fires at the minute and within the grace window", () => {
    expect(isDue(daily, at(9, 0, 5))).toBe(true);
    expect(isDue(daily, at(9, 4))).toBe(true);
  });

  it("doesn't fire early or long after (e.g. opening the app at lunchtime)", () => {
    expect(isDue(daily, at(8, 59))).toBe(false);
    expect(isDue(daily, at(9, 6))).toBe(false);
    expect(isDue(daily, at(13, 0))).toBe(false);
  });

  it("fires once per day", () => {
    expect(isDue({ ...daily, lastRunOn: "2026-10-14" }, at(9, 1))).toBe(false);
    expect(isDue({ ...daily, lastRunOn: "2026-10-13" }, at(9, 1))).toBe(true);
  });

  it("respects chosen days", () => {
    expect(isDue({ ...daily, days: "Wed" }, at(9, 0))).toBe(true);
    expect(isDue({ ...daily, days: "Mon,Tue" }, at(9, 0))).toBe(false);
  });

  it("handles one-offs on a date, ignoring days", () => {
    expect(isDue({ ...daily, days: "Mon", onDate: "2026-10-14" }, at(9, 0))).toBe(true);
    expect(isDue({ ...daily, onDate: "2026-10-15" }, at(9, 0))).toBe(false);
  });

  it("never fires on a malformed time", () => {
    expect(isDue({ ...daily, time: "9am" }, at(9, 0))).toBe(false);
  });
});

describe("isExpiredOneOff", () => {
  it("is false for repeating schedules", () => {
    expect(isExpiredOneOff({ time: "09:00", days: "", lastRunOn: null }, at(23, 0))).toBe(false);
  });
  it("is true once the date and grace window have passed", () => {
    const s = { time: "09:00", days: "", onDate: "2026-10-14", lastRunOn: null };
    expect(isExpiredOneOff(s, at(9, 3))).toBe(false);
    expect(isExpiredOneOff(s, at(9, 30))).toBe(true);
    expect(isExpiredOneOff({ ...s, onDate: "2026-10-13" }, at(1, 0))).toBe(true);
    expect(isExpiredOneOff({ ...s, onDate: "2026-10-20" }, at(23, 0))).toBe(false);
  });
});

describe("isReminderDue", () => {
  it("waits the full interval since the last nudge", () => {
    const last = at(9, 0).toISOString();
    expect(isReminderDue(last, 45, at(9, 44))).toBe(false);
    expect(isReminderDue(last, 45, at(9, 45))).toBe(true);
  });
  it("ignores never-started or broken timestamps", () => {
    expect(isReminderDue(null, 15, at(9, 0))).toBe(false);
    expect(isReminderDue("not a date", 15, at(9, 0))).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("summarises common patterns", () => {
    expect(describeSchedule("09:00", "")).toBe("09:00 · Every day");
    expect(describeSchedule("09:00", "Mon,Tue,Wed,Thu,Fri")).toBe("09:00 · Weekdays");
    expect(describeSchedule("10:00", "Sun,Sat")).toBe("10:00 · Weekends");
    expect(describeSchedule("07:30", "Wed,Mon")).toBe("07:30 · Mon, Wed");
    expect(describeSchedule("11:00", "", "2026-11-10")).toMatch(/^11:00 · .*10/);
  });
});
