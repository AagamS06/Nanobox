import { FormEvent, useEffect, useState } from "react";
import { WidgetFrame } from "../../../components/WidgetFrame";
import {
  clearDoneTodos,
  createTodo,
  deleteTodo,
  listTodos,
  setTodoDone,
  Todo as TodoRecord,
  TODOS_CHANGED_EVENT,
} from "../../../storage/todos";
import { SCHEDULER_EVENT } from "../../../core/scheduler";
import "./Todo.css";

/** Formats "18:00" as the user's local short time, e.g. "6:00 pm". */
function displayTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * A plain to-do list. Items can carry an optional time for today; the
 * app-wide scheduler sends one gentle nudge at that time.
 */
export function Todo() {
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [showTime, setShowTime] = useState(false);
  const [dbError, setDbError] = useState(false);

  async function refresh() {
    setTodos(await listTodos());
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load to-dos", err);
      setDbError(true);
    });
    const onChange = () => void refresh().catch(() => {});
    window.addEventListener(SCHEDULER_EVENT, onChange);
    window.addEventListener(TODOS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(SCHEDULER_EVENT, onChange);
      window.removeEventListener(TODOS_CHANGED_EVENT, onChange);
    };
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await createTodo(text.trim(), showTime && time ? time : null);
    setText("");
    setTime("");
    setShowTime(false);
    await refresh();
  }

  const open = todos.filter((t) => !t.done).length;
  const done = todos.length - open;

  return (
    <WidgetFrame title="To-do">
      <div className="todo-widget">
        {dbError && <p className="todo-widget__empty">⚠ Failed to load to-dos. Restart the app to retry.</p>}
        <div className="todo-widget__summary" aria-live="polite">
          {todos.length > 0 ? `${done}/${todos.length} done` : ""}
        </div>
        <ul className="todo-widget__list">
          {todos.map((t) => (
            <li key={t.id} className={`todo-widget__item ${t.done ? "is-done" : ""}`}>
              <button
                className="todo-widget__check"
                onClick={() => setTodoDone(t.id, !t.done).then(refresh)}
                aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
                aria-pressed={t.done}
              >
                {t.done && "✓"}
              </button>
              <span className="todo-widget__text">{t.text}</span>
              {t.due_time && <span className="todo-widget__time">{displayTime(t.due_time)}</span>}
              <button
                className="todo-widget__delete"
                onClick={() => deleteTodo(t.id).then(refresh)}
                aria-label={`Delete "${t.text}"`}
              >
                ×
              </button>
            </li>
          ))}
          {todos.length === 0 && !dbError && <li className="todo-widget__empty">Nothing to do. Nice.</li>}
        </ul>

        <form className="todo-widget__form" onSubmit={add} data-no-drag>
          <input
            className="todo-widget__input"
            placeholder="Add a to-do…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="New to-do"
          />
          {showTime ? (
            <input
              className="todo-widget__input todo-widget__input--time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Time today"
            />
          ) : (
            <button type="button" className="todo-widget__chip" onClick={() => setShowTime(true)} aria-label="Add a time">
              ⏰
            </button>
          )}
          <button type="submit" className="todo-widget__btn--primary">
            Add
          </button>
        </form>
        {done > 0 && (
          <button className="todo-widget__clear" onClick={() => clearDoneTodos().then(refresh)}>
            Clear {done} done
          </button>
        )}
      </div>
    </WidgetFrame>
  );
}
