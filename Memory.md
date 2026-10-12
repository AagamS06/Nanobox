# Memory — Nanobox

This file is the fast-onboarding snapshot for contributors and AI agents.
It tells you what exists, what works, what is broken, and what comes next —
so you do not have to read the entire codebase to get started.

**Last updated:** 2026-08-25 · Milestones 1–7 complete, Milestone 8 in progress. P0/P1/P2/P3 bug fixes landed.

---

## What Has Been Built (Complete)

### Phase 1 — Foundation
- Tauri 2 + React 19 + TypeScript project, full folder structure
- Borderless, transparent, always-on-bottom overlay window (sits above wallpaper, below open apps)
- System tray icon (show/hide/quit); launch on login (autostart)
- SQLite via `tauri-plugin-sql`; all data in a single DB; migrations numbered in `src-tauri/src/lib.rs`
- GitHub Actions CI: Windows + macOS build matrix on every push to `main`

### Phase 2 — Core Widgets
Notes, Alarm, App Shortcuts (drag-in app icons), Countdown timer, Habit Tracker,
Focus Mode (Pomodoro), widget grid with 8px snapping and resize handles.

### Phase 3 — Theme Engine
17 themes (see `Design.md` for full token values). All use CSS custom properties
(`--nb-surface`, `--nb-accent`, `--nb-radius`, etc.) defined in `src/themes/`.
Theme switching is instant — set `document.documentElement.dataset.theme`.
Per-theme accent/radius/font-scale customisation saved to SQLite.
Colourblind palette toggle (Okabe-Ito blue #0072B2) in `src/core/colorblindPalette.ts`.

### Phase 4 — ADHD Toolkit Widgets
Visual Timer (shrinking disk), Today Timeline (time blocks), Brain Dump (quick capture),
Task Breakdown (checklist with header task), Mood Check-in (emoji + 7-day history),
Gentle Reminders (interval-based nudges).
Custom Widget (sandboxed iframe) added in this phase as an early precursor to the block builder.

### Phase 5 — Integrations
- **Music widget:** Spotify OAuth PKCE (implemented, unverified against real account);
  OS media session (Windows SMTC) for any playing audio.
  Apple Music and YouTube Music stubs exist but are blocked (see `src/integrations/music/`).
- **Calendar widget:** Google Calendar OAuth PKCE + local `.ics` parsing.
  OAuth compiled clean but unverified against a real account.
- **Keychain:** OS-native secret storage via `keyring` Rust crate.

### Phase 6 — Window Chrome & UX
Real minimize/maximize/hide-to-tray controls. Working drag via `startDragging()` API.
Taskbar presence (`skipTaskbar` cleared). Per-widget colour and border-style settings.

### Phase 7 — Block Builder (Lego Engine)
React Flow visual canvas to drag-and-wire logic blocks (22+ block types).
Custom block creator with JS body editor (sandboxed `new Function`).
Programs saved to SQLite (`block_programs`, migration v9).
Custom block defs in `custom_block_defs` (migration v10).
Export/import as `.nanowidget` JSON files.
`block-widget` widget type runs a saved program live on a configurable interval.

---

## What Is Being Worked On

**Phase 8 — Polish & Release** (current)

The P0–P2 bug sweep is complete (see Known Issues table below). Active focus is now:

- Onboarding wizard (first-run: theme picker, accent colour, add first widget)
- Full keyboard navigation pass
- Code signing (Windows EV/OV cert, macOS Apple Developer notarization)
- Auto-update (`tauri-plugin-updater`)
- Docs site and public release

---

## What Is Left To Do

### Phase 8 checklist

**Bug fixes — complete**

- [x] Music widget: UX overhaul — providers grouped by setup level, Spotify form improved
- [x] Google Calendar: 5-step in-app OAuth setup guide
- [x] CustomWidget: CSP `<meta>` injected into srcdoc — blocks all outbound network calls
- [x] All widgets + WidgetGrid: DB-failure error banners (no more silent blank widgets)
- [x] Block engine: 2 000 ms time-budget check on custom block evaluation
- [x] AppShortcuts: icon-extraction warning with 5 s auto-clear
- [x] ThemeCustomizer: export errors surfaced to the user
- [x] Colourblind palette off: restores user's saved custom accent
- [x] Overlay panel: 120 ms fade-in; `prefers-reduced-motion` guard

**Pre-release — remaining**

- [ ] Onboarding wizard (theme picker, accent, add first widget)
- [ ] Keyboard navigation pass
- [ ] Windows code signing (EV/OV certificate or sponsored signing)
- [ ] macOS code signing + notarization (Apple Developer account required)
- [ ] Wire up `tauri-plugin-updater` for auto-update
- [ ] `winget install Nanobox` submission
- [ ] `brew install --cask nanobox` submission
- [ ] Docs site
- [ ] README demo GIF

### Deferred / stretch

- [ ] Companion widget (cosmetic plant from Habit Tracker streak data)
- [ ] Apple Music integration (blocked: needs private-key JWT from Apple Developer account)
- [ ] YouTube Music integration (blocked: no official "now playing" API)
- [ ] Block engine: true isolation (Web Worker or iframe sandbox — `new Function` cannot be interrupted mid-loop; 2 000 ms time-budget is in place but cannot stop a true `while(true)`)
- [ ] Linux support (currently excluded; `sync-secret-service` removed from Cargo.toml)
- [ ] macOS hands-on testing (builds in CI but never run on real hardware)
- [ ] Real-world OAuth verification (Spotify and Google Calendar implemented but never tested against real accounts)

---

## Known Issues (Priority Order)

All P0–P3 bugs from the initial audit have been fixed. Remaining open items are pre-release deferred work.

| # | Priority | Issue | Status |
|---|---|---|---|
| 1 | P0 | `DEFAULT_SPOTIFY_CLIENT_ID = ""` — music auth silently fails | **Fixed** — UI now groups providers by setup level; clearer dev-account instructions shown |
| 2 | P0 | Google Calendar needs user-supplied client_id; no in-app guidance | **Fixed** — numbered 5-step setup guide now shown inside the widget |
| 3 | P0 | CustomWidget sandbox does not block outbound `fetch()` | **Fixed** — CSP `<meta>` tag injected into srcdoc blocks all outbound network calls |
| 4 | P1 | Silent DB failures show blank widgets — no user-visible error states | **Fixed** — all widgets + WidgetGrid show an error banner on DB failure |
| 5 | P1 | Block engine custom JS: no execution timeout | **Fixed** — 2 000 ms time-budget check; true infinite loops documented as limitation |
| 6 | P1 | AppShortcuts: no icon warning when icon extraction fails | **Fixed** — ⚠ warning shown for paths where icon could not be read; auto-clears after 5 s |
| 7 | P1 | ThemeCustomizer export error silently swallowed | **Fixed** — export errors now surface below the IO buttons |
| 8 | P1 | Colourblind-off does not restore user's custom accent | **Fixed** — `applyColorblindPalette(false)` re-reads `settings:accentColor` and restores shades |
| 9 | P2 | Overlay panel has no transition — flashes on open | **Fixed** — 120 ms fade-in on `.overlay__body`; `prefers-reduced-motion` guard added |
| 10 | P2 | macOS overlay window behaviour untested (tray, always-on-bottom, drag) | Open — needs real macOS hardware |
| 11 | P2 | OAuth token refresh and revoke paths untested | Open — verify with real Spotify/Google accounts |
| 12 | P2 | Window dragging compiled but not human-confirmed | Open — test on target hardware |
| 13 | P3 | No keyboard navigation across widgets and settings | Open |
| 14 | P3 | No first-run onboarding (user lands on a blank canvas) | Open |

---

## Key Files to Know

| File | What it does |
|---|---|
| `src/App.tsx` | Root component: canvas, settings panel, block builder modal |
| `src/main.tsx` | React entry; pre-warms SQLite before mount |
| `src/storage/db.ts` | SQLite singleton; all migrations run here — add new migrations here |
| `src/widgets/registry.ts` | `WidgetId` type + `DEFAULT_SIZE` map — register new widgets here |
| `src/themes/base.css` | All `--nb-*` token fallback values |
| `src/themes/themes.ts` | `ThemeId` union type + `THEMES` metadata map |
| `src/core/colorblindPalette.ts` | Okabe-Ito palette toggle |
| `src/integrations/blockEngine/types.ts` | Block engine AST types |
| `src/integrations/blockEngine/evaluator.ts` | Block program evaluator |
| `src/integrations/music/spotify.ts` | Spotify OAuth + playback API |
| `src/integrations/calendar/googleCalendar.ts` | Google Calendar OAuth |
| `src-tauri/src/lib.rs` | Tauri app bootstrap + all DB migrations |
| `src-tauri/Cargo.toml` | Rust deps + build profiles (release: strip, lto, opt-z) |
| `src-tauri/tauri.conf.json` | Window config, bundle targets, CSP |

---

## How to Run

```bash
git clone https://github.com/AagamS06/Nanobox.git
cd Nanobox
npm install
npm run tauri dev
```

Prerequisites: Node 20+, Rust stable, Windows C++ Build Tools + WebView2 (Windows)
or Xcode Command Line Tools (macOS). See `README.md` for the guided setup.

## How to Build a Release

```bash
npm run tauri build
```

Produces an NSIS installer (Windows) or DMG (macOS) in `src-tauri/target/release/bundle/`.

## Disk Space Note

`src-tauri/target/` is the Rust compilation cache and can grow to 15+ GB in dev.
Run `cargo xtrim` (from `src-tauri/`) or `cargo clean` to wipe it. Dev builds use
`debug = 1` (line tables only) to keep the cache smaller. CI uses the release profile
(`strip = true`, `lto = "thin"`, `opt-level = "z"`).

---

## Docs

- `PRD.md` — what to build and why
- `Architecture.md` — app flow, folder structure, tech stack
- `Rules.md` — coding rules, library choices, AI agent boundaries
- `Phases.md` — milestone-by-milestone plan (this replaced ROADMAP.md + PLAN.md)
- `Design.md` — all 17 themes with full CSS token values
- `Memory.md` — this file (contributor onboarding snapshot)
- `docs/WIDGETS.md` — widget reference
- `docs/BLOCK_ENGINE.md` — block engine internals
