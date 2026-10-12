use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

mod icons;
mod keychain;
mod oauth;
mod system_media;

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_notes_table",
            sql: "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                color TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "milestone_2_widget_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL DEFAULT '',
                    time TEXT NOT NULL,
                    days TEXT NOT NULL DEFAULT '',
                    sound TEXT NOT NULL DEFAULT 'chime',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    snoozed_until TEXT,
                    last_fired_on TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS shortcuts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    target_path TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS countdowns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    target_date TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS habits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#7c9cff',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS habit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                    log_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(habit_id, log_date)
                );

                CREATE TABLE IF NOT EXISTS widget_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    widget_type TEXT NOT NULL,
                    x INTEGER NOT NULL DEFAULT 24,
                    y INTEGER NOT NULL DEFAULT 24,
                    w INTEGER NOT NULL DEFAULT 240,
                    h INTEGER NOT NULL DEFAULT 160,
                    opacity REAL NOT NULL DEFAULT 1,
                    settings TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "milestone_3_app_settings",
            sql: "
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "milestone_4_adhd_toolkit_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS timeline_blocks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    icon TEXT NOT NULL DEFAULT '',
                    color TEXT NOT NULL DEFAULT '#7c9cff',
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS brain_dump_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS task_breakdowns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS task_breakdown_steps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    breakdown_id INTEGER NOT NULL REFERENCES task_breakdowns(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS mood_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mood TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    log_date TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    interval_minutes INTEGER NOT NULL DEFAULT 60,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    last_fired_at TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "milestone_5_calendar_events",
            sql: "
                CREATE TABLE IF NOT EXISTS calendar_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uid TEXT,
                    title TEXT NOT NULL,
                    start_at TEXT NOT NULL,
                    end_at TEXT NOT NULL,
                    all_day INTEGER NOT NULL DEFAULT 0,
                    source TEXT NOT NULL DEFAULT 'ics',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(uid, start_at)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "milestone_6_widget_style_settings",
            sql: "ALTER TABLE widget_instances ADD COLUMN style_settings TEXT;",
            kind: MigrationKind::Up,
        },
        // Superseded by calendar_sources/calendar_events_cache below — v5's
        // calendar_events was a flat "import .ics events" table with no
        // multi-source support, no Google Calendar, and no cache-based
        // graceful degradation. Never rewrite an already-numbered migration
        // (anyone who already ran v5 needs it to stay exactly as it was) —
        // drop-and-replace happens in a new migration instead.
        Migration {
            version: 7,
            description: "milestone_5_integrations_tables",
            sql: "
                DROP TABLE IF EXISTS calendar_events;

                CREATE TABLE IF NOT EXISTS calendar_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    name TEXT NOT NULL,
                    file_path TEXT,
                    account_email TEXT,
                    color TEXT NOT NULL DEFAULT '#7c9cff',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS calendar_events_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id INTEGER NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
                    event_json TEXT NOT NULL,
                    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "shortcuts_icon_data",
            sql: "ALTER TABLE shortcuts ADD COLUMN icon_data TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "milestone_7_block_programs",
            sql: "
                CREATE TABLE IF NOT EXISTS block_programs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    program_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "milestone_7_custom_block_defs",
            sql: "
                CREATE TABLE IF NOT EXISTS custom_block_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    def_id TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    inputs_json TEXT NOT NULL DEFAULT '[]',
                    outputs_json TEXT NOT NULL DEFAULT '[]',
                    js_body TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                );
            ",
            kind: MigrationKind::Up,
        },
    ]
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Writes to an arbitrary path — unlike `save_custom_widget_file`, not
/// confined to one folder. Safe despite that: every caller sources `path`
/// from a native save dialog (`@tauri-apps/plugin-dialog`'s `save()`) that
/// the OS already showed the user and got their explicit consent to that
/// exact location for, not from anything a script could invent unattended.
/// Currently used for `.nanotheme` export.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

fn custom_widgets_dir_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("custom-widgets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Where Custom Widget code gets saved as standalone `.nanowidget.json` files
/// (in addition to the SQLite copy every widget instance already has) — a
/// dedicated, browsable folder, not buried in the app's database. Created on
/// first use if it doesn't exist yet. Exposed to the frontend so it can show
/// the user where their widgets live; actual writes go through
/// `save_custom_widget_file` below, not a generic write command.
#[tauri::command]
fn custom_widgets_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(custom_widgets_dir_path(&app)?.to_string_lossy().to_string())
}

/// Writes a `.nanowidget.json` export. Deliberately narrower than a generic
/// "write any path" command: `filename` is sanitized (no path separators or
/// `..`) and the result is always confined to `custom_widgets_dir`, so this
/// can only ever touch files in that one folder, regardless of what the
/// frontend passes.
#[tauri::command]
fn save_custom_widget_file(app: tauri::AppHandle, filename: String, contents: String) -> Result<String, String> {
    let safe_name: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    if safe_name.is_empty() || safe_name.contains("..") {
        return Err("invalid filename".to_string());
    }
    let path = custom_widgets_dir_path(&app)?.join(safe_name);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn toggle_overlay(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nanobox.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            save_custom_widget_file,
            custom_widgets_dir,
            keychain::secure_set,
            keychain::secure_get,
            keychain::secure_delete,
            oauth::oauth_await_redirect,
            icons::extract_file_icon,
            icons::read_image_as_data_url,
            system_media::get_system_now_playing,
        ])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide Nanobox", true, None::<&str>)?;
            let quit = PredefinedMenuItem::quit(app, Some("Quit Nanobox"))?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Nanobox")
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "show_hide" {
                        toggle_overlay(app);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        toggle_overlay(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the overlay just hides it — the tray icon is the real quit path.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "overlay" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
