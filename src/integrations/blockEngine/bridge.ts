import { sendNotification as osNotify } from "@tauri-apps/plugin-notification";
import { openTarget } from "../../core/launcher";
import type { ExecutionBridge } from "./types";
import { listNotes } from "../../storage/notes";
import { createAlarm } from "../../storage/alarms";
import { getActiveMusicProvider, getCachedNowPlaying } from "../../storage/music";
import { listCalendarSources, getCachedCalendarEvents } from "../../storage/calendar";

/**
 * The real bridge a block program runs against once it's live in a widget —
 * wires the engine's I/O seam (see `ExecutionBridge` in types.ts) to actual
 * storage and OS calls. Kept out of evaluator.ts so the evaluator itself
 * never imports Tauri plugins and stays unit-testable headless.
 */
export const liveBridge: ExecutionBridge = {
  async getNowPlaying() {
    const providerId = await getActiveMusicProvider();
    if (!providerId) return null;
    const cached = await getCachedNowPlaying(providerId);
    if (!cached?.data) return null;
    return { track: cached.data.trackTitle, artist: cached.data.artist, album: cached.data.album };
  },

  async getNote(noteId) {
    const id = Number(noteId);
    if (!Number.isFinite(id)) return null;
    const notes = await listNotes();
    return notes.find((n) => n.id === id)?.body ?? null;
  },

  async getNextCalendarEvent() {
    const sources = await listCalendarSources();
    const now = Date.now();
    let soonest: { id?: string; title?: string; start: string } | null = null;

    for (const source of sources) {
      const cached = await getCachedCalendarEvents(source.id);
      for (const event of cached?.events ?? []) {
        const start = new Date(event.start).getTime();
        if (start < now) continue;
        if (!soonest || start < new Date(soonest.start).getTime()) {
          soonest = { id: event.id, title: event.title, start: event.start };
        }
      }
    }

    return soonest ? { id: soonest.id, title: soonest.title } : null;
  },

  async playSound(file) {
    if (!file) return;
    await new Audio(file).play();
  },

  async sendNotification(title, body) {
    await osNotify({ title, body });
  },

  async openApp(appPath) {
    await openTarget(appPath);
  },

  async setAlarm(time, label) {
    await createAlarm({ label, time, days: "", sound: "chime" });
  },
};
