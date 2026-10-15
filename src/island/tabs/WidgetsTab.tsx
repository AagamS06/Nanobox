import { useEffect, useRef, useState } from "react";
import {
  createWidgetInstance,
  deleteWidgetInstance,
  listWidgetInstances,
  updateWidgetLayout,
  updateWidgetOpacity,
  updateWidgetStyle,
  WidgetInstance,
} from "../../storage/widgetInstances";
import { CustomWidget } from "../../widgets/built-in";
import { WidgetChromeContext } from "../../widgets/WidgetChromeContext";
import { DEFAULT_SIZE, WIDGET_LABELS, WIDGET_REGISTRY, WidgetId } from "../../widgets/registry";
import { findFreeSpot } from "../../widgets/placement";
import { draftFor, PopoverDraft, serializeStyleSettings, widgetStyleVars, WidgetStylePopover } from "../../widgets/widgetStyle";
import {
  cardHeight,
  loadIslandOrder,
  MAX_CARD_HEIGHT,
  MIN_CARD_HEIGHT,
  moveBy,
  moveOnto,
  orderInstances,
  saveIslandOrder,
} from "../widgetOrder";
import "../../widgets/WidgetGrid.css";

/** Roughly the desktop window's size, so widgets added here get a sensible desktop spot too. */
const DESKTOP_BOUNDS = { width: 960, height: 640 };

/**
 * Island mode's home: every widget you'd have on the desktop, as cards in a
 * scrolling grid. Same widgets, same data, same per-widget colour / border /
 * opacity settings — drag a card's title onto another to rearrange, ⚙ for its
 * look and height, × to remove, "+ Add widget" for more.
 *
 * Stays mounted while the island is closed (see Island.tsx), so timers and
 * focus sessions keep running between peeks.
 */
