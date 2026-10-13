import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { WidgetGrid } from "./widgets/WidgetGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { TitleBar } from "./components/TitleBar";
import { OnboardingWizard, hasCompletedOnboarding } from "./components/OnboardingWizard";

/**
 * React Flow is ~230 KB of the bundle and the builder is an occasional
 * full-screen overlay, so it loads on first open rather than at startup.
 */
const BlockBuilder = lazy(() =>
  import("./components/blockBuilder/BlockBuilder").then((m) => ({ default: m.BlockBuilder })),
);
import { ensureAutostart } from "./core/autostart";
import { getDb } from "./storage/db";
import { initGlobalKeyboardNav } from "./core/keyboardNav";
import { initContrast } from "./core/contrastStore";
import { initColorblindPalette } from "./core/colorblindPalette";
import { getTheme, setTheme } from "./core/themeStore";
import { THEMES } from "./themes/themes";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";
import "./core/keyboardNav.css";
import { startScheduler } from "./core/scheduler";
import { startCrossWindowBridge } from "./core/crossWindow";
import { applySavedHotkeys } from "./core/hotkeySettings";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

function cycleTheme(reverse: boolean) {
  const ids = THEMES.map((t) => t.id);
  const currentIndex = ids.indexOf(getTheme());
  const nextIndex = ((reverse ? currentIndex - 1 : currentIndex + 1) + ids.length) % ids.length;
  setTheme(ids[nextIndex]);
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blockBuilderOpen, setBlockBuilderOpen] = useState(false);
  // Optimistic: assume onboarding is done so widgets render immediately.
  // The useEffect below corrects to false if the DB says otherwise, which
  // swaps in the onboarding wizard on the next paint — a rare, fast path.
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(true);

  useEffect(() => {
    ensureAutostart().catch((err) => console.error("autostart setup failed", err));
    getDb()
      .then(() => hasCompletedOnboarding())
      .then(setOnboardingDone)
      .catch((err) => {
        console.error("db init failed", err);
        setOnboardingDone(true); // fail open — don't block the app on a broken DB
      });
    initContrast().catch((err) => console.error("contrast init failed", err));
    initColorblindPalette();
    initGlobalKeyboardNav();
    // Alarms, reminders, routines and to-do nudges run from here for as long
    // as Nanobox is open — not from inside their widgets.
    const stopScheduler = startScheduler();
    startCrossWindowBridge();
    applySavedHotkeys().catch((err) => console.error("hotkey setup failed", err));
    // The island's "Open full settings" button.
    const unlisten = listen("nanobox:open-settings", () => {
      const win = getCurrentWindow();
      win.show().then(() => win.setFocus()).catch(() => {});
      setSettingsOpen(true);
    });
    return () => {
      stopScheduler();
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const toggleAddWidget = useCallback(() => {
    window.dispatchEvent(new Event("nanobox:toggle-add-widget"));
  }, []);

  useKeyboardNavigation([
    { key: "ctrl+,", action: () => setSettingsOpen((v) => !v), description: "Toggle settings" },
    { key: "ctrl+shift+a", action: toggleAddWidget, description: "Add a widget" },
    { key: "ctrl+shift+t", action: () => cycleTheme(false), description: "Cycle to next theme" },
    {
      key: "ctrl+shift+b",
      action: () => setBlockBuilderOpen((v) => !v),
      description: "Toggle the block builder",
    },
  ]);

  return (
    <main className="overlay">
      <TitleBar
        onSettingsClick={() => setSettingsOpen(true)}
        onBlockBuilderClick={() => setBlockBuilderOpen(true)}
      />
      <div className="overlay__body">
        {onboardingDone === false ? (
          <OnboardingWizard onComplete={() => setOnboardingDone(true)} />
        ) : (
          onboardingDone && (
            <>
              <WidgetGrid />
              <ThemeSwitcher />
            </>
          )
        )}
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {blockBuilderOpen && (
          <Suspense fallback={null}>
            <BlockBuilder open onClose={() => setBlockBuilderOpen(false)} />
          </Suspense>
        )}
      </div>
    </main>
  );
}

export default App;
