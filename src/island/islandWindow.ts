import { getCurrentWindow, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { getSetting, setSetting } from "../storage/settings";

/**
 * The island is its own small, borderless, always-on-top window. It is
 * resized between the pill and the open panel (rather than being one big
 * transparent window) so the empty space around the pill never blocks clicks
 * to the apps underneath.
 */

export const COLLAPSED = { width: 300, height: 44 };
export const EXPANDED = { width: 470, height: 500 };
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
  const { x, y } = topCentre(size, await usableArea());
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
