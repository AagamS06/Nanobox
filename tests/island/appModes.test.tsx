import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WidgetInstance } from "../../src/storage/widgetInstances";

// ---- storage mocks for the Widgets tab ---------------------------------
const db = vi.hoisted(() => ({
  instances: [] as WidgetInstance[],
  settings: new Map<string, string>(),
  nextId: 100,
}));

vi.mock("../../src/storage/widgetInstances", () => ({
  listWidgetInstances: vi.fn(async () => db.instances.map((i) => ({ ...i }))),
  createWidgetInstance: vi.fn(async (input: Omit<WidgetInstance, "id" | "opacity" | "settings" | "style_settings">) => {
    const id = db.nextId++;
    db.instances.push({ ...input, id, opacity: 1, settings: null, style_settings: null });
    return id;
  }),
  deleteWidgetInstance: vi.fn(async (id: number) => {
    db.instances = db.instances.filter((i) => i.id !== id);
  }),
  updateWidgetLayout: vi.fn(async () => {}),
  updateWidgetOpacity: vi.fn(async () => {}),
  updateWidgetStyle: vi.fn(async () => {}),
}));
vi.mock("../../src/storage/settings", () => ({
  getSetting: vi.fn(async (key: string) => db.settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => void db.settings.set(key, value)),
}));
// Real widgets pull in the DB, Tauri, etc. — stand-ins are enough to test the tab.
vi.mock("../../src/widgets/registry", async () => {
  const { WidgetFrame } = await import("../../src/components/WidgetFrame");
  const make = (title: string) => () => <WidgetFrame title={title}>{title} body</WidgetFrame>;
  return {
    WIDGET_REGISTRY: { clock: make("Clock"), notes: make("Notes"), todo: make("To-do") },
    WIDGET_LABELS: { clock: "Clock", notes: "Notes", todo: "To-do" },
    DEFAULT_SIZE: { clock: { w: 240, h: 128 }, notes: { w: 280, h: 320 }, todo: { w: 280, h: 320 } },
  };
});
vi.mock("../../src/widgets/built-in", () => ({ CustomWidget: () => null }));

import { cardHeight, moveBy, moveOnto, orderInstances } from "../../src/island/widgetOrder";
import { fitToArea, PANEL_SIZES, toPanelSize } from "../../src/island/islandWindow";
import { toAppMode } from "../../src/core/appMode";
import { pillSummary, tabsFor } from "../../src/island/Island";
import { WidgetsTab } from "../../src/island/tabs/WidgetsTab";
import { updateWidgetLayout, updateWidgetStyle } from "../../src/storage/widgetInstances";

const inst = (over: Partial<WidgetInstance>): WidgetInstance => ({
  id: 1,
  widget_type: "clock",
  x: 0,
  y: 0,
  w: 240,
  h: 128,
  opacity: 1,
  settings: null,
  style_settings: null,
  ...over,
});

afterEach(() => {
  db.instances = [];
  db.settings.clear();
  vi.clearAllMocks();
});

