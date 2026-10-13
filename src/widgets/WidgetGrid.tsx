import { useEffect, useRef, useState, CSSProperties } from "react";
import {
  createWidgetInstance,
  deleteWidgetInstance,
  listWidgetInstances,
  updateWidgetLayout,
  updateWidgetOpacity,
  updateWidgetStyle,
  WidgetInstance,
} from "../storage/widgetInstances";
import { isHidingOthers, subscribeFocusMode } from "../core/focusModeStore";
import { deriveShades } from "../core/colorShades";
import { BORDER_STYLE_LABELS, BORDER_STYLES, borderStyleCss, BorderStyleId } from "../core/widgetBorderStyles";
import { CustomWidget } from "./built-in";
import { WidgetChromeContext } from "./WidgetChromeContext";
import { DEFAULT_SIZE, WIDGET_LABELS, WIDGET_REGISTRY, WidgetId } from "./registry";
import { findFreeSpot } from "./placement";
import "./WidgetGrid.css";

const GRID_SNAP = 8;
const MIN_SIZE = 160;
const snap = (n: number) => Math.round(n / GRID_SNAP) * GRID_SNAP;

interface WidgetStyleSettings {
  color?: string;
  borderStyle?: BorderStyleId;
}

/** Staged (not-yet-saved) edits for whichever widget's settings popover is currently open. */
interface PopoverDraft extends WidgetStyleSettings {
  opacity: number;
}

