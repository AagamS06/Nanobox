//! OS-level "now playing" via the platform's native media-session APIs —
//! the same source the taskbar / lock-screen media controls read from.
//!
//! Unlike the per-service providers in `src/integrations/music/*.ts`
//! (Spotify's OAuth+Client-ID flow, or the deliberately-unimplemented Apple
//! Music / YouTube Music stubs), this needs no client ID, no OAuth
//! consent screen, and no per-app registration: it works generically for
//! whatever app currently holds the system media session — Spotify
//! (desktop app or a browser tab), YouTube Music in any browser, the Apple
//! Music app, VLC, etc. — because they all already report their playback
//! state to the OS to drive its native media controls.
//!
//! Windows: backed by `Windows.Media.Control.
//! GlobalSystemMediaTransportControlsSessionManager` (SMTC) via the
//! `windows` crate's WinRT bindings.
//!
//! macOS: there is no public equivalent. The data lives behind the private
//! `MediaRemote.framework`, and since macOS 15.4 `mediaremoted` refuses
//! clients that lack an Apple-only entitlement. We read it through the
//! `media-remote` crate's `NowPlayingPerl`, which wraps ungive's
//! `mediaremote-adapter`: a small framework loaded by the Apple-signed
//! `/usr/bin/perl` (which the daemon *does* trust), streaming JSON back on
//! stdout. No SIP changes, no extra permissions prompt. It is still a
//! private-framework workaround, so treat it as best-effort — if a future
//! macOS update breaks it, the command degrades to `Ok(None)` ("nothing
//! playing") rather than an error, and Spotify OAuth keeps working.
//!
//! Linux: MPRIS over D-Bus is a plausible future addition; out of scope for
//! now. `get_system_now_playing` returns `Ok(None)` there, and
//! `src/integrations/music/systemMedia.ts` doesn't offer the provider.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemNowPlaying {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub is_playing: bool,
    /// Milliseconds into the current track, if the session reports a timeline.
    pub position_ms: Option<u64>,
    /// Track duration in milliseconds, if the session reports a timeline.
    pub duration_ms: Option<u64>,
    /// `data:<mime>;base64,<...>` URI, ready to drop straight into an `<img src>`.
    pub artwork_base64: Option<String>,
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_system_now_playing() -> Result<Option<SystemNowPlaying>, String> {
    windows_impl::current().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn get_system_now_playing() -> Result<Option<SystemNowPlaying>, String> {
    Ok(macos_impl::current())
}

/// Play/pause/skip for whatever app holds the system media session — used
/// by the island's Music tab. `action` is "toggle", "next" or "previous".
#[tauri::command]
pub fn system_media_control(action: String) -> Result<(), String> {
    let action = MediaAction::parse(&action).ok_or_else(|| format!("Unknown media action: {action}"))?;
    #[cfg(target_os = "windows")]
    {
        windows_impl::control(action).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        macos_impl::control(action)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = action;
        Err("Media controls aren't available on this platform.".into())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MediaAction {
    Toggle,
    Next,
    Previous,
}

impl MediaAction {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "toggle" => Some(Self::Toggle),
            "next" => Some(Self::Next),
            "previous" => Some(Self::Previous),
            _ => None,
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[tauri::command]
pub fn get_system_now_playing() -> Result<Option<SystemNowPlaying>, String> {
    // See module doc comment — no "now playing" source wired up on this
    // platform. The frontend provider isn't marked `implemented` here
    // anyway, so this is a defensive fallback rather than the primary path.
    Ok(None)
}

#[cfg(target_os = "macos")]
mod macos_impl {
    use super::SystemNowPlaying;
    use base64::Engine;
    use media_remote::NowPlayingPerl;
    use std::io::Cursor;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};

    /// Path the adapter is launched with. Apple has shipped a system Perl at
    /// this path on every macOS release Nanobox targets; we still check for
    /// it, because `NowPlayingPerl` spawns it with `.expect(..)` on a
    /// background thread, and with `panic = "abort"` in the release profile
    /// a missing interpreter would take the whole app down.
    const SYSTEM_PERL: &str = "/usr/bin/perl";

    /// Artwork is downscaled before encoding so the IPC payload stays small
    /// (the widget never renders it larger than this).
    const ARTWORK_MAX_PX: u32 = 300;

    /// One long-lived reader for the whole app. Created lazily on the first
    /// poll, i.e. only once the user has actually picked "Now Playing" as
    /// their music source — no background `perl` process otherwise.
    /// `None` inside means "unavailable on this machine", cached so we
    /// don't re-probe every 10 seconds.
    static READER: OnceLock<Option<NowPlayingPerl>> = OnceLock::new();

    /// Last encoded artwork, keyed by track, so a 10-second poll doesn't
    /// re-encode the same PNG over and over.
    static ARTWORK_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

    fn reader() -> Option<&'static NowPlayingPerl> {
        READER
            .get_or_init(|| {
                if !Path::new(SYSTEM_PERL).exists() {
                    return None;
                }
                Some(NowPlayingPerl::new())
            })
            .as_ref()
    }

    pub fn current() -> Option<SystemNowPlaying> {
        let reader = reader()?;
        // `get_info` also advances the elapsed time for a playing track, so
        // the progress bar keeps moving between the adapter's own updates.
        let guard = reader.get_info();
        let info = guard.as_ref()?;

        let title = info.title.clone().unwrap_or_default();
        if title.is_empty() {
            return None;
        }
        let artist = info.artist.clone().unwrap_or_default();
        let album = info.album.clone().filter(|s| !s.is_empty());

        let is_playing = info
            .is_playing
            .unwrap_or_else(|| info.playback_rate.map(|r| r > 0.0).unwrap_or(false));

        let position_ms = info.elapsed_time.map(secs_to_ms);
        let duration_ms = info.duration.map(secs_to_ms).filter(|&d| d > 0);

        let key = format!("{title}\u{1f}{artist}\u{1f}{}", album.as_deref().unwrap_or(""));
        let artwork_base64 = {
            let mut cache = ARTWORK_CACHE.lock().unwrap_or_else(|e| e.into_inner());
            match cache.as_ref() {
                // Only reuse a cached cover that actually exists: the
                // adapter can send the cover a moment after the title, so
                // keep retrying while the cached value is still `None`.
                Some((cached_key, Some(art))) if *cached_key == key => Some(art.clone()),
                _ => {
                    let art = info.album_cover.as_ref().and_then(encode_artwork);
                    *cache = Some((key, art.clone()));
                    art
                }
            }
        };

        Some(SystemNowPlaying {
            title,
            artist,
            album,
            is_playing,
            position_ms,
            duration_ms,
            artwork_base64,
        })
    }

    pub fn control(action: super::MediaAction) -> Result<(), String> {
        use media_remote::Controller;
        let reader = reader().ok_or("Now Playing isn't available on this Mac.")?;
        let ok = match action {
            super::MediaAction::Toggle => reader.toggle(),
            super::MediaAction::Next => reader.next(),
            super::MediaAction::Previous => reader.previous(),
        };
        if ok {
            Ok(())
        } else {
            Err("The playing app didn't accept the command.".into())
        }
    }

    fn encode_artwork(img: &image::DynamicImage) -> Option<String> {
        let thumb = if img.width() > ARTWORK_MAX_PX || img.height() > ARTWORK_MAX_PX {
            img.thumbnail(ARTWORK_MAX_PX, ARTWORK_MAX_PX)
        } else {
            img.clone()
        };
        let mut buf = Cursor::new(Vec::new());
        thumb.write_to(&mut buf, image::ImageFormat::Png).ok()?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
        Some(format!("data:image/png;base64,{encoded}"))
    }

    fn secs_to_ms(secs: f64) -> u64 {
        if secs.is_finite() && secs > 0.0 {
            (secs * 1000.0) as u64
        } else {
            0
        }
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::SystemNowPlaying;
    use base64::Engine;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    /// WinRT activation (the `RequestAsync` factory lookup below) requires
    /// COM to be initialized on the calling thread, and Tauri dispatches
    /// blocking commands onto a thread-pool thread that isn't
    /// COM-initialized by default. `pollster::block_on` keeps the whole
    /// async chain pinned to *this* OS thread (it parks/unparks rather than
    /// letting a multi-threaded async runtime resume the continuation on a
    /// different thread), so one apartment init up front is sufficient for
    /// the whole call — no per-await re-initialization needed. MTA is used
    /// because these are out-of-process broker objects (SMTC is agile) and
    /// MTA avoids needing a message pump for a blocking call site like this.
    pub fn current() -> windows::core::Result<Option<SystemNowPlaying>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        pollster::block_on(async {
            let manager = SessionManager::RequestAsync()?.await?;

            // `GetCurrentSession` succeeds with a null-backed result (which
            // `windows-core` turns into an `Err`) when no app currently
            // holds the system media session — that's "nothing playing",
            // not a real error.
            let Ok(session) = manager.GetCurrentSession() else {
                return Ok(None);
            };

            let props = session.TryGetMediaPropertiesAsync()?.await?;
            let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
            let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
            let album = props
                .AlbumTitle()
                .ok()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());

            let is_playing = session
                .GetPlaybackInfo()
                .ok()
                .and_then(|info| info.PlaybackStatus().ok())
                .map(|status| status == PlaybackStatus::Playing)
                .unwrap_or(false);

            let (position_ms, duration_ms) = match session.GetTimelineProperties() {
                Ok(timeline) => {
                    let position_ms = timeline.Position().ok().map(|ts| ticks_to_ms(ts.Duration));
                    let duration_ms = match (timeline.StartTime(), timeline.EndTime()) {
                        (Ok(start), Ok(end)) => Some(ticks_to_ms(end.Duration - start.Duration)),
                        _ => None,
                    };
                    (position_ms, duration_ms)
                }
                Err(_) => (None, None),
            };

            // Best-effort album art: any failure along this chain just
            // means no artwork, never a failure of the whole command.
            let artwork_base64: Option<String> = 'artwork: {
                let Ok(thumb_ref) = props.Thumbnail() else {
                    break 'artwork None;
                };
                let Ok(open_op) = thumb_ref.OpenReadAsync() else {
                    break 'artwork None;
                };
                let Ok(stream) = open_op.await else {
                    break 'artwork None;
                };
                let Ok(size) = stream.Size() else {
                    break 'artwork None;
                };
                // SMTC thumbnails are small (album art) — a sane upper
                // bound guards against ever base64-inflating something huge.
                if size == 0 || size > 8 * 1024 * 1024 {
                    break 'artwork None;
                }
                let content_type = stream
                    .ContentType()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|_| "image/png".to_string());
                let Ok(reader) = DataReader::CreateDataReader(&stream) else {
                    break 'artwork None;
                };
                let Ok(load_op) = reader.LoadAsync(size as u32) else {
                    break 'artwork None;
                };
                if load_op.await.is_err() {
                    break 'artwork None;
                }
                let mut buf = vec![0u8; size as usize];
                if reader.ReadBytes(&mut buf).is_err() {
                    break 'artwork None;
                }
                let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
                Some(format!("data:{content_type};base64,{encoded}"))
            };

            Ok(Some(SystemNowPlaying {
                title,
                artist,
                album,
                is_playing,
                position_ms,
                duration_ms,
                artwork_base64,
            }))
        })
    }

    pub fn control(action: super::MediaAction) -> windows::core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        pollster::block_on(async {
            let manager = SessionManager::RequestAsync()?.await?;
            let Ok(session) = manager.GetCurrentSession() else {
                return Ok(()); // nothing playing — nothing to control
            };
            let _accepted = match action {
                super::MediaAction::Toggle => session.TryTogglePlayPauseAsync()?.await?,
                super::MediaAction::Next => session.TrySkipNextAsync()?.await?,
                super::MediaAction::Previous => session.TrySkipPreviousAsync()?.await?,
            };
            Ok(())
        })
    }

    /// WinRT `TimeSpan.Duration` is in 100-nanosecond ticks.
    fn ticks_to_ms(ticks: i64) -> u64 {
        (ticks.max(0) as u64) / 10_000
    }
}
