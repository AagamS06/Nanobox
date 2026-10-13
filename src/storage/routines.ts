import { getDb } from "./db";

/** One thing a routine does when it runs. */
export type RoutineAction =
  | { type: "open"; target: string; label?: string }
  | { type: "notify"; text: string };

export interface Routine {
  id: number;
  name: string;
  /** "HH:MM", 24 h, local time */
  time: string;
  /** Comma list of weekday labels; empty = every day. */
  days: string;
  /** "YYYY-MM-DD" for a one-off routine, otherwise null. */
  run_on_date: string | null;
  actions: RoutineAction[];
  enabled: boolean;
  last_run_on: string | null;
}

interface RoutineRow extends Omit<Routine, "actions" | "enabled"> {
  actions_json: string;
  enabled: number;
}

export function parseActions(json: string): RoutineAction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((a): RoutineAction[] => {
    if (!a || typeof a !== "object") return [];
    const r = a as Record<string, unknown>;
    if (r.type === "open" && typeof r.target === "string" && r.target.trim()) {
      return [{ type: "open", target: r.target, label: typeof r.label === "string" ? r.label : undefined }];
    }
    if (r.type === "notify" && typeof r.text === "string" && r.text.trim()) {
      return [{ type: "notify", text: r.text }];
    }
    return [];
  });
}

const fromRow = (row: RoutineRow): Routine => ({
  id: row.id,
  name: row.name,
  time: row.time,
  days: row.days,
  run_on_date: row.run_on_date,
  actions: parseActions(row.actions_json),
  enabled: Boolean(row.enabled),
  last_run_on: row.last_run_on,
});

export async function listRoutines(): Promise<Routine[]> {
  const db = await getDb();
  const rows = await db.select<RoutineRow[]>("SELECT * FROM routines ORDER BY time ASC, id ASC");
  return rows.map(fromRow);
}

export async function createRoutine(input: {
  name: string;
  time: string;
  days: string;
  run_on_date: string | null;
  actions: RoutineAction[];
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO routines (name, time, days, run_on_date, actions_json) VALUES ($1, $2, $3, $4, $5)",
    [input.name, input.time, input.days, input.run_on_date, JSON.stringify(input.actions)],
  );
}

export async function setRoutineEnabled(id: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE routines SET enabled = $1 WHERE id = $2", [enabled ? 1 : 0, id]);
}

export async function markRoutineRun(id: number, localDate: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE routines SET last_run_on = $1 WHERE id = $2", [localDate, id]);
}

export async function deleteRoutine(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM routines WHERE id = $1", [id]);
}
