//! Desktop mode vs island mode.
//!
//! - **Desktop mode**: the widgets window is a normal resizable window that
//!   can be minimised and maximised, but always sits behind every other app.
//!   The island is optional.
//! - **Island mode**: the widgets window is hidden (and out of the taskbar);
//!   everything, widgets included, lives in the island at the top of the
//!   screen.
//!
//! The choice is kept in a small file in the app's config folder rather than
//! the SQLite settings table, because Rust needs it before any JavaScript
//! runs: the widgets window starts hidden and is only shown here, so island
//! mode doesn't flash the desktop window on every launch.

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Runtime, Wry};

pub const MODE_CHANGED_EVENT: &str = "app-mode-changed";
const MODE_FILE: &str = "app-mode.txt";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppMode {
    Desktop,
    Island,
}

impl AppMode {
    pub fn as_str(self) -> &'static str {
        match self {
            AppMode::Desktop => "desktop",
            AppMode::Island => "island",
        }
    }

    /// Anything unrecognised (a missing or damaged file) means desktop mode,
    /// which is how Nanobox has always started.
    pub fn parse(text: &str) -> AppMode {
        match text.trim() {
            "island" => AppMode::Island,
            _ => AppMode::Desktop,
        }
    }
}

pub struct AppModeState {
    mode: Mutex<AppMode>,
    /// The tray's "Switch to … mode" item, relabelled whenever the mode changes.
    tray_item: Mutex<Option<MenuItem<Wry>>>,
}

impl AppModeState {
    pub fn new(mode: AppMode) -> Self {
        Self { mode: Mutex::new(mode), tray_item: Mutex::new(None) }
    }
}

fn mode_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(MODE_FILE))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> AppMode {
    mode_file(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| AppMode::parse(&text))
        .unwrap_or(AppMode::Desktop)
}

fn save<R: Runtime>(app: &AppHandle<R>, mode: AppMode) -> Result<(), String> {
    let path = mode_file(app).ok_or("no config folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, mode.as_str()).map_err(|e| e.to_string())
}

pub fn current(app: &AppHandle<Wry>) -> AppMode {
    app.try_state::<AppModeState>()
        .map(|s| *s.mode.lock().unwrap())
        .unwrap_or(AppMode::Desktop)
}

pub fn tray_label(mode: AppMode) -> &'static str {
    match mode {
        AppMode::Desktop => "Switch to island mode",
        AppMode::Island => "Switch to desktop mode",
    }
}

pub fn set_tray_item(app: &AppHandle<Wry>, item: MenuItem<Wry>) {
    if let Some(state) = app.try_state::<AppModeState>() {
        *state.tray_item.lock().unwrap() = Some(item);
    }
}

/// Puts the widgets window behind every other window and keeps it there.
/// On Windows this also makes every later attempt to raise it (a click, a
/// restore from the taskbar, maximising) land at the bottom of the stack.
pub fn pin_to_back<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_bottom(true);
}

/// Shows or hides the windows to match `mode`. `startup` skips the event
/// (no window is listening yet; each asks for the mode when it loads).
pub fn apply(app: &AppHandle<Wry>, mode: AppMode, startup: bool) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        match mode {
            AppMode::Desktop => {
                let _ = overlay.set_skip_taskbar(false);
                pin_to_back(&overlay);
                let _ = overlay.show();
            }
            AppMode::Island => {
                crate::hotkeys::end_peek(app);
                let _ = overlay.hide();
                let _ = overlay.set_skip_taskbar(true);
            }
        }
    }
    if mode == AppMode::Island {
        // The island positions itself when it loads or hears the event below.
        if let Some(island) = app.get_webview_window("island") {
            if !startup {
                let _ = island.show();
            }
        }
    }
    if let Some(state) = app.try_state::<AppModeState>() {
        if let Some(item) = state.tray_item.lock().unwrap().as_ref() {
            let _ = item.set_text(tray_label(mode));
        }
    }
    if !startup {
        let _ = app.emit(MODE_CHANGED_EVENT, mode.as_str());
    }
}

pub fn switch(app: &AppHandle<Wry>, mode: AppMode) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppModeState>() {
        *state.mode.lock().unwrap() = mode;
    }
    let saved = save(app, mode);
    apply(app, mode, false);
    saved
}

#[tauri::command]
pub fn get_app_mode(app: AppHandle) -> String {
    current(&app).as_str().to_string()
}

#[tauri::command]
pub fn set_app_mode(app: AppHandle, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "desktop" | "island" => switch(&app, AppMode::parse(&mode)),
        other => Err(format!("unknown app mode \"{other}\"")),
    }
}

/// Island mode borrows the (hidden) widgets window to show full Settings or
/// the Block Builder in front of everything; this puts it away again.
#[tauri::command]
pub fn show_tool_window(app: AppHandle, visible: bool) {
    let Some(overlay) = app.get_webview_window("overlay") else { return };
    if current(&app) != AppMode::Island {
        // Desktop mode: bring the widgets forward the same way Peek does.
        if visible {
            crate::hotkeys::start_peek(&app);
        } else {
            crate::hotkeys::end_peek(&app);
        }
        return;
    }
    if visible {
        let _ = overlay.set_always_on_bottom(false);
        let _ = overlay.set_skip_taskbar(false);
        let _ = overlay.show();
        let _ = overlay.unminimize();
        let _ = overlay.set_focus();
    } else {
        let _ = overlay.hide();
        let _ = overlay.set_skip_taskbar(true);
        pin_to_back(&overlay);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modes_and_defaults_to_desktop() {
        assert_eq!(AppMode::parse("island"), AppMode::Island);
        assert_eq!(AppMode::parse(" island\n"), AppMode::Island);
        assert_eq!(AppMode::parse("desktop"), AppMode::Desktop);
        assert_eq!(AppMode::parse(""), AppMode::Desktop);
        assert_eq!(AppMode::parse("garbage"), AppMode::Desktop);
        for mode in [AppMode::Desktop, AppMode::Island] {
            assert_eq!(AppMode::parse(mode.as_str()), mode);
        }
    }

    #[test]
    fn tray_offers_the_other_mode() {
        assert!(tray_label(AppMode::Desktop).contains("island"));
        assert!(tray_label(AppMode::Island).contains("desktop"));
    }
}
