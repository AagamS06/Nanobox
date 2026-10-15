import { useEffect, useRef, useState } from "react";
import { THEMES, ThemeId } from "../themes/themes";
import { getTheme, setTheme, getThemeTint } from "../core/themeStore";
import { isHighContrast, setHighContrast } from "../core/contrastStore";
import { deriveShades } from "../core/colorShades";
import { playTone } from "../widgets/built-in/Alarm/tones";
import type { AlarmSound } from "../storage/alarms";
import { ThemeCustomizer } from "./ThemeCustomizer";
import { isColorblindPalette, setColorblindPalette } from "../core/colorblindPalette";
import { ModeSwitch } from "./ModeSwitch";
import { APP_MODE_HINTS, APP_MODE_OPTIONS, AppMode, getAppMode, setAppMode } from "../core/appMode";
import { getPanelSize, PANEL_SIZE_OPTIONS, PanelSizeId, setPanelSize } from "../island/islandWindow";
import "./SettingsPanel.css";

const SOUND_LABELS: Record<AlarmSound, string> = { chime: "Chime", beep: "Beep", digital: "Digital" };

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [theme, setThemeLocal] = useState(getTheme());
  const [accentColor, setAccentColor] = useState(localStorage.getItem("settings:accentColor") || "#7c9cff");
  const [fontSize, setFontSize] = useState(parseFloat(localStorage.getItem("settings:fontSize") || "1"));
  const [opacity, setOpacity] = useState(parseFloat(localStorage.getItem("settings:opacity") || "1"));
  const [autostart, setAutostart] = useState(localStorage.getItem("settings:autostart") === "true");
  const [highContrast, setHighContrastLocal] = useState(isHighContrast());
  const [defaultSound, setDefaultSound] = useState<AlarmSound>(
    (localStorage.getItem("settings:defaultSound") as AlarmSound) || "chime",
  );
  const [themeTints, setThemeTintsLocal] = useState<Partial<Record<ThemeId, string>>>(() => {
    const map: Partial<Record<ThemeId, string>> = {};
    THEMES.forEach((t) => {
      const stored = getThemeTint(t.id);
      if (stored) map[t.id] = stored;
    });
    return map;
  });
  const [customizingId, setCustomizingId] = useState<ThemeId | null>(null);
  const [colorblindPalette, setColorblindPaletteLocal] = useState(isColorblindPalette());
  const [appMode, setAppModeLocal] = useState<AppMode>("desktop");
  const [savedAppMode, setSavedAppMode] = useState<AppMode>("desktop");
  const [panelSize, setPanelSizeLocal] = useState<PanelSizeId>("roomy");
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-read the live values every time the panel opens. They can change while
  // it's closed (the theme switcher, the island, the tray), and saving stale
  // copies would quietly undo those changes.
  useEffect(() => {
    if (!open) return;
    setThemeLocal(getTheme());
    setHighContrastLocal(isHighContrast());
    setColorblindPaletteLocal(isColorblindPalette());
    getAppMode().then((m) => {
      setAppModeLocal(m);
      setSavedAppMode(m);
    });
    getPanelSize()
      .then(setPanelSizeLocal)
      .catch(() => {});
  }, [open]);

  function refreshThemeTint(id: ThemeId) {
    setThemeTintsLocal((prev) => {
      const stored = getThemeTint(id);
      const next = { ...prev };
      if (stored) next[id] = stored;
      else delete next[id];
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  function saveSettings() {
    setTheme(theme);
    setHighContrast(highContrast);
    localStorage.setItem("settings:accentColor", accentColor);
    localStorage.setItem("settings:fontSize", fontSize.toString());
    localStorage.setItem("settings:opacity", opacity.toString());
    localStorage.setItem("settings:autostart", autostart.toString());
    localStorage.setItem("settings:defaultSound", defaultSound);
    setColorblindPalette(colorblindPalette);
    // Only apply accent shades when the colourblind palette isn't overriding them
    if (!colorblindPalette) {
      const shades = deriveShades(accentColor);
      document.documentElement.style.setProperty("--nb-accent", shades.accent);
      document.documentElement.style.setProperty("--nb-accent-text", shades.accentText);
      document.documentElement.style.setProperty("--nb-surface-alt", shades.surfaceAlt);
    }
    document.documentElement.style.setProperty("font-size", `${fontSize * 100}%`);
    document.documentElement.style.setProperty("opacity", opacity.toString());
    setPanelSize(panelSize).catch((err) => console.error("failed to save island size", err));
    onClose();
    // Last, since switching mode shows / hides this window.
    if (appMode !== savedAppMode) {
      setAppMode(appMode).catch((err) => console.error("failed to switch mode", err));
    }
  }

  function resetToDefaults() {
    setThemeLocal(getTheme());
    setAccentColor("#7c9cff");
    setFontSize(1);
    setOpacity(1);
    setAutostart(false);
    setHighContrastLocal(false);
    setDefaultSound("chime");
  }

  if (!open) return null;

  return (
    <div className="settings-panel__overlay">
      <div className="settings-panel" ref={panelRef}>
        <div className="settings-panel__header">
          <h1 className="settings-panel__title">Settings</h1>
          <button className="settings-panel__close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-panel__content">
          {/* Desktop or island */}
          <div className="settings-section">
            <div className="settings-section__row">
              <span className="settings-section__label">Nanobox mode</span>
              <ModeSwitch label="Nanobox mode" options={APP_MODE_OPTIONS} value={appMode} onChange={setAppModeLocal} />
            </div>
            <p className="settings-section__hint">{APP_MODE_HINTS[appMode]}</p>
            {appMode === "island" && (
              <div className="settings-section__row settings-section__row--sub">
                <span className="settings-section__label">Island size</span>
                <ModeSwitch label="Island size" options={PANEL_SIZE_OPTIONS} value={panelSize} onChange={setPanelSizeLocal} />
              </div>
            )}
          </div>

          {/* Theme Selector */}
          <div className="settings-section">
            <label className="settings-section__label">Theme</label>
            <div className="settings-section__options">
              {THEMES.map((t) => (
                <div key={t.id} className="theme-option-row">
                  <button
                    className={`theme-option ${theme === t.id ? "is-active" : ""}`}
                    onClick={() => setThemeLocal(t.id)}
                    title={t.description}
                  >
                    <span className="theme-option__label">{t.label}</span>
                    {themeTints[t.id] && (
                      <span className="theme-option__tint-dot" style={{ background: themeTints[t.id] }} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="theme-option__customize"
                    onClick={() => setCustomizingId(t.id)}
                    title={`Customize ${t.label}`}
                    aria-label={`Customize ${t.label} theme`}
                  >
                    ⚙
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Accent Color Picker */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="accent-color" className="settings-section__label">
                Accent Color
              </label>
              <div className="color-picker">
                <input
                  id="accent-color"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="color-picker__input"
                />
                <span className="color-picker__value">{accentColor}</span>
              </div>
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="font-size" className="settings-section__label">
                Font Size
              </label>
              <div className="slider-group">
                <input
                  id="font-size"
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseFloat(e.target.value))}
                  className="slider-group__slider"
                />
                <span className="slider-group__value">{Math.round(fontSize * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="opacity" className="settings-section__label">
                Window Opacity
              </label>
              <div className="slider-group">
                <input
                  id="opacity"
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="slider-group__slider"
                />
                <span className="slider-group__value">{Math.round(opacity * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Autostart Toggle */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="autostart" className="settings-section__label">
                Launch on startup
              </label>
              <label className="toggle-switch">
                <input
                  id="autostart"
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => setAutostart(e.target.checked)}
                  className="toggle-switch__input"
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>
          </div>

          {/* High Contrast Toggle */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="high-contrast" className="settings-section__label">
                High contrast mode
              </label>
              <label className="toggle-switch">
                <input
                  id="high-contrast"
                  type="checkbox"
                  checked={highContrast}
                  onChange={(e) => setHighContrastLocal(e.target.checked)}
                  className="toggle-switch__input"
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>
          </div>

          {/* Default Notification Sound */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="default-sound" className="settings-section__label">
                Default notification sound
              </label>
              <div className="sound-picker">
                <select
                  id="default-sound"
                  value={defaultSound}
                  onChange={(e) => setDefaultSound(e.target.value as AlarmSound)}
                >
                  {(Object.keys(SOUND_LABELS) as AlarmSound[]).map((s) => (
                    <option key={s} value={s}>
                      {SOUND_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sound-picker__preview"
                  onClick={() => playTone(defaultSound)}
                  aria-label="Preview sound"
                  title="Preview sound"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Colourblind palette */}
          <div className="settings-section">
            <div className="settings-section__row">
              <label htmlFor="colorblind-palette" className="settings-section__label">
                Colourblind palette
              </label>
              <label className="toggle-switch">
                <input
                  id="colorblind-palette"
                  type="checkbox"
                  checked={colorblindPalette}
                  onChange={(e) => setColorblindPaletteLocal(e.target.checked)}
                  className="toggle-switch__input"
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>
            <p className="settings-section__hint">
              Switches the accent colours to an Okabe-Ito palette safe for protanopia, deuteranopia, and tritanopia.
              Saved as a preference and applied on every launch.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="settings-panel__actions">
          <button className="settings-panel__btn settings-panel__btn--secondary" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <div className="settings-panel__actions-right">
            <button className="settings-panel__btn" onClick={onClose}>
              Cancel
            </button>
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
      </div>

      {customizingId && (
        <ThemeCustomizer
          theme={THEMES.find((t) => t.id === customizingId)!}
          onClose={() => {
            refreshThemeTint(customizingId);
            setCustomizingId(null);
          }}
          onImported={(id) => {
            refreshThemeTint(id);
            setThemeLocal(id);
          }}
        />
      )}
    </div>
  );
}
