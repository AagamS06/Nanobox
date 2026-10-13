<img src="src/assets/logo/nanobox-mark.svg" alt="Nanobox logo" width="72" height="72">

# Nanobox

> A fully customisable desktop companion built first for neurodivergent people
> (ADHD, autism, dyslexia, sensory processing differences) — notes, music,
> calendar, alarms, clocks, shortcuts, and a lego-block custom widget builder,
> all in one persistent, themeable desktop hub.

**Status:** Pre-release, active development — Milestones 1–7 complete, Phase 8 bug-fix sweep done. Working toward first signed release (onboarding, code signing, auto-update). See [Phases.md](Phases.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| App framework | [Tauri 2](https://v2.tauri.app/) (Rust + native WebView) |
| Frontend | React 19 + TypeScript |
| Styling | CSS custom properties + PostCSS (theme engine) |
| Storage | SQLite via `tauri-plugin-sql` |
| Widget sandbox | Custom JS runtime (Compartment API) |
| CI/CD | GitHub Actions (Windows + macOS build matrix) |

## Platform targets

- Windows 10+ (x64)
- macOS 12+ (Apple Silicon + Intel)

## Project layout

```
nanobox/
├── src/
│   ├── core/               # App shell, startup, tray, window management
│   ├── widgets/             # Widget registry, lifecycle, lego engine
│   │   ├── built-in/        # Clock, Notes, Music, Calendar, etc.
│   │   └── sandbox/         # Compartment runtime for user widgets
│   ├── themes/               # CSS theme files + token maps
│   ├── tokens/               # Design token JSON → CSS pipeline
│   ├── components/           # Shared React components
│   ├── integrations/
│   │   ├── music/            # Spotify, Apple Music, YouTube adapters
│   │   └── calendar/         # Google Calendar, iCal parsers
│   └── storage/               # SQLite schema, migrations, CRUD helpers
├── src-tauri/
│   ├── src/                  # Rust: commands, file I/O, system APIs
│   └── Cargo.toml
├── tests/
├── public/fonts/
├── PRD.md
├── Architecture.md
├── Rules.md
├── Phases.md
├── Design.md
├── Memory.md
├── PROGRESS.md
└── package.json
```

## Getting started

Nanobox isn't on an app store or as a packaged installer yet — running it
from source is the only way to use it right now. Once signed releases exist
they'll be linked from the [GitHub Releases page](https://github.com/AagamS06/Nanobox/releases)
and from this README.

---

### Windows

#### 1 — Install Node.js 20+

Download the LTS installer from [nodejs.org](https://nodejs.org/), or use winget:

```bash
winget install OpenJS.NodeJS.LTS
```

#### 2 — Install Rust

```bash
winget install Rustlang.Rustup
```

Open a **new** terminal after this so `rustup`, `rustc`, and `cargo` are on your PATH.

#### 3 — Install the C++ Build Tools

Tauri's Rust side needs the MSVC linker. Install the "Desktop development with C++" workload:

```bash
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"
```

Alternatively, download the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) installer and tick **Desktop development with C++** manually.

> **WebView2** (required by Tauri) ships pre-installed on Windows 10 and 11. If you are on an older build or a stripped enterprise image, download it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

#### 4 — Clone and install

```bash
git clone https://github.com/AagamS06/Nanobox.git
cd Nanobox
npm install
```

#### 5 — Run in development

```bash
npm run tauri dev
```

The first run compiles the Rust side — this takes a few minutes. Subsequent runs are fast thanks to incremental compilation. Look for the Nanobox icon in your **system tray** once it starts; click it to show or hide the overlay window.

> **Note:** `npm run tauri dev` is a dev server — it stays attached to the terminal that launched it and hot-reloads on code changes. Closing that terminal closes the app. That's by design. For the persistent, tray/taskbar experience (the app surviving after you close the terminal), build and install instead: `npm run tauri build`, then run the produced installer.

#### Build a release

```bash
npm run tauri build
```

Produces an NSIS installer at `src-tauri/target/release/bundle/nsis/`.

#### Verify the tools are installed correctly

```bash
node --version && rustc --version && cargo --version
```

All three should print a version number. If `rustc` or `cargo` are not found, open a **new** terminal — PATH changes from the rustup installer only apply to new shells.

---

### macOS

#### 1 — Install Xcode Command Line Tools

This provides the clang compiler, linker, and macOS SDK that Rust needs. Full Xcode is **not** required for desktop development.

```bash
xcode-select --install
```

A dialog will appear — click **Install**. This takes a few minutes. If you already have full Xcode installed, accept the license instead:

```bash
sudo xcodebuild -license accept
```

#### 2 — Install Node.js 20+

Download the LTS installer from [nodejs.org](https://nodejs.org/), or use Homebrew:

```bash
brew install node
```

> **Apple Silicon note:** Make sure you are running a native arm64 Node binary, not an x86_64 one under Rosetta. Using a version manager like [fnm](https://github.com/Schniz/fnm) (`brew install fnm`) is the cleanest way to guarantee this.

#### 3 — Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the prompts (option 1, default install). Then reload your shell:

```bash
source "$HOME/.cargo/env"
```

On Apple Silicon, `rustup` installs the `aarch64-apple-darwin` target automatically — no extra steps needed for native M-series builds.

#### 4 — Clone and install

```bash
git clone https://github.com/AagamS06/Nanobox.git
cd Nanobox
npm install
```

> **Apple Silicon gotcha:** If `npm install` produces errors about missing `@rollup/rollup-darwin-arm64` or similar native binaries, your Node.js is likely running under Rosetta rather than natively. Switch to a native arm64 Node build (via fnm or a fresh download from nodejs.org) and re-run `npm install`.

#### 5 — Run in development

```bash
npm run tauri dev
```

The first run compiles the Rust side — this takes a few minutes. Once running, look for the Nanobox icon in your **menu bar** (top-right). Click it to show or hide the overlay window.

> **Note:** `npm run tauri dev` is a dev server attached to its terminal. Closing the terminal closes the app. For a persistent app that survives closing the terminal, build it: `npm run tauri build`, then double-click the `.app` in `src-tauri/target/release/bundle/macos/` (or run the DMG). Unsigned apps on macOS 13+ will prompt "damaged app" — right-click → Open to bypass, or run `xattr -d com.apple.quarantine path/to/Nanobox.app` first.

#### Build a release

```bash
npm run tauri build
```

Produces a `.app` bundle and a DMG at `src-tauri/target/release/bundle/macos/` and `src-tauri/target/release/bundle/dmg/`.

#### Verify the tools are installed correctly

```bash
node --version && rustc --version && cargo --version
```

All three should print a version. If `rustc`/`cargo` are not found, run `source "$HOME/.cargo/env"` or open a new terminal.

#### Known macOS caveats

- **Unsigned builds trigger a Gatekeeper warning.** Right-click → Open, or strip the quarantine flag with `xattr -d com.apple.quarantine path/to/Nanobox.app`. Code signing and notarization are Milestone 8 items.
- **The overlay window and tray icon are untested on real hardware.** The app compiles and runs in CI, but its macOS-specific behaviour (always-on-bottom window, menu bar icon, launch on login) has never been verified by a human on a physical Mac. If something looks wrong, please [open an issue](https://github.com/AagamS06/Nanobox/issues).
- **CSS rendering differences.** WKWebView (macOS) and WebView2 (Windows) render some CSS differently — notably `backdrop-filter`, custom scrollbars, and font metrics. Expect minor visual differences from the Windows screenshots.

---

### Grab a build without building it yourself

Every push to `main` builds Nanobox on both Windows and macOS via
[GitHub Actions](https://github.com/AagamS06/Nanobox/actions/workflows/build.yml)
and uploads the result — an MSI + NSIS installer for Windows, a DMG for
macOS — as a workflow artifact. Open the latest successful run and download
`nanobox-windows` or `nanobox-macos` from the Artifacts section at the
bottom of the page.

These are unsigned release builds (no code signing/notarization yet — that's
Milestone 8, Polish & release, not done yet) meant for trying Nanobox out or
testing a PR, not a polished, signed release. They're regular optimized
builds like `npm run tauri build` produces, not debug builds, so they behave
like a normal installed app — no stray console window, no dependency on
whatever launched them.

## Docs

- [docs/WIDGETS.md](docs/WIDGETS.md) — every built-in widget and what it does
- [docs/RELEASING.md](docs/RELEASING.md) — cutting a release, the updater key, and the code-signing plan
- [docs/BLOCK_ENGINE.md](docs/BLOCK_ENGINE.md) — how the visual block/lego
  engine works under the hood (AST, evaluator, standard library)

## Roadmap & progress

- [Phases.md](Phases.md) — milestone-by-milestone plan and current focus
- [PROGRESS.md](PROGRESS.md) — session-by-session log of what's shipped

## Contributing

Nanobox is open to collaborators — if you're a dev who cares about
neurodivergent-friendly tooling (or you just like the idea of a themeable
desktop widget hub), issues and PRs are genuinely welcome. It's early and
the codebase moves fast, so an issue proposing what you'd like to work on
before a big PR will save both of us time.

### 🎵 Music widget

The Music widget supports **Spotify** (OAuth PKCE, developer app required) and
**Now Playing (this device)**, which reads the OS media session with no setup:

- **Windows:** System Media Transport Controls, the same source as the taskbar
  media flyout.
- **macOS:** the system Now Playing info, read through
  [mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) via the
  `media-remote` crate (needed since macOS 15.4 locked down the private
  MediaRemote framework). Best-effort: a future macOS update could break it.
  **Untested on real hardware so far.**

Because every major player reports to the OS media session, Now Playing
already covers the **Apple Music app** and **YouTube Music in a browser**, so
dedicated Apple Music / YouTube Music integrations are on hold. Open an issue
tagged `music` if you need something the media session can't give you.

### 🍎 Help wanted — macOS

The macOS build compiles in CI and produces a DMG artifact, but it has never
been run hands-on by a human on a real Mac. Everything that depends on
platform-level behaviour is untested on Apple hardware:

- **Tray icon and overlay window** — `skipTaskbar`, always-on-top, and the
  transparent overlay approach all behave differently on macOS vs Windows.
  The window may not sit above the wallpaper the way it does on Windows, or
  the tray icon may not appear in the right place.
- **Launch on login** — uses a launchd agent on macOS; the autostart path
  has not been verified.
- **Now Playing (Music widget)** — the macOS media-session reader is new and
  has only been type-checked, never run. Try it with Apple Music, Spotify and
  a YouTube tab, on macOS 15.4+ if possible.
- **Window dragging** — `startDragging()` is a Tauri API that should work
  cross-platform, but the feel (title bar height, drag region) hasn't been
  tuned for macOS.
- **Code signing and notarization** — unsigned DMGs require right-click →
  Open on macOS 13+. A proper release needs a paid Apple Developer account
  for signing and notarization. If you can provide or sponsor this, open an
  issue.

If you have a Mac and want to be the first real tester, clone the repo, grab
a CI artifact (or build from source with `npm run tauri build`), and file
everything that's broken. A single Mac tester doing a 30-minute pass would
clear most of the unknowns in one go.

### 🖥️ Help wanted — True standalone app (no terminal required)

Right now, the only way to run Nanobox persistently — as a real app that
lives in your taskbar and tray, survives closing the terminal, and starts on
login — is to build it (`npm run tauri build`) and run the produced installer.
The dev path (`npm run tauri dev`) is inherently terminal-attached by design.

The gap we want help closing:

- **Signed Windows installer (MSIX or NSIS)** — the CI build produces an
  unsigned NSIS installer, but unsigned executables trigger SmartScreen
  warnings on Windows. A proper release needs an EV or OV code-signing
  certificate. If you can help with this (or know a low-cost path for indie
  projects), open an issue.
- **One-command install from a release** — ideally `winget install Nanobox`
  on Windows and `brew install --cask nanobox` on macOS. Getting into those
  registries requires a signed, versioned release first.
- **Auto-update** — ✅ wired up via `tauri-plugin-updater` against GitHub
  Releases, with signed update bundles. Goes live with the first tagged
  release. See [docs/RELEASING.md](docs/RELEASING.md).

If you've shipped a Tauri app through to a real signed release (especially on
Windows, especially with auto-update), your experience would be directly
applicable here. Open an issue or a discussion.

### 🐛 Help wanted — Real-world debugging

Nanobox has been built and tested in a development environment — it has never
been lived in by real users at scale. If you try it and something feels off,
broken, or just odd, **please open an issue**. The P0–P2 bug sweep is done
(silent failures, sandbox, palette restore, UI polish) but the following
still need real-world eyes:

- **OAuth flows**: Spotify and Google Calendar OAuth have been implemented
  and compile clean, but the flows have not been exercised against real
  accounts. First-time auth, token refresh, and revoke paths are the most
  likely to have edge-case bugs.
- **Window behaviour**: window dragging (`startDragging()` API), tray icon,
  startup-on-login, and the always-on-bottom overlay all depend on OS-level
  behaviour that varies by Windows version and display setup. Bug reports
  with your OS version and display config are very helpful.
- **Performance on real hardware**: the app has been profiled in dev mode
  only. If it feels sluggish on your machine, open an issue with your specs.

If you want to do a broader debugging pass — running it for a week and
filing everything that feels wrong — that would be genuinely one of the
most valuable contributions right now.

### 🧩 Extend without touching core

The **Custom Widget** (add it from the "+ Add widget" overlay) has a switch
at the top with two modes:

- **Codeable Widget** — write your own HTML/CSS/JS and drop it straight onto
  the desktop, sandboxed in an iframe with no access to your files,
  Nanobox's data, or Tauri APIs.
- **Block Widget** — the no-code alternative. Build a program in the
  **Block Builder** (Ctrl+Shift+B) by dragging and wiring logic blocks, then
  pick it here to run it as a live widget. Each program saves as a
  `.nanowidget` file you can share.

## Security

If you find a security issue, please follow [SECURITY.md](SECURITY.md)
rather than filing a public issue.

## License

[MIT](LICENSE.md)
