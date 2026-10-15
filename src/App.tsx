import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
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
import { setAppMode, showToolWindow, useAppMode } from "./core/appMode";

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
  const mode = useAppMode();
  // Set when the island asked for Settings / the Block Builder, so the window
  // goes back where it was (hidden in island mode, behind your apps in
  // desktop mode) once they're closed.
  const openedAsTool = useRef(false);

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
    startCrossWindowBridge();
    applySavedHotkeys().catch((err) => console.error("hotkey setup failed", err));
    // The island's "All settings…" and "Block builder…" buttons.
    const unlistenSettings = listen("nanobox:open-settings", () => {
      openedAsTool.current = true;
      void showToolWindow(true);
      setSettingsOpen(true);
    });
    const unlistenBuilder = listen("nanobox:open-block-builder", () => {
      openedAsTool.current = true;
      void showToolWindow(true);
      setBlockBuilderOpen(true);
    });
    return () => {
      for (const u of [unlistenSettings, unlistenBuilder]) u.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Alarms, reminders, routines and to-do nudges run from here in desktop
  // mode. In island mode this window is hidden, so the island runs them.
  useEffect(() => {
    if (mode === "desktop") return startScheduler();
  }, [mode]);

  // Put the window back once whatever the island opened here is closed.
  useEffect(() => {
    if (!settingsOpen && !blockBuilderOpen && openedAsTool.current) {
      openedAsTool.current = false;
      void showToolWindow(false);
    }
  }, [settingsOpen, blockBuilderOpen]);

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
        ) : mode === "island" ? (
          <IslandModeHost
            onSettings={() => setSettingsOpen(true)}
            onBlockBuilder={() => setBlockBuilderOpen(true)}
          />
        ) : (
          onboardingDone &&
          mode === "desktop" && (
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

/**
 * What this window shows in island mode, when it only appears to host full
 * Settings or the Block Builder (your widgets are in the island then).
 */
function IslandModeHost({ onSettings, onBlockBuilder }: { onSettings: () => void; onBlockBuilder: () => void }) {
  return (
    <div className="island-mode-host">
      <h1>Nanobox is in island mode</h1>
      <p>Your widgets live in the island at the top of your screen — hover it to open them.</p>
      <div className="island-mode-host__buttons">
        <button onClick={onSettings}>Settings</button>
        <button onClick={onBlockBuilder}>Block builder</button>
        <button
          className="island-mode-host__primary"
          onClick={() => setAppMode("desktop").catch((err) => console.error("failed to switch mode", err))}
        >
          Switch to desktop mode
        </button>
      </div>
    </div>
  );
}

export default App;