export function WidgetsTab() {
  const [instances, setInstances] = useState<WidgetInstance[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<(PopoverDraft & { h: number }) | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const [list, saved] = await Promise.all([listWidgetInstances(), loadIslandOrder()]);
    setInstances(list);
    setOrder(orderInstances(list, saved).map((i) => i.id));
    setLoaded(true);
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load widgets", err);
      setLoadError(true);
    });
  }, []);

  const byId = new Map(instances.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i): i is WidgetInstance => Boolean(i));

  function commitOrder(next: number[]) {
    setOrder(next);
    saveIslandOrder(next).catch((err) => console.error("failed to save widget order", err));
  }

  async function addWidget(type: WidgetId) {
    setAddOpen(false);
    const size = DEFAULT_SIZE[type];
    const spot = findFreeSpot(instances, size, { bounds: DESKTOP_BOUNDS });
    try {
      const id = await createWidgetInstance({ widget_type: type, ...spot, ...size });
      await refresh();
      if (typeof id === "number") {
        // New widgets go first so you can see them without scrolling.
        commitOrder([id, ...order.filter((x) => x !== id)]);
        setJustAddedId(id);
        setTimeout(() => setJustAddedId((cur) => (cur === id ? null : cur)), 1600);
      }
    } catch (err) {
      console.error("failed to add widget", err);
    }
  }

  function removeWidget(id: number) {
    closeEditor(false);
    deleteWidgetInstance(id)
      .then(() => {
        setInstances((prev) => prev.filter((i) => i.id !== id));
        commitOrder(order.filter((x) => x !== id));
      })
      .catch((err) => console.error("failed to remove widget", err));
  }

  function openEditor(instance: WidgetInstance) {
    if (editingId === instance.id) return closeEditor(true);
    setDraft({ ...draftFor(instance), h: cardHeight(instance.h) });
    setEditingId(instance.id);
  }

  function closeEditor(save: boolean) {
    const instance = editingId === null ? undefined : byId.get(editingId);
    if (save && instance && draft) {
      const style = serializeStyleSettings({ color: draft.color, borderStyle: draft.borderStyle });
      const layout = { x: instance.x, y: instance.y, w: instance.w, h: draft.h };
      setInstances((prev) =>
        prev.map((i) => (i.id === instance.id ? { ...i, opacity: draft.opacity, style_settings: style, h: draft.h } : i)),
      );
      Promise.all([
        updateWidgetOpacity(instance.id, draft.opacity),
        updateWidgetStyle(instance.id, style),
        draft.h !== cardHeight(instance.h) ? updateWidgetLayout(instance.id, layout) : Promise.resolve(),
      ]).catch((err) => console.error("failed to save widget look", err));
    }
    setEditingId(null);
    setDraft(null);
  }

  // Click outside / Escape saves, like the desktop popover.
  useEffect(() => {
    if (editingId === null) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) closeEditor(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeEditor(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, draft]);

  /** Drag a card by its title bar and drop it on another card to swap places. */
  function startDrag(e: React.PointerEvent, id: number) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-drag]")) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    setDragId(id);
    let over: number | null = null;

    const onMove = (ev: PointerEvent) => {
      const card = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-widget-id]");
      const target = card ? Number(card.dataset.widgetId) : null;
      over = target === id ? null : target;
      setDropId(over);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      if (over !== null) commitOrder(moveOnto(order, id, over));
      setDragId(null);
      setDropId(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  if (loadError) return <p className="island-muted island-center">⚠ Couldn't load your widgets. Restart Nanobox to retry.</p>;

  return (
    <div className="island-widgets">
      <div className="island-toolbar">
        <span className="island-muted">
          {ordered.length === 0 ? "" : `${ordered.length} widget${ordered.length === 1 ? "" : "s"} · drag a title to rearrange`}
        </span>
        <div className="island-widgets__add">
          <button className="island-btn island-btn--primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
            + Add widget
          </button>
          {addOpen && (
            <div className="island-widgets__add-menu" role="menu">
              {(Object.keys(WIDGET_LABELS) as WidgetId[]).map((id) => (
                <button key={id} role="menuitem" onClick={() => void addWidget(id)}>
                  {WIDGET_LABELS[id]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loaded && ordered.length === 0 && (
        <div className="island-empty">
          <p>No widgets yet.</p>
          <p className="island-muted">Add a clock, notes, a timer — anything you'd keep on your desktop.</p>
        </div>
      )}

      <div className="island-widgets__grid">
        {ordered.map((instance, index) => {
          const isCustom = instance.widget_type === "custom" || (instance.widget_type as string) === "block-widget";
          const Component = isCustom ? null : WIDGET_REGISTRY[instance.widget_type as Exclude<WidgetId, "custom">];
          if (!isCustom && !Component) return null;
          const editing = editingId === instance.id && draft;
          const height = editing ? draft.h : cardHeight(instance.h);
          return (
            <div
              key={instance.id}
              data-widget-id={instance.id}
              className={[
                "island-widgets__card",
                dragId === instance.id ? "is-dragging" : "",
                dropId === instance.id ? "is-drop-target" : "",
                justAddedId === instance.id ? "is-new" : "",
              ].join(" ")}
              style={{ height, ...widgetStyleVars(instance, editing ? draft : undefined) }}
            >
              {editing && (
                <WidgetStylePopover
                  ref={popoverRef}
                  className="island-widgets__popover"
                  draft={draft}
                  onChange={(d) => setDraft({ ...draft, ...d })}
                  onCancel={() => closeEditor(false)}
                  onSave={() => closeEditor(true)}
                >
                  <label>
                    Height
                    <input
                      type="range"
                      min={MIN_CARD_HEIGHT}
                      max={MAX_CARD_HEIGHT}
                      step={10}
                      value={draft.h}
                      onChange={(e) => setDraft({ ...draft, h: Number(e.target.value) })}
                    />
                  </label>
                  <div className="island-widgets__move">
                    <button
                      className="widget-grid__popover-btn"
                      disabled={index === 0}
                      onClick={() => commitOrder(moveBy(order, instance.id, -1))}
                    >
                      ← Earlier
                    </button>
                    <button
                      className="widget-grid__popover-btn"
                      disabled={index === ordered.length - 1}
                      onClick={() => commitOrder(moveBy(order, instance.id, 1))}
                    >
                      Later →
                    </button>
                  </div>
                </WidgetStylePopover>
              )}
              <WidgetChromeContext.Provider
                value={{
                  onDragStart: (e) => startDrag(e, instance.id),
                  onOpenSettings: () => openEditor(instance),
                  onClose: () => removeWidget(instance.id),
                }}
              >
                <div className="island-widgets__content">
                  {isCustom ? (
                    <CustomWidget
                      instance={instance}
                      onSaved={(settings) =>
                        setInstances((prev) => prev.map((i) => (i.id === instance.id ? { ...i, settings } : i)))
                      }
                    />
                  ) : (
                    Component && <Component />
                  )}
                </div>
              </WidgetChromeContext.Provider>
            </div>
          );
        })}
      </div>
    </div>
  );
}
