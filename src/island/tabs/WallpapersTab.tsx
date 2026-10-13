import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getSetting, setSetting } from "../../storage/settings";
import { useHoldOpen } from "../holdOpen";

interface WallpaperFile {
  path: string;
  name: string;
}

const FOLDER_KEY = "wallpaperFolder";

function sameFile(a: string | null, b: string): boolean {
  if (!a) return false;
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

function Thumb({ file, current, onPick }: { file: WallpaperFile; current: boolean; onPick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoke<string>("wallpaper_thumbnail", { path: file.path })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.path]);
  return (
    <button className={`island-wall ${current ? "is-current" : ""}`} onClick={onPick} title={file.name} aria-pressed={current}>
      {src ? <img src={src} alt={file.name} /> : <span className="island-wall__loading" aria-hidden="true" />}
    </button>
  );
}

/** Set your desktop wallpaper from a folder of images you choose. */
export function WallpapersTab() {
  const [folder, setFolder] = useState<string | null | undefined>(undefined);
  const [files, setFiles] = useState<WallpaperFile[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holdOpen = useHoldOpen();

  useEffect(() => {
    getSetting(FOLDER_KEY)
      .then(setFolder)
      .catch(() => setFolder(null));
    invoke<string | null>("wallpaper_current").then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    if (!folder) return;
    invoke<WallpaperFile[]>("wallpaper_list", { folder })
      .then((list) => {
        setFiles(list);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [folder]);

  async function chooseFolder() {
    const picked = await holdOpen(openDialog({ directory: true, multiple: false, title: "Choose a folder of wallpapers" }));
    if (typeof picked !== "string") return;
    await setSetting(FOLDER_KEY, picked);
    setFolder(picked);
  }

  async function apply(file: WallpaperFile) {
    try {
      setError(null);
      await invoke("wallpaper_set", { path: file.path });
      setCurrent(file.path);
    } catch (err) {
      setError(String(err));
    }
  }

  if (folder === undefined) return null;

  if (!folder) {
    return (
      <div className="island-empty">
        <p>Pick a folder of wallpapers.</p>
        <p className="island-muted">Any JPG, PNG, WebP or BMP images in it show up here.</p>
        <button className="island-btn island-btn--primary" onClick={chooseFolder}>
          Choose folder
        </button>
      </div>
    );
  }

  return (
    <div className="island-walls">
      <div className="island-toolbar">
        <span className="island-muted island-walls__folder" title={folder}>
          {folder.split(/[\\/]/).filter(Boolean).pop()}
        </span>
        <button className="island-btn" onClick={chooseFolder}>
          Change folder
        </button>
      </div>
      {files.length === 0 && !error ? (
        <p className="island-muted">No images in that folder.</p>
      ) : (
        <div className="island-walls__grid">
          {files.map((f) => (
            <Thumb key={f.path} file={f} current={sameFile(current, f.path)} onPick={() => apply(f)} />
          ))}
        </div>
      )}
      {error && <p className="island-error">{error}</p>}
    </div>
  );
}
