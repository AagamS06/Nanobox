import { CSSProperties, ReactNode, forwardRef } from "react";
import { deriveShades } from "../core/colorShades";
import { BORDER_STYLE_LABELS, BORDER_STYLES, borderStyleCss, BorderStyleId } from "../core/widgetBorderStyles";
import type { WidgetInstance } from "../storage/widgetInstances";

/**
 * Per-widget appearance (opacity, colour, border style) shared by the desktop
 * grid and the island's Widgets tab, so a widget looks and is customised the
 * same way in both modes.
 */

export interface WidgetStyleSettings {
  color?: string;
  borderStyle?: BorderStyleId;
}

/** Staged (not-yet-saved) edits for whichever widget's settings popover is open. */
export interface PopoverDraft extends WidgetStyleSettings {
  opacity: number;
}

export function parseStyleSettings(raw: string | null): WidgetStyleSettings {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** JSON for the style_settings column, or null when nothing is overridden. */
export function serializeStyleSettings(next: WidgetStyleSettings): string | null {
  // Drop undefined-valued keys (e.g. a "reset to theme" click) before deciding
  // whether anything's set — otherwise "{}" would be stored instead of NULL.
  const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}

export function draftFor(instance: WidgetInstance): PopoverDraft {
  return { opacity: instance.opacity, ...parseStyleSettings(instance.style_settings) };
}

/**
 * Opacity plus the accent/border CSS variables for one widget. With `draft`
 * (its popover is open) the staged values are previewed instead of the saved ones.
 */
export function widgetStyleVars(instance: WidgetInstance, draft?: PopoverDraft): CSSProperties {
  const style: CSSProperties = { opacity: draft ? draft.opacity : instance.opacity };
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

interface WidgetStylePopoverProps {
  draft: PopoverDraft;
  onChange: (draft: PopoverDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  /** Extra controls (the island adds height and ordering). */
  children?: ReactNode;
  className?: string;
}

export const WidgetStylePopover = forwardRef<HTMLDivElement, WidgetStylePopoverProps>(function WidgetStylePopover(
  { draft, onChange, onCancel, onSave, children, className = "" },
  ref,
) {
  return (
    <div className={`widget-grid__popover ${className}`} data-no-drag ref={ref}>
      <label>
        Opacity
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={draft.opacity}
          onChange={(e) => onChange({ ...draft, opacity: Number(e.target.value) })}
        />
      </label>

      <label>
        Colour
        <div className="widget-grid__color-row">
          <input
            type="color"
            value={draft.color ?? "#7c9cff"}
            onChange={(e) => onChange({ ...draft, color: e.target.value })}
          />
          {draft.color && (
            <button className="widget-grid__color-reset" onClick={() => onChange({ ...draft, color: undefined })}>
              Reset to theme
            </button>
          )}
        </div>
      </label>

      <label>
        Style
        <select
          value={draft.borderStyle ?? ""}
          onChange={(e) => onChange({ ...draft, borderStyle: (e.target.value || undefined) as BorderStyleId | undefined })}
        >
          <option value="">Theme default</option>
          {BORDER_STYLES.map((id) => (
            <option key={id} value={id}>
              {BORDER_STYLE_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      {children}

      <div className="widget-grid__popover-actions">
        <button className="widget-grid__popover-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="widget-grid__popover-btn widget-grid__popover-btn--primary" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
});
