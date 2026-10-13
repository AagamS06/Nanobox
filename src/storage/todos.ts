import { getDb } from "./db";
import { minutesOf } from "../core/schedule";

/**
 * Tauri event (cross-window) sent when to-dos change outside the To-do widget,
 * e.g. from the island. Widgets also accept it as a plain window event.
 */
export const TODOS_CHANGED_EVENT = "nanobox:todos-changed";

export interface Todo {
  id: number;
  text: string;
  /** Optional "HH:MM" for today — gets a gentle nudge at that time. */
  due_time: string | null;
  done: boolean;
  done_at: string | null;
  notified_on: string | null;
}

interface TodoRow extends Omit<Todo, "done"> {
  done: number;
}

const fromRow = (row: TodoRow): Todo => ({ ...row, done: Boolean(row.done) });

/**
 * Display order: open items with a time (earliest first), then open items
 * without a time (oldest first), then finished items (most recent first).
 */
export function sortTodos(todos: Todo[]): Todo[] {
  const rank = (t: Todo) => (t.done ? 2 : t.due_time && minutesOf(t.due_time) !== null ? 0 : 1);
  return [...todos].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (rank(a) === 0) return (minutesOf(a.due_time!) ?? 0) - (minutesOf(b.due_time!) ?? 0);
    if (rank(a) === 2) return (b.done_at ?? "").localeCompare(a.done_at ?? "");
    return a.id - b.id;
  });
}

export async function listTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>("SELECT * FROM todos");
  return sortTodos(rows.map(fromRow));
}

export async function createTodo(text: string, dueTime: string | null): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO todos (text, due_time) VALUES ($1, $2)", [text, dueTime]);
}

export async function setTodoDone(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE todos SET done = $1, done_at = $2 WHERE id = $3", [
    done ? 1 : 0,
    done ? new Date().toISOString() : null,
    id,
  ]);
}

export async function markTodoNotified(id: number, localDate: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE todos SET notified_on = $1 WHERE id = $2", [localDate, id]);
}

export async function deleteTodo(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
}

export async function clearDoneTodos(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE done = 1");
}
