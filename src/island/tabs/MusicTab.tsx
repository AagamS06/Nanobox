import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MUSIC_PROVIDERS } from "../../integrations/music";
import type { MusicProviderId, NowPlayingData } from "../../integrations/music/types";
import { getActiveMusicProvider, setActiveMusicProvider } from "../../storage/music";

const POLL_MS = 2_000;

function formatMs(ms?: number): string {
  if (ms === undefined) return "";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Shared with the pill: what's playing right now, if anything. */
export async function fetchActiveNowPlaying(): Promise<NowPlayingData | null> {
  const id = await getActiveMusicProvider();
  const provider = MUSIC_PROVIDERS.find((p) => p.id === id && p.implemented);
  if (!provider) return null;
  return provider.fetchNowPlaying();
}

export function MusicTab() {
  const [providerId, setProviderId] = useState<MusicProviderId | null | undefined>(undefined);
  const [now, setNow] = useState<NowPlayingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      setNow(await fetchActiveNowPlaying());
      setError(null);
    } catch {
      // keep showing the last track on a transient failure
    }
  }, []);

  useEffect(() => {
    getActiveMusicProvider()
      .then(setProviderId)
      .catch(() => setProviderId(null));
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const system = MUSIC_PROVIDERS.find((p) => p.id === "system");
  const canControl = providerId === "system";

  async function control(action: "toggle" | "next" | "previous") {
    try {
      await invoke("system_media_control", { action });
      setTimeout(poll, 400);
    } catch (err) {
      setError(String(err));
    }
  }

  async function useSystem() {
    await setActiveMusicProvider("system");
    setProviderId("system");
    void poll();
  }

  if (providerId === undefined) return null;

  if (!providerId) {
    return (
      <div className="island-empty">
        <p>No music source picked yet.</p>
        {system?.implemented ? (
          <button className="island-btn island-btn--primary" onClick={useSystem}>
            Show what's playing on this device
          </button>
        ) : (
          <p className="island-muted">Pick a source in the Music widget.</p>
        )}
      </div>
    );
  }

  if (!now) {
    return (
      <div className="island-empty">
        <p>Nothing playing.</p>
        <p className="island-muted">Start something in Spotify, Apple Music, YouTube Music or any player.</p>
      </div>
    );
  }

  const progress = now.durationMs && now.progressMs !== undefined ? Math.min(1, now.progressMs / now.durationMs) : null;

  return (
    <div className="island-music">
      <div className="island-music__track">
        {now.artworkUrl ? (
          <img className="island-music__art" src={now.artworkUrl} alt="" />
        ) : (
          <div className="island-music__art island-music__art--empty" aria-hidden="true">
            ♪
          </div>
        )}
        <div className="island-music__text">
          <div className="island-music__title" title={now.trackTitle}>
            {now.trackTitle}
          </div>
          <div className="island-muted">{[now.artist, now.album].filter(Boolean).join(" — ")}</div>
        </div>
      </div>
      {progress !== null && (
        <div className="island-music__progress">
          <span>{formatMs(now.progressMs)}</span>
          <div className="island-music__bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <span>{formatMs(now.durationMs)}</span>
        </div>
      )}
      {canControl ? (
        <div className="island-music__controls">
          <button className="island-round" onClick={() => control("previous")} aria-label="Previous track">
            ⏮
          </button>
          <button className="island-round island-round--big" onClick={() => control("toggle")} aria-label={now.isPlaying ? "Pause" : "Play"}>
            {now.isPlaying ? "⏸" : "▶"}
          </button>
          <button className="island-round" onClick={() => control("next")} aria-label="Next track">
            ⏭
          </button>
        </div>
      ) : (
        <p className="island-muted island-center">Playback controls work with “Now Playing (this device)”.</p>
      )}
      {error && <p className="island-error">{error}</p>}
    </div>
  );
}
