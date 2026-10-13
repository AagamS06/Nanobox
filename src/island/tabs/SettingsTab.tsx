import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import { THEMES } from "../../themes/themes";
import { getTheme, setTheme, subscribeTheme } from "../../core/themeStore";
import { getHotkeysEnabled, hotkeyLabel, HOTKEYS, setHotkeysEnabled } from "../../core/hotkeySettings";
import { setIslandVisible } from "../islandWindow";
import type { ThemeId } from "../../themes/themes";

/** Quick settings — the things worth one flick away. Everything else lives in the full Settings panel. */
export function SettingsTab() {
  const [theme, setThemeState] = useState<ThemeId>(getTheme());
  const [hotkeys, setHotkeys] = useState(true);
  const [hotkeyProblem, setHotkeyProblem] = useState<string | null>(null);
  const [clipboardOn, setClipboardOn] = useState(true);
  const [widgetsVisible, setWidgetsVisible] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeTheme(() => setThemeState(getTheme()));
    getHotkeysEnabled().then(setHotkeys).catch(() => {});
    invoke<boolean>("clipboard_is_paused")
      .then((p) => setClipboardOn(!p))
      .catch(() => {});
    Window.getByLabel("overlay")
      .then((w) => w?.isVisible())
      .then((v) => setWidgetsVisible(v ?? true))
      .catch(() => {});
    return unsubscribe;
  }, []);

  async function toggleHotkeys() {
    const next = !hotkeys;
    const failed = await setHotkeysEnabled(next);
    setHotkeys(next);
    setHotkeyProblem(failed.length ? `Another app is using ${failed.join(" and ")}.` : null);
  }

  async function toggleClipboard() {
    const next = !clipboardOn;
    await invoke("clipboard_set_paused", { paused: !next });
    setClipboardOn(next);
  }

  async function toggleWidgets() {
    const overlay = await Window.getByLabel("overlay");
    if (!overlay) return;
    if (widgetsVisible) await overlay.hide();
    else await overlay.show();
    setWidgetsVisible(!widgetsVisible);
  }

  return (
    <div className="island-settings">
      <label className="island-setting">
        <span>Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <Toggle label="Show widgets" checked={widgetsVisible} onChange={toggleWidgets} />
      <Toggle label="Clipboard history" checked={clipboardOn} onChange={toggleClipboard} />
      <Toggle
        label="Keyboard shortcuts"
        checked={hotkeys}
        onChange={toggleHotkeys}
        hint={`${hotkeyLabel("capture")} ${HOTKEYS.capture.what.toLowerCase()} · ${hotkeyLabel("peek")} ${HOTKEYS.peek.what.toLowerCase()}`}
      />
      {hotkeyProblem && <p className="island-error">{hotkeyProblem}</p>}

      <div className="island-settings__buttons">
        <button className="island-btn" onClick={() => invoke("peek_widgets")}>
          Bring widgets to front
        </button>
        <button className="island-btn" onClick={() => emit("nanobox:open-settings")}>
          All settings…
        </button>
        <button className="island-btn" onClick={() => setIslandVisible(false)}>
          Hide island
        </button>
      </div>
      <p className="island-muted">Bring the island back from the tray icon menu.</p>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: () => void; hint?: string }) {
  return (
    <div className="island-setting">
      <span>
        {label}
        {hint && <span className="island-muted island-setting__hint">{hint}</span>}
      </span>
      <button role="switch" aria-checked={checked} aria-label={label} className={`island-switch ${checked ? "is-on" : ""}`} onClick={onChange}>
        <span />
      </button>
    </div>
  );
}
