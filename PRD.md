# PRD — Nanobox

## What is Nanobox?

Nanobox is a fully customisable, always-on-top desktop companion widget hub.
It sits on the desktop — above the wallpaper, below open windows — and surfaces
the tools a user reaches for constantly: a clock, notes, music controls,
calendar, alarms, shortcuts, focus timers, and a custom block-based widget
builder. It is designed first for neurodivergent users (ADHD, autism, dyslexia,
sensory processing differences) but is useful to anyone who wants a persistent,
calm, themed desktop layer.

---

## Target User

**Primary:** Neurodivergent adults (ADHD, autism spectrum, dyslexia, sensory processing differences)
who struggle with context-switching, forgetting tasks, or needing calm, low-distraction tools.

**Secondary:** Power users and productivity enthusiasts who want a highly customisable
desktop hub without running a heavyweight always-on-top app.

**Persona:**
- Works at a computer for most of the day
- Has multiple tabs, windows, and tasks open simultaneously
- Needs quick access to notes, timers, and reminders without alt-tabbing
- May be sensitive to visual noise, overstimulation, or harsh colour schemes
- Comfortable with a dev tool that requires building from source (pre-release)

---

## Core Features

### Widget System
- Drag-and-drop widget canvas pinned to the desktop
- Add, remove, resize, and reposition widgets freely
- Widgets persist position and state across sessions (SQLite)
- Built-in widgets (see below) + custom widgets via HTML/CSS/JS sandbox
- Block Builder: a visual, no-code "lego" widget builder using draggable logic blocks

### Built-in Widgets

| Widget | Description |
|---|---|
| Clock | Analogue and digital clock; multiple time zones |
| Notes | Persistent sticky-note style textarea |
| Music | Now-playing + controls; Spotify OAuth, OS media session (SMTC on Windows) |
| Calendar | Upcoming events; Google Calendar OAuth, iCal |
| Alarms | Recurring and one-off alarms with notification |
| App Shortcuts | Drag-and-drop application launcher icons |
| Pomodoro / Focus | Configurable focus/break timer |
| Custom Widget | One widget with a Codeable / Block switch: sandboxed HTML/CSS/JS, or a saved Block Builder program run live |

### Theme Engine
17 built-in visual themes via CSS custom properties. User can switch theme and enable
a colourblind-safe palette (Okabe-Ito accent colours) independently.

### Block Builder
Visual React Flow canvas where users drag, wire, and configure logic blocks (number
literals, arithmetic, string ops, conditionals, display outputs). Programs are saved
to SQLite and can be exported/imported as `.nanowidget` files. Custom block types
can be authored in the app (JavaScript body, sandboxed via `new Function`).

### Integrations
- **Spotify** — OAuth PKCE; playback controls and now-playing metadata
- **Google Calendar** — OAuth PKCE; read upcoming events
- **OS media session** — Windows SMTC; reads any app's now-playing info (Windows only)

### ADHD Toolkit
- Pomodoro timer with configurable focus/break durations
- Notification-based alarm system
- Persistent notepad (notes survive app restart)
- Reduced-motion and colourblind palette options

### System
- Borderless, transparent, always-on-bottom overlay window (sits above wallpaper)
- Custom drag handle + window controls (minimize, maximize, hide-to-tray)
- System tray icon with show/hide/quit
- Launch on login (autostart) via OS mechanisms
- Hides to tray on "close" — stays in tray; Quit exits fully

---

## Non-Goals (v0.1)

- Mobile or web version
- Cloud sync or accounts
- Marketplace / plugin store for themes or widgets
- Multi-user or shared widgets
- Paid tiers or subscriptions

---

## Success Criteria

- App starts in under 2 seconds on a modern Windows machine
- A first-time user can add a widget, resize it, and change the theme without reading docs
- Spotify and Google Calendar auth flows complete end-to-end without errors
- Block Builder programs run correctly inside a Custom Widget (Block mode) on the canvas
- CI builds produce installable artefacts for both Windows (NSIS) and macOS (DMG)

---

## Status

**Version:** 0.1.0 (pre-release)
**Milestones complete:** 1–7 (foundation, widget engine, integrations, block engine, theme engine, ADHD toolkit, window polish)
**Milestone 8:** In progress — P0–P2 bug sweep complete; remaining work is onboarding, code signing, auto-update, and public release
