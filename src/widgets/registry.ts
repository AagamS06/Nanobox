import { ComponentType } from "react";
import {
  Alarm,
  AppShortcuts,
  BrainDump,
  Calendar,
  Clock,
  Countdown,
  FocusMode,
  GentleReminders,
  HabitTracker,
  MoodCheckIn,
  Music,
  Notes,
  TaskBreakdown,
  TodayTimeline,
  VisualTimer,
} from "./built-in";

export type WidgetId =
  | "clock"
  | "notes"
  | "alarm"
  | "shortcuts"
  | "countdown"
  | "habit-tracker"
  | "focus-mode"
  | "visual-timer"
  | "today-timeline"
  | "brain-dump"
  | "task-breakdown"
  | "mood-check-in"
  | "gentle-reminders"
  | "calendar"
  | "music"
  | "custom";

/**
 * "custom" is deliberately excluded here — unlike every other widget it needs
 * its own `WidgetInstance` (its Codeable code or Block program choice lives
 * in `settings`), so `WidgetGrid` renders it directly instead of through this
 * no-props map. It's still a normal entry in `WIDGET_LABELS` / `DEFAULT_SIZE`
 * so it shows up in the add-widget menu like everything else.
 *
 * The Custom Widget covers both Codeable and Block widgets (picked with a
 * switch inside the widget). The old separate "block-widget" type was folded
 * into it by migration 11 — see src-tauri/src/lib.rs.
 */
export const WIDGET_REGISTRY: Record<Exclude<WidgetId, "custom">, ComponentType> = {
  clock: Clock,
  notes: Notes,
  alarm: Alarm,
  shortcuts: AppShortcuts,
  countdown: Countdown,
  "habit-tracker": HabitTracker,
  "focus-mode": FocusMode,
  "visual-timer": VisualTimer,
  "today-timeline": TodayTimeline,
  "brain-dump": BrainDump,
  "task-breakdown": TaskBreakdown,
  "mood-check-in": MoodCheckIn,
  "gentle-reminders": GentleReminders,
  calendar: Calendar,
  music: Music,
};

export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: "Clock",
  notes: "Notes",
  alarm: "Alarms",
  shortcuts: "Shortcuts",
  countdown: "Countdown",
  "habit-tracker": "Habits",
  "focus-mode": "Focus Mode",
  "visual-timer": "Visual Timer",
  "today-timeline": "Today",
  "brain-dump": "Brain Dump",
  "task-breakdown": "Task Breakdown",
  "mood-check-in": "Mood Check-in",
  "gentle-reminders": "Gentle Reminders",
  calendar: "Calendar",
  music: "Music",
  custom: "Custom Widget",
};

export const DEFAULT_SIZE: Record<WidgetId, { w: number; h: number }> = {
  clock: { w: 240, h: 128 },
  notes: { w: 280, h: 320 },
  alarm: { w: 280, h: 320 },
  shortcuts: { w: 260, h: 200 },
  countdown: { w: 260, h: 240 },
  "habit-tracker": { w: 260, h: 280 },
  "focus-mode": { w: 240, h: 260 },
  "visual-timer": { w: 240, h: 320 },
  "today-timeline": { w: 280, h: 300 },
  "brain-dump": { w: 260, h: 280 },
  "task-breakdown": { w: 280, h: 320 },
  "mood-check-in": { w: 260, h: 220 },
  "gentle-reminders": { w: 260, h: 280 },
  calendar: { w: 380, h: 380 },
  music: { w: 280, h: 240 },
  custom: { w: 300, h: 300 },
};
