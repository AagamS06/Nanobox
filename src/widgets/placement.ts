/**
 * Where a newly added widget goes: the first spot (scanning left-to-right,
 * then top-to-bottom) where it doesn't overlap any existing widget. Before
 * this, every new widget was dropped 16px from the last one, so adding a
 * second Custom Widget looked like nothing happened — it landed almost
 * exactly on top of the first, with the same starter content.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacementOptions {
  /** Size of the area widgets live in. */
  bounds: { width: number; height: number };
  /** Space to keep between widgets and from the edges. */
  gap?: number;
  /** Scan step; also the snap grid, so placed widgets line up with dragged ones. */
  step?: number;
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function findFreeSpot(existing: Rect[], size: { w: number; h: number }, opts: PlacementOptions): { x: number; y: number } {
  const gap = opts.gap ?? 16;
  const step = opts.step ?? 8;
  const maxX = Math.max(gap, opts.bounds.width - size.w - gap);
  const maxY = Math.max(gap, opts.bounds.height - size.h - gap);

  for (let y = gap; y <= maxY; y += step) {
    for (let x = gap; x <= maxX; x += step) {
      const candidate = { x, y, w: size.w, h: size.h };
      if (!existing.some((r) => overlaps(candidate, r, gap))) return { x, y };
    }
  }

  // Desktop full: cascade from the top-left, skipping spots another widget
  // already starts at, so the new one is at least visibly offset.
  const taken = new Set(existing.map((r) => `${r.x},${r.y}`));
  let offset = gap;
  while (taken.has(`${offset},${offset}`) && offset < maxY) offset += step * 3;
  return { x: Math.min(offset, maxX), y: Math.min(offset, maxY) };
}