describe("island widget order", () => {
  it("puts saved positions first, then the rest in desktop reading order", () => {
    const list = [
      inst({ id: 1, x: 400, y: 0 }),
      inst({ id: 2, x: 0, y: 300 }),
      inst({ id: 3, x: 0, y: 0 }),
      inst({ id: 4, x: 0, y: 0 }),
    ];
    expect(orderInstances(list, []).map((i) => i.id)).toEqual([3, 4, 1, 2]);
    expect(orderInstances(list, [2, 99, 1]).map((i) => i.id)).toEqual([2, 1, 3, 4]);
  });

  it("moves cards by one place and by dropping onto another", () => {
    expect(moveBy([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveBy([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveBy([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveOnto([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveOnto([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveOnto([1, 2], 1, 9)).toEqual([1, 2]);
  });

  it("keeps card heights within reason", () => {
    expect(cardHeight(40)).toBe(170);
    expect(cardHeight(320)).toBe(320);
    expect(cardHeight(2000)).toBe(440);
  });
});

describe("modes and island sizing", () => {
  it("treats anything unknown as desktop mode / roomy size", () => {
    expect(toAppMode("island")).toBe("island");
    expect(toAppMode("desktop")).toBe("desktop");
    expect(toAppMode(undefined)).toBe("desktop");
    expect(toPanelSize("large")).toBe("large");
    expect(toPanelSize("huge")).toBe("roomy");
  });

  it("only has a Widgets tab in island mode", () => {
    expect(tabsFor("island")[0].id).toBe("widgets");
    expect(tabsFor("desktop").some((t) => t.id === "widgets")).toBe(false);
    expect(tabsFor(null).some((t) => t.id === "widgets")).toBe(false);
  });

  it("shrinks a large island to fit a small screen", () => {
    expect(fitToArea(PANEL_SIZES.large, { width: 1920, height: 1040 })).toEqual(PANEL_SIZES.large);
    expect(fitToArea(PANEL_SIZES.large, { width: 800, height: 560 })).toEqual({ width: 784, height: 544 });
  });

  it("puts a ringing alarm on the pill ahead of music and plans", () => {
    const now = new Date(2026, 9, 15, 9, 0);
    const music = { isPlaying: true, trackTitle: "Song", artist: "Band" } as never;
    const alarm = { id: 1, label: "Lecture", time: "09:00" } as never;
    expect(pillSummary(music, null, now)).toBe("♪ Song – Band");
    expect(pillSummary(music, null, now, [alarm])).toBe("⏰ Lecture");
    expect(pillSummary(null, null, now, [alarm, alarm])).toBe("⏰ Lecture +1");
  });
});

describe("Widgets tab", () => {
  it("shows every widget, adds new ones first, and removes them", async () => {
    db.instances = [inst({ id: 1, widget_type: "clock" }), inst({ id: 2, widget_type: "notes", y: 200, h: 320 })];
    const { container } = render(<WidgetsTab />);
    await screen.findByText("Clock body");
    expect(screen.getByText("Notes body")).toBeTruthy();
    expect(screen.getByText(/2 widgets/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Add widget" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "To-do" }));
    await screen.findByText("To-do body");
    const ids = () => [...container.querySelectorAll<HTMLElement>("[data-widget-id]")].map((el) => el.dataset.widgetId);
    expect(ids()).toEqual(["100", "1", "2"]);
    expect(JSON.parse(db.settings.get("islandWidgetOrder")!)).toEqual([100, 1, 2]);
    // It also got a free spot on the desktop, clear of the other two.
    const added = db.instances.find((i) => i.id === 100)!;
    expect(added.x === 0 && added.y === 0).toBe(false);

    const clockCard = container.querySelector('[data-widget-id="1"]')!;
    fireEvent.click(clockCard.querySelector('[aria-label="Close widget"]')!);
    await waitFor(() => expect(ids()).toEqual(["100", "2"]));
  });

  it("customises a widget's look and height, and reorders it", async () => {
    db.instances = [inst({ id: 1, widget_type: "clock" }), inst({ id: 2, widget_type: "notes", y: 200 })];
    const { container } = render(<WidgetsTab />);
    await screen.findByText("Clock body");
    const card = () => container.querySelector<HTMLElement>('[data-widget-id="1"]')!;
    expect(card().style.height).toBe("170px");

    fireEvent.click(card().querySelector('[aria-label="Widget settings"]')!);
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "thick" } });
    fireEvent.click(screen.getByRole("button", { name: "Later →" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(card().style.height).toBe("300px");
    expect(updateWidgetLayout).toHaveBeenCalledWith(1, { x: 0, y: 0, w: 240, h: 300 });
    expect(updateWidgetStyle).toHaveBeenCalledWith(1, JSON.stringify({ borderStyle: "thick" }));
    const ids = [...container.querySelectorAll<HTMLElement>("[data-widget-id]")].map((el) => el.dataset.widgetId);
    expect(ids).toEqual(["2", "1"]);
  });

  it("says so when there are no widgets", async () => {
    render(<WidgetsTab />);
    await screen.findByText("No widgets yet.");
  });
});
