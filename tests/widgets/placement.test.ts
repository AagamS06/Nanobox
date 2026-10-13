import { describe, expect, it } from "vitest";
import { findFreeSpot } from "../../src/widgets/placement";

const bounds = { width: 1000, height: 700 };
const size = { w: 300, h: 300 };

describe("findFreeSpot", () => {
  it("uses the top-left on an empty desktop", () => {
    expect(findFreeSpot([], size, { bounds })).toEqual({ x: 16, y: 16 });
  });

  it("puts a second Custom Widget beside the first, not on top of it", () => {
    const first = { x: 16, y: 16, ...size };
    const spot = findFreeSpot([first], size, { bounds });
    expect(spot.y).toBe(16);
    expect(spot.x).toBeGreaterThanOrEqual(first.x + first.w + 16);
  });

  it("wraps to the next row when a row is full", () => {
    const row = [0, 1, 2].map((i) => ({ x: 16 + i * 320, y: 16, ...size }));
    const spot = findFreeSpot(row, size, { bounds: { width: 1000, height: 1000 } });
    expect(spot.y).toBeGreaterThanOrEqual(16 + 300 + 16);
  });

  it("never returns a spot overlapping an existing widget while there is room", () => {
    const existing = [
      { x: 16, y: 16, w: 240, h: 128 },
      { x: 300, y: 40, w: 280, h: 320 },
    ];
    const spot = findFreeSpot(existing, size, { bounds });
    for (const r of existing) {
      const overlap = spot.x < r.x + r.w && r.x < spot.x + size.w && spot.y < r.y + r.h && r.y < spot.y + size.h;
      expect(overlap).toBe(false);
    }
  });

  it("still offsets visibly when the desktop is full", () => {
    const full = [{ x: 16, y: 16, w: 1000, h: 700 }];
    const a = findFreeSpot(full, size, { bounds });
    const b = findFreeSpot([...full, { ...a, ...size }], size, { bounds });
    expect(b).not.toEqual(a);
  });
});
