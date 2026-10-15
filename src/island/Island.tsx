import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ModeSwitch } from "../components/ModeSwitch";
import { initTheme } from "../core/themeStore";
import { initColorblindPalette } from "../core/colorblindPalette";
import { initContrast } from "../core/contrastStore";
import { AppMode, useAppMode } from "../core/appMode";
import { getRingingAlarms, startScheduler, subscribeRinging } from "../core/scheduler";
import type { Alarm } from "../storage/alarms";
import { BRAIN_DUMP_CHANGED_EVENT, broadcast, startCrossWindowBridge } from "../core/crossWindow";
import { createBrainDumpEntry } from "../storage/brainDump";
import { createTodo, TODOS_CHANGED_EVENT } from "../storage/todos";
import type { NowPlayingData } from "../integrations/music/types";
import {
  COLLAPSED,
  EXPANDED,
  getIslandVisible,
  getPanelSize,
  hideIsland,
  PANEL_SIZE_CHANGED_EVENT,
  PANEL_SIZES,
  PanelSizeId,
  placeIsland,
  setIslandVisible,
  showIsland,
  toPanelSize,
} from "./islandWindow";
import { nextUp, PlanItem } from "./plans";
import { fetchActiveNowPlaying, MusicTab } from "./tabs/MusicTab";
import { loadPlans, PlansTab } from "./tabs/PlansTab";
import { ClipboardTab } from "./tabs/ClipboardTab";
import { AppsTab } from "./tabs/AppsTab";
import { WallpapersTab } from "./tabs/WallpapersTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { WidgetsTab } from "./tabs/WidgetsTab";
import { HoldOpenContext } from "./holdOpen";
import "./Island.css";

const WIDGETS_TAB = { id: "widgets", label: "Widgets", icon: "◫" } as const;
const TABS = [
  WIDGETS_TAB,
  { id: "music", label: "Music", icon: "♪" },
  { id: "plans", label: "Plans", icon: "◷" },
  { id: "clipboard", label: "Clipboard", icon: "⧉" },
  { id: "apps", label: "Apps", icon: "▦" },
  { id: "wallpapers", label: "Wallpapers", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** The Widgets tab only exists in island mode; in desktop mode the widgets are on the desktop. */
export function tabsFor(mode: AppMode | null) {
  return mode === "island" ? TABS : TABS.filter((t) => t.id !== "widgets");
}

const CAPTURE_TARGETS = [
  { value: "brain", label: "Brain Dump" },
  { value: "todo", label: "To-do" },
] as const;
type CaptureTarget = (typeof CAPTURE_TARGETS)[number]["value"];

const TAB_KEY = "island:tab";
const HOVER_OPEN_MS = 160;
const LEAVE_CLOSE_MS = 450;
const PILL_REFRESH_MS = 5_000;

function readTab(): TabId | null {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.id === saved)) return saved as TabId;
  } catch {
    /* storage unavailable */
  }
  return null;
}

function shortTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function planTime(hhmm: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return shortTime(new Date(2000, 0, 1, h, m));
}

/** What the collapsed pill says after the clock: a ringing alarm, the song, else what's next, else the date. */
export function pillSummary(music: NowPlayingData | null, next: PlanItem | null, now: Date, ringing: Alarm[] = []): string {
  if (ringing.length) return `⏰ ${ringing[0].label || "Alarm"}${ringing.length > 1 ? ` +${ringing.length - 1}` : ""}`;
  if (music?.isPlaying) return `♪ ${music.trackTitle}${music.artist ? ` – ${music.artist}` : ""}`;
  if (next) return `Next: ${next.title} · ${planTime(next.time)}`;
  return now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * The island: a pill at the top-centre of the screen showing the time and
 * what's playing (or what's next). Hover, scroll down on it, or press the
 * quick-capture hotkey and it opens into a panel with a capture box and
 * Music / Plans / Clipboard / Apps / Wallpapers / Settings tabs.
 *
 * In island mode it's the whole app: it's always shown, opens bigger (size
 * picked in Settings), gains a Widgets tab holding every widget, and runs the
 * alarm/reminder/routine scheduler (the desktop window is hidden then).
 */
