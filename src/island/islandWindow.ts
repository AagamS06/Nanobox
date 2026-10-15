import { getCurrentWindow, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { getSetting, setSetting } from "../storage/settings";

/**
 * The island is its own small, borderless, always-on-top window. It is
 * resized between the pill and the open panel (rather than being one big
 * transparent window) so the empty space around the pill never blocks clicks
 * to the apps underneath.
 */

export const COLLAPSED = { width: 300, height: 44 };
export const EXPANDED = { width: 470, height: 500 };

/**
 * How big the open island is in island mode, where it also holds your
 * widgets. (Desktop mode always uses EXPANDED — it's just the quick panel.)
 */
export type PanelSizeId = "compact" | "roomy" | "large";
export const PANEL_SIZES: Record<PanelSizeId, IslandSize> = {
  compact: EXPANDED,
  roomy: { width: 640, height: 600 },
  large: { width: 820, height: 700 },
};
export const PANEL_SIZE_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "roomy", label: "Roomy" },
  { value: "large", label: "Large" },
] as const;
const PANEL_SIZE_KEY = "islandPanelSize";
export const PANEL_SIZE_CHANGED_EVENT = "island:panel-size-changed";

export function toPanelSize(value: unknown): PanelSizeId {
  return value === "compact" || value === "large" ? value : "roomy";
}
/** Gap between the top of the usable screen area and the island. */
const TOP_MARGIN = 8;
const VISIBLE_KEY = "islandVisible";

export type IslandSize = { width: number; height: number };

/**
 * Where to put a window of `size` so it's centred at the top of the primary
 * monitor's usable area (below a top taskbar / the macOS menu bar). All in
 * logical pixels. Exported for tests.
 */
export function topCentre(
  size: IslandSize,
  area: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + TOP_MARGIN),
  };
}

/** Shrinks `size` to fit the usable screen area (a Large island on a small laptop screen). Exported for tests. */
export function fitToArea(size: IslandSize, area: { width: number; height: number }): IslandSize {
  return {
    width: Math.min(size.width, Math.max(COLLAPSED.width, area.width - 2 * TOP_MARGIN)),
    height: Math.min(size.height, Math.max(COLLAPSED.height, area.height - 2 * TOP_MARGIN)),
  };
}

async function usableArea() {
  const monitor = await primaryMonitor();
  if (!monitor) return { x: 0, y: 0, width: 1280, height: 800 };
  const scale = monitor.scaleFactor || 1;
  // workArea excludes the taskbar / menu bar; fall back to the full monitor.
  const rect = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  return {
    x: rect.position.x / scale,
    y: rect.position.y / scale,
    width: rect.size.width / scale,
    height: rect.size.height / scale,
  };
}

export async function placeIsland(size: IslandSize): Promise<void> {
  const win = getCurrentWindow();
  const area = await usableArea();
  size = fitToArea(size, area);
  const { x, y } = topCentre(size, area);
  await win.setSize(new LogicalSize(size.width, size.height));
  await win.setPosition(new LogicalPosition(x, y));
}

export async function showIsland(): Promise<void> {
  await placeIsland(COLLAPSED);
  await getCurrentWindow().show();
}

export async function hideIsland(): Promise<void> {
  await getCurrentWindow().hide();
}

export async function getIslandVisible(): Promise<boolean> {
  return (await getSetting(VISIBLE_KEY)) !== "false";
}

export async function setIslandVisible(visible: boolean): Promise<void> {
  await setSetting(VISIBLE_KEY, String(visible));
  await (visible ? showIsland() : hideIsland());
}

export async function getPanelSize(): Promise<PanelSizeId> {
  return toPanelSize(await getSetting(PANEL_SIZE_KEY));
}

export async function setPanelSize(id: PanelSizeId): Promise<void> {
  await setSetting(PANEL_SIZE_KEY, id);
  await emit(PANEL_SIZE_CHANGED_EVENT, id).catch(() => {});
}
