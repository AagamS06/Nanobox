import { getSetting, setSetting } from "../storage/settings";
import { DEFAULT_THEME, isThemeId, ThemeId } from "../themes/themes";
import { deriveShades } from "./colorShades";
import { BorderStyleId, borderStyleCss } from "./widgetBorderStyles";
import { broadcast, THEME_CHANGED_EVENT } from "./crossWindow";

/** Minimal external store (same shape as focusModeStore) for the active theme, persisted via app_settings. */
type Listener = () => void;

const THEME_SETTING_KEY = "theme";
const CUSTOM_STORAGE_PREFIX = "settings:themeCustom:";
/** Superseded by CUSTOM_STORAGE_PREFIX below — kept read-only for one-time migration of tints saved before this key existed. */
const LEGACY_TINT_STORAGE_PREFIX = "settings:themeTint:";

export interface ThemeCustomization {
  /** "Stain" colour — re-derives accent/accent-text/surface-alt, same mechanism as the global accent picker. */
  tint?: string;
  /** Multiplier on the theme's base font size, e.g. 0.8–1.3. */
  fontScale?: number;
  /** Corner radius in px, overriding the theme's own --nb-radius. */
  radius?: number;
  /** Overrides every widget's border/shadow (per-widget overrides still win over this). */
  borderStyle?: BorderStyleId;
}

let theme: ThemeId = DEFAULT_THEME;
let loaded = false;
const listeners = new Set<Listener>();

function customStorageKey(id: ThemeId): string {
  return `${CUSTOM_STORAGE_PREFIX}${id}`;
}

/** Reads the stored customization for a given theme, if any. Migrates a legacy tint-only entry on first read. */
export function getThemeCustomization(id: ThemeId): ThemeCustomization {
  try {
    const raw = localStorage.getItem(customStorageKey(id));
    if (raw) return JSON.parse(raw);

    const legacyTint = localStorage.getItem(`${LEGACY_TINT_STORAGE_PREFIX}${id}`);
    if (legacyTint) {
      const migrated: ThemeCustomization = { tint: legacyTint };
      localStorage.setItem(customStorageKey(id), JSON.stringify(migrated));
      localStorage.removeItem(`${LEGACY_TINT_STORAGE_PREFIX}${id}`);
      return migrated;
    }
  } catch (err) {
    console.error("failed to read theme customization", err);
  }
  return {};
}

/** Merges `patch` into the stored customization for a theme (undefined values clear that field) and re-applies live if it's active. */
export function setThemeCustomization(id: ThemeId, patch: Partial<ThemeCustomization>) {
  const current = getThemeCustomization(id);
  const next: ThemeCustomization = { ...current, ...patch };
  (Object.keys(next) as (keyof ThemeCustomization)[]).forEach((key) => {
    if (next[key] === undefined) delete next[key];
  });

  try {
    if (Object.keys(next).length > 0) {
      localStorage.setItem(customStorageKey(id), JSON.stringify(next));
    } else {
      localStorage.removeItem(customStorageKey(id));
    }
  } catch (err) {
    console.error("failed to persist theme customization", err);
  }
  if (id === theme) applyCustomization(id);
}

/** Back-compat convenience wrapper — most call sites only ever touched the tint. */
export function getThemeTint(id: ThemeId): string | null {
  return getThemeCustomization(id).tint ?? null;
}
export function setThemeTint(id: ThemeId, hex: string | null) {
  setThemeCustomization(id, { tint: hex ?? undefined });
}

/**
 * Applies (or clears) a theme's stored customization as inline overrides on
 * top of whichever theme CSS just loaded — same mechanism as the global
 * accent-color picker and the per-widget colour/border picker, just scoped
 * to <html> per-theme.
 */
function applyCustomization(id: ThemeId) {
  const custom = getThemeCustomization(id);
  const root = document.documentElement.style;

  if (custom.tint) {
    const shades = deriveShades(custom.tint);
    root.setProperty("--nb-accent", shades.accent);
    root.setProperty("--nb-accent-text", shades.accentText);
    root.setProperty("--nb-surface-alt", shades.surfaceAlt);
  } else {
    root.removeProperty("--nb-accent");
    root.removeProperty("--nb-accent-text");
    root.removeProperty("--nb-surface-alt");
  }

  if (custom.fontScale) {
    root.setProperty("--nb-font-scale", custom.fontScale.toString());
  } else {
    root.removeProperty("--nb-font-scale");
  }

  if (custom.radius !== undefined) {
    root.setProperty("--nb-radius", `${custom.radius}px`);
  } else {
    root.removeProperty("--nb-radius");
  }

  if (custom.borderStyle) {
    const accent = custom.tint ? deriveShades(custom.tint).accent : "var(--nb-accent)";
    const css = borderStyleCss(custom.borderStyle, accent);
    root.setProperty("--nb-widget-border", css.border);
    root.setProperty("--nb-widget-shadow", css.boxShadow);
  } else {
    root.removeProperty("--nb-widget-border");
    root.removeProperty("--nb-widget-shadow");
  }
}

function applyToDocument(next: ThemeId) {
  document.documentElement.dataset.theme = next;
  applyCustomization(next);
}

export function getTheme(): ThemeId {
  return theme;
}

export function setTheme(next: ThemeId) {
  theme = next;
  applyToDocument(next);
  listeners.forEach((l) => l());
  setSetting(THEME_SETTING_KEY, next).catch((err) => console.error("failed to save theme", err));
  // The island and the widgets window each have their own copy of this store.
  broadcast(THEME_CHANGED_EVENT, next);
}

/** Applies a theme chosen in the other window, without saving or re-broadcasting it. */
function applyThemeFromOtherWindow(event: Event) {
  const next = (event as CustomEvent).detail;
  if (!isThemeId(next) || next === theme) return;
  theme = next;
  applyToDocument(next);
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener(THEME_CHANGED_EVENT, applyThemeFromOtherWindow);
}

export function subscribeTheme(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Loads the persisted theme (if any) and applies it. Call once on app startup. */
export async function initTheme(): Promise<void> {
  if (loaded) return;
  loaded = true;
  applyToDocument(theme);
  try {
    const saved = await getSetting(THEME_SETTING_KEY);
    if (isThemeId(saved) && saved !== theme) {
      theme = saved;
      applyToDocument(theme);
      listeners.forEach((l) => l());
    }
  } catch (err) {
    console.error("failed to load saved theme", err);
  }
}
