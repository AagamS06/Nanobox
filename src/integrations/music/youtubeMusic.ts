import { MusicProvider } from "./provider";

const UNAVAILABLE_REASON =
  "Use \"Now Playing (this device)\" instead — it already picks up YouTube Music in any browser from the system media controls on Windows and macOS, with no account or developer setup. A dedicated integration would need a \"now playing\" API that YouTube Music doesn't offer.";

/** Not implemented this session — see UNAVAILABLE_REASON. */
export const youtubeMusicProvider: MusicProvider = {
  id: "youtube-music",
  label: "YouTube Music",
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
