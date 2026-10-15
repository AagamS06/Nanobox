//! System-wide hotkeys, handled entirely in Rust so they work even while the
//! main window is hidden (when its JavaScript may be throttled).
//!
//! - Quick capture (Ctrl/Cmd+Shift+Space): drops the island open with the
//!   capture box focused, so a thought goes into Brain Dump or To-do without
//!   leaving whatever you're doing.
//! - Peek (Ctrl/Cmd+Shift+\): brings the widgets in front of your windows;
//!   press again (or click into another app) to send them back behind. In
//!   island mode it opens or closes the island instead.
//!
//! Users can switch both off (island Settings tab) if they clash with another
//! app; the JS side persists that choice and calls `set_hotkeys_enabled` at
//! startup.

use std::sync::atomic::{AtomicBool, Ordering};
use crate::app_mode::{self, AppMode};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const CAPTURE: &str = "CommandOrControl+Shift+Space";
pub const PEEK: &str = "CommandOrControl+Shift+Backslash";

static PEEKING: AtomicBool = AtomicBool::new(false);

fn parse(accelerator: &str) -> Shortcut {
    accelerator.parse().expect("built-in hotkey must parse")
}

pub fn plugin() -> tauri::plugin::TauriPlugin<Wry> {
    let capture = parse(CAPTURE);
    let peek = parse(PEEK);
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if shortcut == &capture {
                let _ = app.emit_to("island", "island:capture", ());
            } else if shortcut == &peek {
                toggle_peek(app);
            }
        })
        .build()
}

/// Brings the (normally always-on-bottom) widgets window to the front, or
/// sends it back behind other windows. In island mode, opens or closes the
/// island instead.
pub fn toggle_peek(app: &AppHandle<Wry>) {
    if app_mode::current(app) == AppMode::Island {
        let _ = app.emit_to("island", "island:toggle", ());
        return;
    }
    if PEEKING.load(Ordering::Relaxed) {
        end_peek(app);
    } else {
        start_peek(app);
    }
}

pub fn start_peek(app: &AppHandle<Wry>) {
    let Some(window) = app.get_webview_window("overlay") else { return };
    PEEKING.store(true, Ordering::Relaxed);
    let _ = window.set_always_on_bottom(false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
}

/// Sends the widgets window back behind everything. Called when Peek is
/// pressed again and whenever the window loses focus while peeking, so it
/// can never be left stuck in front.
pub fn end_peek(app: &AppHandle<Wry>) {
    if !PEEKING.swap(false, Ordering::Relaxed) {
        return;
    }
    if let Some(window) = app.get_webview_window("overlay") {
        app_mode::pin_to_back(&window);
    }
}

pub fn is_peeking() -> bool {
    PEEKING.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn peek_widgets(app: AppHandle) {
    toggle_peek(&app);
}

/// Registers or unregisters both hotkeys. Returns the accelerators that
/// couldn't be registered (usually because another app already owns them),
/// so the UI can say so instead of failing silently.
#[tauri::command]
pub fn set_hotkeys_enabled(app: AppHandle, enabled: bool) -> Vec<String> {
    let gs = app.global_shortcut();
    let mut failed = Vec::new();
    for accelerator in [CAPTURE, PEEK] {
        let shortcut = parse(accelerator);
        if enabled {
            if !gs.is_registered(shortcut) && gs.register(shortcut).is_err() {
                failed.push(accelerator.to_string());
            }
        } else if gs.is_registered(shortcut) {
            let _ = gs.unregister(shortcut);
        }
    }
    failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_hotkeys_parse() {
        parse(CAPTURE);
        parse(PEEK);
        assert_ne!(parse(CAPTURE), parse(PEEK));
    }
}
