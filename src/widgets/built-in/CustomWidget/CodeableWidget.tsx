import { useState } from "react";
import { saveCustomWidgetFile } from "../../../storage/customWidgetFiles";
import type { CustomWidgetCode } from "./settings";

export const STARTER_CODE: CustomWidgetCode = {
  title: "Untitled widget",
  html: `<div id="app"></div>`,
  css: `body { margin: 0; height: 100%; display: flex; align-items: center; justify-content: center; font-family: sans-serif; color: #fff; }
#app { font-size: 1.4em; font-weight: 700; text-align: center; }`,
  js: `let n = 0;
const el = document.getElementById("app");
function tick() {
  el.textContent = "Hello, dev 👋 (" + n++ + ")";
}
tick();
setInterval(tick, 1000);`,
};

const SRCDOC_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
].join("; ");

export function buildSrcDoc(code: CustomWidgetCode): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SRCDOC_CSP}"><style>${code.css}</style></head><body>${code.html}<script>${code.js}<\/script></body></html>`;
}

interface CodeableWidgetProps {
  instanceId: number;
  /** Saved code, or null if this widget has never been saved in Codeable mode. */
  code: CustomWidgetCode | null;
  onSave: (code: CustomWidgetCode) => Promise<void>;
}

/**
 * Codeable mode of the Custom Widget: runs hand-written HTML/CSS/JS in an
 * iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, so the
 * frame gets an opaque origin and cannot reach `window.parent`, Nanobox's
 * data, or any Tauri API. The srcdoc CSP (`default-src 'none'`) also blocks
 * the widget's own network requests. Rendered inside the Custom Widget's
 * frame — see CustomWidget.tsx.
 */
export function CodeableWidget({ instanceId, code: saved, onSave }: CodeableWidgetProps) {
  const initial = saved ?? STARTER_CODE;
  const [editing, setEditing] = useState(saved === null);
  const [code, setCode] = useState(initial);
  const [previewCode, setPreviewCode] = useState(initial);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  async function save() {
    await onSave(code);
    setPreviewCode(code);
    setEditing(false);
    try {
      const path = await saveCustomWidgetFile(instanceId, code);
      setSavedPath(path);
    } catch (err) {
      console.error("failed to save .nanowidget.json file", err);
    }
  }

  return (
    <div className="custom-widget">
      {editing ? (
        <div className="custom-widget__editor" data-no-drag>
          <label>
            Title
            <input
              type="text"
              value={code.title}
              onChange={(e) => setCode({ ...code, title: e.target.value })}
              placeholder="My widget"
            />
          </label>
          <label>
            HTML
            <textarea value={code.html} onChange={(e) => setCode({ ...code, html: e.target.value })} rows={3} />
          </label>
          <label>
            CSS
            <textarea value={code.css} onChange={(e) => setCode({ ...code, css: e.target.value })} rows={3} />
          </label>
          <label>
            JavaScript
            <textarea value={code.js} onChange={(e) => setCode({ ...code, js: e.target.value })} rows={4} />
          </label>
          <p className="custom-widget__hint">
            Runs sandboxed — no access to Nanobox data, files, or Tauri APIs. Network calls from your JS are blocked.
            Saving also writes a copy to your custom-widgets folder as a <code>.nanowidget.json</code> file.
          </p>
          <div className="custom-widget__actions">
            <button onClick={() => setEditing(false)}>Cancel</button>
            <button className="custom-widget__save" onClick={save}>
              Save &amp; Run
            </button>
          </div>
        </div>
      ) : (
        <div className="custom-widget__preview" data-no-drag>
          <iframe
            title="Custom widget preview"
            className="custom-widget__frame"
            sandbox="allow-scripts"
            srcDoc={buildSrcDoc(previewCode)}
          />
          <div className="custom-widget__preview-footer">
            {savedPath && <span className="custom-widget__saved-note">Saved to custom-widgets folder</span>}
            <button className="custom-widget__edit" onClick={() => setEditing(true)}>
              Edit code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
