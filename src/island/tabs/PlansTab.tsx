import { useCallback, useEffect, useState } from "react";
import { listAlarms } from "../../storage/alarms";
import { listCountdowns } from "../../storage/countdowns";
import { listRoutines } from "../../storage/routines";
import { listTimelineBlocks } from "../../storage/timeline";
import { listTodos, setTodoDone, TODOS_CHANGED_EVENT } from "../../storage/todos";
import { getCachedCalendarEvents, listCalendarSources } from "../../storage/calendar";
import type { CalendarEvent } from "../../integrations/calendar/types";
import { broadcast } from "../../core/crossWindow";
import { minutesOf } from "../../core/schedule";
import { buildPlans, Plans } from "../plans";

async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const sources = await listCalendarSources();
  const cached = await Promise.all(sources.map((s) => getCachedCalendarEvents(s.id).catch(() => null)));
  return cached.flatMap((c) => c?.events ?? []);
}

/** Loads everything the Plans tab and the pill need. Each source fails independently. */
export async function loadPlans(now = new Date()): Promise<Plans> {
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [alarms, routines, todos, timeline, events, countdowns] = await Promise.all([
    safe(listAlarms()),
    safe(listRoutines()),
    safe(listTodos()),
    safe(listTimelineBlocks()),
    safe(loadCalendarEvents()),
    safe(listCountdowns()),
  ]);
  return buildPlans({ alarms, routines, todos, timeline, events, countdowns }, now);
}

function displayTime(hhmm: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function PlansTab() {
  const [plans, setPlans] = useState<Plans | null>(null);

  const refresh = useCallback(() => {
    loadPlans().then(setPlans).catch((err) => console.error("failed to load plans", err));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(TODOS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TODOS_CHANGED_EVENT, refresh);
  }, [refresh]);

  async function tick(todoId: number) {
    await setTodoDone(todoId, true);
    broadcast(TODOS_CHANGED_EVENT);
    refresh();
  }

  if (!plans) return null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const empty = plans.today.length === 0 && plans.anytime.length === 0 && plans.comingUp.length === 0;

  if (empty) {
    return (
      <div className="island-empty">
        <p>Nothing planned today.</p>
        <p className="island-muted">Alarms, routines, to-dos, Today blocks and calendar events show up here.</p>
      </div>
    );
  }

  return (
    <div className="island-plans">
      {plans.today.length > 0 && (
        <section>
          <h3 className="island-section-title">Today</h3>
          <ul className="island-list">
            {plans.today.map((i) => {
              const past = (minutesOf(i.time ?? "") ?? 0) < nowMin;
              return (
                <li key={i.key} className={`island-plan ${past ? "is-past" : ""}`}>
                  <span className="island-plan__time">{displayTime(i.time)}</span>
                  {i.todoId !== undefined ? (
                    <button className="island-check" onClick={() => tick(i.todoId!)} aria-label={`Mark "${i.title}" done`} />
                  ) : (
                    <span className="island-plan__icon" aria-hidden="true">
                      {i.icon}
                    </span>
                  )}
                  <span className="island-plan__title">{i.title}</span>
                  {i.detail && <span className="island-muted island-plan__detail">{i.detail}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {plans.anytime.length > 0 && (
        <section>
          <h3 className="island-section-title">To-do</h3>
          <ul className="island-list">
            {plans.anytime.map((i) => (
              <li key={i.key} className="island-plan">
                <button className="island-check" onClick={() => tick(i.todoId!)} aria-label={`Mark "${i.title}" done`} />
                <span className="island-plan__title">{i.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {plans.comingUp.length > 0 && (
        <section>
          <h3 className="island-section-title">Coming up</h3>
          <ul className="island-list">
            {plans.comingUp.map((c) => (
              <li key={c.key} className="island-plan">
                <span className="island-plan__icon" aria-hidden="true">
                  ⏳
                </span>
                <span className="island-plan__title">{c.title}</span>
                <span className="island-muted island-plan__detail">{c.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