export default function Island() {
  const mode = useAppMode();
  const [expanded, setExpanded] = useState(false);
  const [savedTab, setTabState] = useState<TabId | null>(readTab);
  const [panelSize, setPanelSizeState] = useState<PanelSizeId>("roomy");
  const [pinned, setPinned] = useState(false);
  const [ringing, setRinging] = useState<Alarm[]>([]);
  const [now, setNow] = useState(new Date());
  const [music, setMusic] = useState<NowPlayingData | null>(null);
  const [next, setNext] = useState<PlanItem | null>(null);
  const [target, setTarget] = useState<CaptureTarget>("brain");
  const [draft, setDraft] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const expandedRef = useRef(false);
  const mouseInside = useRef(false);
  const holds = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHotkey = useRef(false);
  // While the window shrinks back to a pill, the pill briefly fills the old
  // big window — right under the mouse — which would re-open it on "hover".
  const ignoreHoverUntil = useRef(0);
  const captureRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<AppMode | null>(null);
  const panelSizeRef = useRef<PanelSizeId>("roomy");
  const pinnedRef = useRef(false);
  modeRef.current = mode;
  panelSizeRef.current = panelSize;
  pinnedRef.current = pinned;

  const tabs = tabsFor(mode);
  const tab: TabId =
    savedTab && tabs.some((t) => t.id === savedTab) ? savedTab : mode === "island" ? "widgets" : "plans";

  /** The open panel's size: bigger in island mode, where it also holds the widgets. */
  const openSize = () => (modeRef.current === "island" ? PANEL_SIZES[panelSizeRef.current] : EXPANDED);

  const setTab = (id: TabId) => {
    setTabState(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const expand = useCallback(async () => {
    if (expandedRef.current) return;
    expandedRef.current = true;
    // Grow the window first, then render the panel into it.
    await placeIsland(openSize()).catch(() => {});
    setExpanded(true);
  }, []);

  const collapse = useCallback(async () => {
    if (!expandedRef.current) return;
    expandedRef.current = false;
    ignoreHoverUntil.current = Date.now() + 500;
    setExpanded(false);
    await placeIsland(COLLAPSED).catch(() => {});
    // Opened by the hotkey while the island is switched off? Put it away again.
    if (openedByHotkey.current) {
      openedByHotkey.current = false;
      if (modeRef.current !== "island" && !(await getIslandVisible().catch(() => true))) {
        await hideIsland().catch(() => {});
      }
    }
  }, []);

  const maybeCollapse = useCallback(() => {
    if (pinnedRef.current || mouseInside.current || holds.current > 0 || document.hasFocus()) return;
    void collapse();
  }, [collapse]);

  const holdOpen = useCallback(<T,>(work: Promise<T>): Promise<T> => {
    holds.current += 1;
    return work.finally(() => {
      holds.current -= 1;
    });
  }, []);

  // Startup: theme, cross-window events.
  useEffect(() => {
    document.documentElement.classList.add("is-island");
    initTheme().catch(() => {});
    initColorblindPalette();
    initContrast().catch(() => {});
    startCrossWindowBridge();
    getPanelSize().then(setPanelSizeState).catch(() => {});

    const unlistenVisible = listen<boolean>("island:set-visible", (e) => void setIslandVisible(e.payload));
    const unlistenSize = listen<string>(PANEL_SIZE_CHANGED_EVENT, (e) => {
      const next = toPanelSize(e.payload);
      setPanelSizeState(next);
      panelSizeRef.current = next;
      if (expandedRef.current) void placeIsland(openSize()).catch(() => {});
    });
    // Peek hotkey in island mode: open or close the island.
    const unlistenToggle = listen("island:toggle", async () => {
      if (expandedRef.current) {
        setPinned(false);
        pinnedRef.current = false;
        await collapse();
      } else {
        await getCurrentWindow().show().catch(() => {});
        await expand();
        await getCurrentWindow().setFocus().catch(() => {});
      }
    });
    const unlistenCapture = listen("island:capture", async () => {
      openedByHotkey.current = !expandedRef.current;
      const win = getCurrentWindow();
      await placeIsland(expandedRef.current ? openSize() : COLLAPSED).catch(() => {});
      await win.show().catch(() => {});
      await expand();
      await win.setFocus().catch(() => {});
      setTimeout(() => captureRef.current?.focus(), 30);
    });
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) setTimeout(maybeCollapse, 50);
    });
    return () => {
      for (const u of [unlistenVisible, unlistenSize, unlistenToggle, unlistenCapture, unlistenFocus]) {
        u.then((fn) => fn()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expand, collapse, maybeCollapse]);

  // Which windows show depends on the mode: island mode always shows the
  // island; desktop mode respects "Hide island". Re-runs when it's switched.
  useEffect(() => {
    if (mode === null) return;
    if (mode === "island") {
      void placeIsland(expandedRef.current ? openSize() : COLLAPSED)
        .then(() => getCurrentWindow().show())
        .catch(() => {});
      // In island mode the desktop window is hidden, so the island runs the
      // alarms / reminders / routines / to-do nudges instead.
      return startScheduler();
    }
    // Back to desktop mode: close the (bigger) island-mode panel first, so it
    // isn't left open at the wrong size, then honour "Hide island".
    setPinned(false);
    pinnedRef.current = false;
    collapse()
      .then(() => getIslandVisible())
      .then((visible) => (visible ? showIsland() : hideIsland()))
      .catch(() => showIsland());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // A ringing alarm shows on the pill; in island mode the island also opens
  // on the Widgets tab so an Alarms widget's Dismiss / Snooze is right there.
  useEffect(() => {
    let previous = 0;
    return subscribeRinging(() => {
      const list = getRingingAlarms();
      setRinging(list);
      if (list.length > previous && modeRef.current === "island") {
        setTabState("widgets");
        void expand();
      }
      previous = list.length;
    });
  }, [expand]);

  // Clock + pill info.
  useEffect(() => {
    const refreshPill = () => {
      setNow(new Date());
      fetchActiveNowPlaying().then(setMusic).catch(() => {});
      loadPlans()
        .then((p) => setNext(nextUp(p, new Date())))
        .catch(() => {});
    };
    refreshPill();
    const clock = setInterval(() => setNow(new Date()), 15_000);
    const info = setInterval(refreshPill, PILL_REFRESH_MS);
    return () => {
      clearInterval(clock);
      clearInterval(info);
    };
  }, []);

  function onMouseEnter() {
    mouseInside.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!expandedRef.current && Date.now() >= ignoreHoverUntil.current) {
      openTimer.current = setTimeout(() => void expand(), HOVER_OPEN_MS);
    }
  }

  function onMouseLeave() {
    mouseInside.current = false;
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(maybeCollapse, LEAVE_CLOSE_MS);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      (document.activeElement as HTMLElement | null)?.blur();
      void collapse();
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (target === "brain") {
      await createBrainDumpEntry(text);
      broadcast(BRAIN_DUMP_CHANGED_EVENT);
    } else {
      await createTodo(text, null);
      broadcast(TODOS_CHANGED_EVENT);
    }
    setDraft("");
    setSavedNote(target === "brain" ? "Saved to Brain Dump ✓" : "Added to To-do ✓");
    setTimeout(() => setSavedNote(null), 1600);
    if (openedByHotkey.current) setTimeout(() => void collapse(), 700);
  }

  function onTabKey(e: KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[nextIndex].id);
    document.getElementById(`island-tab-${tabs[nextIndex].id}`)?.focus();
  }

  return (
    <HoldOpenContext.Provider value={holdOpen}>
      <div
        className={`island ${expanded ? "is-expanded" : ""}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onKeyDown={onKeyDown}
      >
        {!expanded && (
          <button
            className="island-pill"
            onClick={() => void expand()}
            onWheel={(e) => e.deltaY > 0 && void expand()}
            aria-label="Open the Nanobox island"
            aria-expanded={false}
          >
            <span className="island-pill__time">{shortTime(now)}</span>
            <span className="island-pill__dot" aria-hidden="true" />
            <span className={`island-pill__info ${ringing.length ? "island-pill__alarm" : ""}`}>
              {pillSummary(music, next, now, ringing)}
            </span>
          </button>
        )}
        {/* In island mode the panel stays mounted (just hidden) while the
            island is a pill, so widgets keep their timers and state. */}
        {(expanded || mode === "island") && (
          <div className="island-panel" role="dialog" aria-label="Nanobox island" hidden={!expanded}>
            <form className="island-capture" onSubmit={save}>
              <input
                ref={captureRef}
                className="island-capture__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={savedNote ?? "✎ Capture a thought…"}
                aria-label={target === "brain" ? "Capture to Brain Dump" : "Add a to-do"}
              />
              <ModeSwitch label="Save to" options={CAPTURE_TARGETS} value={target} onChange={setTarget} />
            </form>
            <div className="island-tabbar">
              <div
                className="island-tabs"
                role="tablist"
                aria-label="Island sections"
                style={{ "--island-tab-count": tabs.length } as React.CSSProperties}
              >
                {tabs.map((t, i) => (
                  <button
                    key={t.id}
                    id={`island-tab-${t.id}`}
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls="island-tabpanel"
                    tabIndex={tab === t.id ? 0 : -1}
                    className={`island-tab ${tab === t.id ? "is-active" : ""}`}
                    onClick={() => setTab(t.id)}
                    onKeyDown={(e) => onTabKey(e, i)}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                className={`island-pin ${pinned ? "is-on" : ""}`}
                onClick={() => setPinned((p) => !p)}
                aria-pressed={pinned}
                aria-label="Keep the island open"
                title={pinned ? "Kept open — click to let it close again" : "Keep open"}
              >
                📌
              </button>
            </div>
            <div className="island-panel__body" role="tabpanel" id="island-tabpanel" aria-labelledby={`island-tab-${tab}`}>
              {mode === "island" && (
                <div className="island-panel__pane" hidden={tab !== "widgets"}>
                  <WidgetsTab />
                </div>
              )}
              {expanded && tab === "music" && <MusicTab />}
              {expanded && tab === "plans" && <PlansTab />}
              {expanded && tab === "clipboard" && <ClipboardTab />}
              {expanded && tab === "apps" && <AppsTab />}
              {expanded && tab === "wallpapers" && <WallpapersTab />}
              {expanded && tab === "settings" && <SettingsTab />}
            </div>
          </div>
        )}
      </div>
    </HoldOpenContext.Provider>
  );
}
