import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { getDb } from "./storage/db";
import { scheduleStartupUpdateCheck } from "./core/updater";

// Both windows load this same page; the island window renders the island
// instead of the widgets app (see src/island/Island.tsx).
function windowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "overlay"; // no Tauri runtime (e.g. a plain browser preview)
  }
}
const isIsland = windowLabel() === "island";
const Island = lazy(() => import("./island/Island"));

// Kick off DB connection + migrations immediately — before React even mounts.
// By the time App.tsx's useEffect runs, the promise is already in flight (or
// resolved), so the user doesn't wait an extra tick for the DB to open.
getDb().catch(() => {/* App.tsx handles errors and fails open */});

// Outside React on purpose: StrictMode double-runs effects in dev, and this
// should only ever fire once per launch (it's a no-op in dev anyway). Only the
// main window checks, so the island doesn't ask a second time.
if (!isIsland) scheduleStartupUpdateCheck();
import "./App.css";
import "./themes/base.css";
import "./themes/liquid-glass.css";
import "./themes/matte.css";
import "./themes/glossy.css";
import "./themes/retro.css";
import "./themes/cyberpunk.css";
import "./themes/steampunk.css";
import "./themes/standard.css";
import "./themes/nord.css";
import "./themes/dracula.css";
import "./themes/solarized.css";
import "./themes/forest.css";
import "./themes/ocean.css";
import "./themes/sunset.css";
import "./themes/monochrome.css";
import "./themes/cotton-candy.css";
import "./themes/industrial.css";
import "./themes/galaxy.css";
import "./themes/high-contrast.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isIsland ? (
      <Suspense fallback={null}>
        <Island />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
