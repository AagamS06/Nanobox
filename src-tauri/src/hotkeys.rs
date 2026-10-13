//! System-wide hotkeys, handled entirely in Rust so they work even while the
//! main window is hidden (when its JavaScript may be throttled).
//!
//! - Quick capture (Ctrl/Cmd+Shift+Space): drops the island open with the
//!   capture box focused, so a thought goes into Brain Dump or To-do without
//!   leaving whatever you're doing.
//! - Peek (Ctrl/Cmd+Shift+\): brings the widgets in front of your windows;
//!   press again to send them back behind.
//!
//! Users can switch both off (island Settings tab) if they clash with another
//! app; the JS side persists that choice and calls `set_hotkeys_enabled` at
//! startup.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const CAPTURE: &str = "CommandOrControl+Shift+Space";
pub const PEEK: &str = "CommandOrControl+Shift+Backslash";

static PEEKING: AtomicBool = AtomicBool::new(false);

fn parse(accelerator: &str) -> Shortcut {
    accelerator.parse().expect("built-in hotkey must parse")
}

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
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
/// sends it back behind other windows.
pub fn toggle_peek<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("overlay") else { return };
    let peeking = !PEEKING.load(Ordering::Relaxed);
    PEEKING.store(peeking, Ordering::Relaxed);
    if peeking {
        let _ = window.set_always_on_bottom(false);
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_bottom(true);
    }
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
