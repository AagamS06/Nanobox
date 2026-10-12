import { MusicProvider } from "./provider";

const UNAVAILABLE_REASON =
  "Use \"Now Playing (this device)\" instead — it already picks up the Apple Music app from the system media controls on Windows and macOS, with no account or developer setup. A dedicated integration would need an Apple Developer-signed MusicKit token, which a local-first app can't ship safely.";

/** Not implemented this session — see UNAVAILABLE_REASON. */
export const appleMusicProvider: MusicProvider = {
  id: "apple-music",
  label: "Apple Music",
  implemented: false,
  unavailableReason: UNAVAILABLE_REASON,
  needsConfig: true, // moot while `implemented` is false — never reaches the connect form
  async isConnected() {
    return false;
  },
  async connect() {
    throw new Error(UNAVAILABLE_REASON);
  },
  async disconnect() {},
  async fetchNowPlaying() {
    return null;
  },
};
