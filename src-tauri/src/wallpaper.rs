//! Wallpaper switching for the island's Wallpapers tab: list the images in a
//! folder the user chose, make small thumbnails for the picker, and set one
//! as the desktop wallpaper (via the `wallpaper` crate — the Windows
//! SystemParametersInfo API, AppleScript on macOS).

use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::State;

const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "bmp", "webp", "gif"];
const MAX_IMAGES: usize = 120;
const THUMB_PX: u32 = 240;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperFile {
    pub path: String,
    pub name: String,
}

/// Thumbnails keyed by (path, modified time) so an edited image refreshes.
#[derive(Default)]
pub struct ThumbnailCache(Mutex<HashMap<(PathBuf, Option<SystemTime>), String>>);

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

pub fn list_images(folder: &Path) -> Result<Vec<WallpaperFile>, String> {
    let entries = std::fs::read_dir(folder).map_err(|e| format!("Couldn't read that folder: {e}"))?;
    let mut files: Vec<WallpaperFile> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_image(p))
        .map(|p| WallpaperFile {
            name: p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            path: p.to_string_lossy().into_owned(),
        })
        .collect();
    files.sort_by_key(|f| f.name.to_lowercase());
    files.truncate(MAX_IMAGES);
    Ok(files)
}

#[tauri::command]
pub fn wallpaper_list(folder: String) -> Result<Vec<WallpaperFile>, String> {
    list_images(Path::new(&folder))
}

#[tauri::command]
pub async fn wallpaper_thumbnail(cache: State<'_, ThumbnailCache>, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_image(&path) {
        return Err("Not an image.".into());
    }
    let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
    let key = (path.clone(), modified);
    if let Some(hit) = cache.0.lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
        return Ok(hit.clone());
    }
    let img = image::open(&path).map_err(|e| format!("Couldn't read image: {e}"))?;
    let thumb = img.thumbnail(THUMB_PX, THUMB_PX).to_rgb8();
    let mut buf = Cursor::new(Vec::new());
    thumb
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Couldn't make thumbnail: {e}"))?;
    let url = format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(buf.into_inner())
    );
    cache.0.lock().unwrap_or_else(|e| e.into_inner()).insert(key, url.clone());
    Ok(url)
}

#[tauri::command]
pub async fn wallpaper_set(path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() || !is_image(Path::new(&path)) {
        return Err("That image isn't there any more.".into());
    }
    wallpaper::set_from_path(&path).map_err(|e| format!("Couldn't set the wallpaper: {e}"))
}

#[tauri::command]
pub fn wallpaper_current() -> Option<String> {
    wallpaper::get().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_only_images_sorted_by_name() {
        let dir = std::env::temp_dir().join(format!("nanobox-wp-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for f in ["b.PNG", "a.jpg", "notes.txt", "c.webp"] {
            std::fs::write(dir.join(f), b"x").unwrap();
        }
        let names: Vec<_> = list_images(&dir).unwrap().into_iter().map(|f| f.name).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
