//! Opens an app, file, folder or web link the user picked themselves — used
//! by the Shortcuts widget, Routines, the island's Apps tab and the block
//! engine's "Open App" action.
//!
//! This exists because the opener plugin's frontend `openPath` is scoped:
//! with only `opener:default` in the capability file it refuses every local
//! path, which is what silently broke app shortcuts. Going through one
//! explicit command keeps the rule in one place: web links (http/https)
//! open in the browser, anything else is treated as a path on this machine.
//! Sandboxed Custom Widget iframes can't reach Tauri commands at all, so this
//! is only callable from Nanobox's own UI.

use tauri_plugin_opener::OpenerExt;

fn is_web_link(target: &str) -> bool {
    let lower = target.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[tauri::command]
pub fn open_target(app: tauri::AppHandle, target: String) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("Nothing to open.".into());
    }
    let opener = app.opener();
    let result = if is_web_link(target) {
        opener.open_url(target, None::<&str>)
    } else {
        opener.open_path(target, None::<&str>)
    };
    result.map_err(|e| format!("Couldn't open {target}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::is_web_link;

    #[test]
    fn web_links_are_detected_case_insensitively() {
        assert!(is_web_link("https://example.com"));
        assert!(is_web_link("HTTP://example.com"));
        assert!(!is_web_link("C:\\Program Files\\Spotify\\Spotify.exe"));
        assert!(!is_web_link("/Applications/Spotify.app"));
        assert!(!is_web_link("file:///etc/passwd"));
        assert!(!is_web_link("javascript:alert(1)"));
    }
}
