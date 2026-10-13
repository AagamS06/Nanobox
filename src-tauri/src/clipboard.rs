//! Clipboard history for the island's Clipboard tab.
//!
//! Privacy rules, by design:
//! - **Memory only.** History lives in this process and is gone when Nanobox
//!   quits. Nothing is written to disk or the database.
//! - **Password managers are skipped.** Apps mark secrets so clipboard tools
//!   ignore them: on Windows the `ExcludeClipboardContentFromMonitorProcessing`
//!   / `Clipboard Viewer Ignore` formats, on macOS the nspasteboard.org
//!   `ConcealedType` / `TransientType` markers. Any copy carrying those is
//!   never recorded.
//! - **Pausable.** The island's toggle stops recording entirely.
//! - Text only, capped in size and count.
//!
//! A background thread checks a cheap "has the clipboard changed?" counter
//! (Windows sequence number / macOS change count) every 700 ms and only reads
//! the text when it has.

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_ITEMS: usize = 50;
const MAX_CHARS: usize = 20_000;
const POLL_EVERY: Duration = Duration::from_millis(700);
pub const CHANGED_EVENT: &str = "clipboard-history-changed";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: u64,
    pub text: String,
    /// Unix milliseconds.
    pub copied_at: u64,
}

#[derive(Default)]
pub struct ClipboardHistory {
    items: Mutex<VecDeque<ClipItem>>,
    paused: AtomicBool,
    next_id: AtomicU64,
}

impl ClipboardHistory {
    /// Records `text` as the newest entry. Returns false if nothing changed
    /// (empty, too long, or already the newest entry).
    pub fn record(&self, text: &str, now_ms: u64) -> bool {
        if text.trim().is_empty() || text.chars().count() > MAX_CHARS {
            return false;
        }
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        if items.front().is_some_and(|i| i.text == text) {
            return false;
        }
        // Copying something again moves it to the top instead of duplicating it.
        items.retain(|i| i.text != text);
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        items.push_front(ClipItem { id, text: text.to_string(), copied_at: now_ms });
        items.truncate(MAX_ITEMS);
        true
    }

    pub fn list(&self) -> Vec<ClipItem> {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).iter().cloned().collect()
    }

    pub fn get(&self, id: u64) -> Option<ClipItem> {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|i| i.id == id).cloned()
    }

    pub fn remove(&self, id: u64) {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).retain(|i| i.id != id);
    }

    pub fn clear(&self) {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).clear();
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Starts the background watcher. Call once from `setup`.
pub fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let history: Arc<ClipboardHistory> = app.state::<Arc<ClipboardHistory>>().inner().clone();
        let mut last_token: Option<u64> = None;
        loop {
            std::thread::sleep(POLL_EVERY);
            let token = platform::change_token();
            if token.is_some() && token == last_token {
                continue;
            }
            let first_run = last_token.is_none();
            last_token = token;
            // Don't import whatever happened to be on the clipboard before
            // Nanobox started — history begins with the first new copy.
            if first_run && token.is_some() {
                continue;
            }
            if history.is_paused() || platform::is_concealed() {
                continue;
            }
            let Some(text) = read_text() else { continue };
            if history.record(&text, now_ms()) {
                let _ = app.emit(CHANGED_EVENT, ());
            }
        }
    });
}

fn read_text() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok()
}

#[tauri::command]
pub fn clipboard_history(state: State<'_, Arc<ClipboardHistory>>) -> Vec<ClipItem> {
    state.list()
}