function parseStyleSettings(raw: string | null): WidgetStyleSettings {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// When `draft` is supplied (the instance's settings popover is open), the staged-but-unsaved
// values are used for live preview instead of the persisted instance fields.
function cellStyle(instance: WidgetInstance, draft?: PopoverDraft): CSSProperties {
  const style: CSSProperties = {
    left: instance.x,
    top: instance.y,
    width: instance.w,
    height: instance.h,
    opacity: draft ? draft.opacity : instance.opacity,
  };
  const { color, borderStyle } = draft ?? parseStyleSettings(instance.style_settings);
  const shades = color ? deriveShades(color) : null;
  if (shades) {
    Object.assign(style, {
      "--nb-accent": shades.accent,
      "--nb-accent-text": shades.accentText,
      "--nb-surface-alt": shades.surfaceAlt,
    });
  }
  if (borderStyle) {
    const css = borderStyleCss(borderStyle, shades?.accent ?? "var(--nb-accent)");
    Object.assign(style, { "--nb-widget-border": css.border, "--nb-widget-shadow": css.boxShadow });
  }
  return style;
}

export function WidgetGrid() {
  const [instances, setInstances] = useState<WidgetInstance[]>([]);
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [popoverDraft, setPopoverDraft] = useState<PopoverDraft | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [hideOthers, setHideOthersState] = useState(isHidingOthers());
  const [gridError, setGridError] = useState(false);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const list = await listWidgetInstances();
    if (list.length === 0) {
      await createWidgetInstance({ widget_type: "clock", x: 24, y: 24, ...DEFAULT_SIZE.clock });
      setInstances(await listWidgetInstances());
    } else {
      setInstances(list);
    }
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load widget layout", err);
      setGridError(true);
    });
  }, []);

  useEffect(() => subscribeFocusMode(() => setHideOthersState(isHidingOthers())), []);

  // Lets the global "Add widget" keyboard shortcut (App.tsx) reach this
  // component's local menu state without lifting it or prop-drilling.
  useEffect(() => {
    function toggle() {
      setAddMenuOpen((v) => !v);
    }
    window.addEventListener("nanobox:toggle-add-widget", toggle);
    return () => window.removeEventListener("nanobox:toggle-add-widget", toggle);
  }, []);

  function addWidget(type: WidgetId) {
    const size = DEFAULT_SIZE[type];
    const container = containerRef.current;
    const { x, y } = findFreeSpot(instances, size, {
      bounds: { width: container?.clientWidth ?? 960, height: container?.clientHeight ?? 640 },
      step: GRID_SNAP,
    });
    createWidgetInstance({ widget_type: type, x: snap(x), y: snap(y), ...size })
      .then(async (id) => {
        await refresh();
        // Briefly highlight the new widget so it's obvious where it went.
        if (typeof id === "number") {
          setJustAddedId(id);
          setTimeout(() => setJustAddedId((current) => (current === id ? null : current)), 1600);
        }
      })
      .catch((err) => console.error("failed to add widget", err));
    setAddMenuOpen(false);
  }

  function removeWidget(id: number) {
    deleteWidgetInstance(id)
      .then(refresh)
      .catch((err) => console.error("failed to remove widget", err));
    setOpenPopoverId(null);
    setPopoverDraft(null);
  }

  function setOpacity(id: number, opacity: number) {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, opacity } : i)));
    updateWidgetOpacity(id, opacity).catch((err) => console.error("failed to save opacity", err));
  }

  function setStyle(id: number, next: WidgetStyleSettings) {
    // Drop undefined-valued keys (e.g. a "reset to theme" click) before deciding
    // whether anything's actually set — Object.keys() counts them even though
    // JSON.stringify would silently omit them, which previously could persist
    // "{}" instead of clearing the column to NULL.
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as WidgetStyleSettings;
    const json = Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, style_settings: json } : i)));
    updateWidgetStyle(id, json).catch((err) => console.error("failed to save widget style", err));
  }

  // Opens (or closes, if already open) the settings popover for `instance`, snapshotting its
  // current opacity/colour/border-style into local staged state. The three popover controls edit
  // only this staged draft — nothing is persisted until Save (or outside-click/Escape, which save
  // per Error 13) or discarded via Cancel.
  function togglePopover(instance: WidgetInstance) {
    if (openPopoverId === instance.id) {
      setOpenPopoverId(null);
      setPopoverDraft(null);
      return;
    }
    const { color, borderStyle } = parseStyleSettings(instance.style_settings);
    setPopoverDraft({ opacity: instance.opacity, color, borderStyle });
    setOpenPopoverId(instance.id);
  }

  // Closes whichever popover is open. `save` commits the staged draft via the same
  // setOpacity/setStyle calls the old live-editing controls used to call directly (so local
  // instance-list state and the DB both get updated); Cancel passes false to just discard it.
  function closePopover(save: boolean) {
    if (save && openPopoverId !== null && popoverDraft) {
      setOpacity(openPopoverId, popoverDraft.opacity);
      setStyle(openPopoverId, { color: popoverDraft.color, borderStyle: popoverDraft.borderStyle });
    }
    setOpenPopoverId(null);
    setPopoverDraft(null);
  }

  // Click-outside-to-save (Error 13) and Escape-to-save, mirroring the useRef + mousedown
  // pattern used by SettingsPanel/FocusMode, but saving rather than discarding on dismiss.
  useEffect(() => {
    if (openPopoverId === null) return;
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        closePopover(true);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePopover(true);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPopoverId, popoverDraft]);

  function onCustomWidgetSaved(id: number, settings: string) {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, settings } : i)));
  }

  function startDrag(e: React.PointerEvent, instance: WidgetInstance) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = instance.x;
    const originY = instance.y;
    const bounds = containerRef.current?.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nextX = originX + dx;
      let nextY = originY + dy;
      if (bounds) {
        nextX = Math.max(0, Math.min(nextX, bounds.width - instance.w));
        nextY = Math.max(0, Math.min(nextY, bounds.height - instance.h));
      }
      setInstances((prev) => prev.map((i) => (i.id === instance.id ? { ...i, x: nextX, y: nextY } : i)));
    }

    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setInstances((prev) => {
        const current = prev.find((i) => i.id === instance.id);
        if (current) {
          const snapped = { x: snap(current.x), y: snap(current.y), w: current.w, h: current.h };
          updateWidgetLayout(instance.id, snapped).catch((err) => console.error("failed to save position", err));
          return prev.map((i) => (i.id === instance.id ? { ...i, ...snapped } : i));
        }
        return prev;
      });
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function startResize(e: React.PointerEvent, instance: WidgetInstance) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originW = instance.w;
    const originH = instance.h;

    function onMove(ev: PointerEvent) {
      const nextW = Math.max(MIN_SIZE, originW + (ev.clientX - startX));
      const nextH = Math.max(MIN_SIZE, originH + (ev.clientY - startY));
      setInstances((prev) => prev.map((i) => (i.id === instance.id ? { ...i, w: nextW, h: nextH } : i)));
    }

    function onUp() {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setInstances((prev) => {
        const current = prev.find((i) => i.id === instance.id);
        if (current) {
          const snapped = { x: current.x, y: current.y, w: snap(current.w), h: snap(current.h) };
          updateWidgetLayout(instance.id, snapped).catch((err) => console.error("failed to save size", err));
          return prev.map((i) => (i.id === instance.id ? { ...i, ...snapped } : i));
        }
        return prev;
      });
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  if (gridError) {
    return (
      <div className="widget-grid widget-grid--error">
        <p style={{ padding: "24px", color: "var(--nb-text-muted)" }}>
          ⚠ Failed to load widgets. Restart the app to retry.
        </p>
      </div>
    );
  }

  return (
    <div className="widget-grid" ref={containerRef}>
      {instances.map((instance) => {
        // "block-widget" rows predate the combined Custom Widget; migration 11
        // converts them, and this keeps any straggler rendering as one too.
        const isCustom = instance.widget_type === "custom" || (instance.widget_type as string) === "block-widget";
        const Component = isCustom ? null : WIDGET_REGISTRY[instance.widget_type as Exclude<WidgetId, "custom">];
        const isFocusMode = instance.widget_type === "focus-mode";
        if (!isCustom && !Component) return null;
        const isPopoverOpen = openPopoverId === instance.id;
        // Falls back to the instance's persisted values so this still renders sanely even if
        // the draft snapshot is somehow missing (it's always set by togglePopover in practice).
        const draft: PopoverDraft =
          isPopoverOpen && popoverDraft ? popoverDraft : { opacity: instance.opacity, ...parseStyleSettings(instance.style_settings) };

        return (
          <div
            key={instance.id}
            className={`widget-grid__cell ${hideOthers && !isFocusMode ? "is-dimmed" : ""} ${justAddedId === instance.id ? "is-new" : ""}`}
            style={cellStyle(instance, isPopoverOpen ? draft : undefined)}
          >
            {isPopoverOpen && (
              <div className="widget-grid__popover" data-no-drag ref={popoverRef}>
                <label>
                  Opacity
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={draft.opacity}
                    onChange={(e) => setPopoverDraft({ ...draft, opacity: Number(e.target.value) })}
                  />
                </label>

                <label>
                  Colour
                  <div className="widget-grid__color-row">
                    <input
                      type="color"
                      value={draft.color ?? "#7c9cff"}
                      onChange={(e) => setPopoverDraft({ ...draft, color: e.target.value })}
                    />
                    {draft.color && (
                      <button className="widget-grid__color-reset" onClick={() => setPopoverDraft({ ...draft, color: undefined })}>
                        Reset to theme
                      </button>
                    )}
                  </div>
                </label>

                <label>
                  Style
                  <select
                    value={draft.borderStyle ?? ""}
                    onChange={(e) =>
                      setPopoverDraft({
                        ...draft,
                        borderStyle: (e.target.value || undefined) as BorderStyleId | undefined,
                      })
                    }
                  >
                    <option value="">Theme default</option>
                    {BORDER_STYLES.map((id) => (
                      <option key={id} value={id}>
                        {BORDER_STYLE_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="widget-grid__popover-actions">
                  <button className="widget-grid__popover-btn" onClick={() => closePopover(false)}>
                    Cancel
                  </button>
                  <button
                    className="widget-grid__popover-btn widget-grid__popover-btn--primary"
                    onClick={() => closePopover(true)}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            <WidgetChromeContext.Provider
              value={{
                onDragStart: (e) => startDrag(e, instance),
                onOpenSettings: () => togglePopover(instance),
                onClose: () => removeWidget(instance.id),
              }}
            >
              <div className="widget-grid__content">
                {isCustom ? (
                  <CustomWidget instance={instance} onSaved={(settings) => onCustomWidgetSaved(instance.id, settings)} />
                ) : (
                  Component && <Component />
                )}
              </div>
            </WidgetChromeContext.Provider>

            <div className="widget-grid__resize" onPointerDown={(e) => startResize(e, instance)} />
          </div>
        );
      })}

      <div className="widget-grid__add">
        <button className="widget-grid__add-btn" onClick={() => setAddMenuOpen((v) => !v)}>
          + Add widget
        </button>
        {addMenuOpen && (
          <div className="widget-grid__add-menu">
            {(Object.keys(WIDGET_LABELS) as WidgetId[]).map((id) => (
              <button key={id} onClick={() => addWidget(id)}>
                {WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
