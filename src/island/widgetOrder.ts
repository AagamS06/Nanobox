import type { WidgetInstance } from "../storage/widgetInstances";
import { getSetting, setSetting } from "../storage/settings";

/**
 * In island mode widgets sit in a scrolling grid instead of at x/y spots on
 * the desktop. Their order there is kept separately (a list of instance ids
 * in the settings table) so rearranging the island never disturbs the desktop
 * layout, and switching back to desktop mode puts everything where it was.
 */

const ORDER_KEY = "islandWidgetOrder";

/** Island cards are as tall as the widget is on the desktop, within reason. */
export const MIN_CARD_HEIGHT = 170;
export const MAX_CARD_HEIGHT = 440;

export function cardHeight(h: number): number {
  return Math.round(Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, h)));
}

/**
 * Instances in island order: ones with a saved position first, then any that
 * aren't in the list yet (new or never rearranged) in reading order of where
 * they sit on the desktop — top to bottom, left to right.
 */
export function orderInstances(instances: WidgetInstance[], order: number[]): WidgetInstance[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...instances].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.y - b.y || a.x - b.x || a.id - b.id;
  });
}

/** Moves `id` one place earlier (-1) or later (+1). */
export function moveBy(ids: number[], id: number, delta: -1 | 1): number[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Moves `id` into `targetId`'s place (dropping one card onto another). */
export function moveOnto(ids: number[], id: number, targetId: number): number[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

export async function loadIslandOrder(): Promise<number[]> {
  try {
    const parsed = JSON.parse((await getSetting(ORDER_KEY)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export async function saveIslandOrder(ids: number[]): Promise<void> {
  await setSetting(ORDER_KEY, JSON.stringify(ids));
}