#[tauri::command]
pub fn clipboard_copy(app: AppHandle, state: State<'_, Arc<ClipboardHistory>>, id: u64) -> Result<(), String> {
    let item = state.get(id).ok_or("That item is no longer in the history.")?;
    arboard::Clipboard::new()
        .and_then(|mut c| c.set_text(item.text.clone()))
        .map_err(|e| format!("Couldn't copy: {e}"))?;
    state.record(&item.text, now_ms());
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn clipboard_remove(app: AppHandle, state: State<'_, Arc<ClipboardHistory>>, id: u64) {
    state.remove(id);
    let _ = app.emit(CHANGED_EVENT, ());
}

#[tauri::command]
pub fn clipboard_clear(app: AppHandle, state: State<'_, Arc<ClipboardHistory>>) {
    state.clear();
    let _ = app.emit(CHANGED_EVENT, ());
}

#[tauri::command]
pub fn clipboard_set_paused(state: State<'_, Arc<ClipboardHistory>>, paused: bool) {
    state.set_paused(paused);
}

#[tauri::command]
pub fn clipboard_is_paused(state: State<'_, Arc<ClipboardHistory>>) -> bool {
    state.is_paused()
}

#[cfg(target_os = "windows")]
mod platform {
    use windows::core::w;
    use windows::Win32::System::DataExchange::{
        GetClipboardSequenceNumber, IsClipboardFormatAvailable, RegisterClipboardFormatW,
    };

    pub fn change_token() -> Option<u64> {
        // 0 means "no access" (e.g. a locked session) — treat as unknown.
        let seq = unsafe { GetClipboardSequenceNumber() };
        (seq != 0).then_some(seq as u64)
    }

    pub fn is_concealed() -> bool {
        unsafe {
            let markers = [
                RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing")),
                RegisterClipboardFormatW(w!("Clipboard Viewer Ignore")),
            ];
            markers.iter().any(|&f| f != 0 && IsClipboardFormatAvailable(f).is_ok())
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::NSPasteboard;

    const CONCEALED_MARKERS: [&str; 3] = [
        "org.nspasteboard.ConcealedType",
        "org.nspasteboard.TransientType",
        "org.nspasteboard.AutoGeneratedType",
    ];

    pub fn change_token() -> Option<u64> {
        let count = NSPasteboard::generalPasteboard().changeCount();
        Some(count as u64)
    }

    pub fn is_concealed() -> bool {
        let Some(types) = NSPasteboard::generalPasteboard().types() else {
            return false;
        };
        types.iter().any(|t| CONCEALED_MARKERS.contains(&t.to_string().as_str()))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod platform {
    // No cheap change counter here: the watcher reads the text every tick and
    // `record` ignores it unless it differs from the newest entry.
    pub fn change_token() -> Option<u64> {
        None
    }

    pub fn is_concealed() -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_newest_first_and_dedupes() {
        let h = ClipboardHistory::default();
        assert!(h.record("one", 1));
        assert!(h.record("two", 2));
        assert!(!h.record("two", 3), "same as newest is ignored");
        assert!(h.record("one", 4), "older copy moves back to the top");
        let texts: Vec<_> = h.list().into_iter().map(|i| i.text).collect();
        assert_eq!(texts, vec!["one", "two"]);
    }

    #[test]
    fn ignores_blank_and_oversized_text() {
        let h = ClipboardHistory::default();
        assert!(!h.record("   \n", 1));
        assert!(!h.record(&"x".repeat(MAX_CHARS + 1), 1));
        assert!(h.list().is_empty());
    }

    #[test]
    fn caps_the_number_of_items() {
        let h = ClipboardHistory::default();
        for n in 0..(MAX_ITEMS + 10) {
            h.record(&format!("item {n}"), n as u64);
        }
        let items = h.list();
        assert_eq!(items.len(), MAX_ITEMS);
        assert_eq!(items[0].text, format!("item {}", MAX_ITEMS + 9));
    }

    #[test]
    fn remove_clear_and_pause() {
        let h = ClipboardHistory::default();
        h.record("a", 1);
        h.record("b", 2);
        let a = h.list().into_iter().find(|i| i.text == "a").unwrap();
        h.remove(a.id);
        assert_eq!(h.list().len(), 1);
        h.clear();
        assert!(h.list().is_empty());
        h.set_paused(true);
        assert!(h.is_paused());
    }
}
