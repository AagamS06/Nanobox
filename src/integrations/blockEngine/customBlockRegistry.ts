/**
 * In-memory registry of compiled custom-block bodies.
 *
 * Deliberately kept free of any storage/Tauri import so `evaluator.ts` can
 * reach it while staying runnable (and testable) outside a Tauri runtime.
 * `customBlockLoader.ts` is the piece that talks to SQLite and fills this in.
 *
 * Sandboxing: each run happens in a fresh Web Worker created from a blob URL.
 * A worker has no `window`, no DOM and none of Tauri's injected IPC, so a
 * custom block can't read files, launch programs or read stored sign-in
 * tokens. Network APIs are removed inside the worker before the body runs.
 * Inputs and the result cross the boundary by structured clone, so a block
 * can only ever return plain data.
 *
 * The worker is terminated after CUSTOM_BLOCK_TIMEOUT_MS, so even
 * `while (true) {}` is stopped instead of freezing the whole widgets window
 * (and, with it, the scheduler that fires alarms and routines).
 *
 * Where `Worker` doesn't exist (unit tests under jsdom) bodies run inline
 * with an after-the-fact time check — never the case inside the app.
 */

/** Custom def ids are namespaced so the evaluator can spot them by prefix. */
export const CUSTOM_DEF_PREFIX = "custom/";

export function isCustomDefId(defId: string): boolean {
  return defId.startsWith(CUSTOM_DEF_PREFIX);
}

/** Hard ceiling on body size, matching what the creator UI enforces. */
export const MAX_JS_BODY_BYTES = 8 * 1024;

export type CustomBlockEvaluator = (inputs: Record<string, unknown>) => Promise<unknown>;

const EVALUATORS = new Map<string, CustomBlockEvaluator>();

/** A custom block is stopped if a single run takes longer than this. */
export const CUSTOM_BLOCK_TIMEOUT_MS = 2_000;

const WORKER_SOURCE = `
"use strict";
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
                    "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel"]) {
  try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (e) {}
}
self.onmessage = async (event) => {
  const { body, inputs } = event.data;
  try {
    const run = new Function("inputs", body);
    const value = await run(inputs);
    self.postMessage({ ok: true, value });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
`;

let workerUrl: string | null = null;

function workersAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL?.createObjectURL === "function";
}

function seconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

/** Runs `body` in a throwaway worker, terminating it on timeout. Exported for tests. */
export function runInWorker(body: string, inputs: Record<string, unknown>, timeoutMs = CUSTOM_BLOCK_TIMEOUT_MS): Promise<unknown> {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl!);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`took longer than ${seconds(timeoutMs)} and was stopped`));
    }, timeoutMs);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: unknown; error?: string }>) => {
      finish();
      if (event.data.ok) resolve(event.data.value);
      else reject(new Error(event.data.error ?? "failed"));
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault?.();
      finish();
      reject(new Error(event.message || "failed"));
    };
    try {
      worker.postMessage({ body, inputs });
    } catch (err) {
      finish();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Checks a body parses (throwing a SyntaxError if not) and returns its
 * sandboxed runner. Parsing with `new Function` here only compiles the text —
 * it never executes it on the main thread.
 */
export function compileCustomBlockBody(jsBody: string, timeoutMs = CUSTOM_BLOCK_TIMEOUT_MS): CustomBlockEvaluator {
  const inline = new Function("inputs", jsBody) as (inputs: Record<string, unknown>) => unknown;
  if (workersAvailable()) {
    return (inputs) => runInWorker(jsBody, inputs, timeoutMs);
  }
  return async (inputs) => {
    const start = Date.now();
    const result = await inline(inputs);
    if (Date.now() - start > timeoutMs) {
      throw new Error(`took longer than ${seconds(timeoutMs)}`);
    }
    return result;
  };
}

export function setCustomBlockEvaluator(defId: string, run: CustomBlockEvaluator): void {
  EVALUATORS.set(defId, run);
}

/** Returns the compiled runner for a custom block, or undefined if none is registered. */
export function getCustomBlockEvaluator(defId: string): CustomBlockEvaluator | undefined {
  return EVALUATORS.get(defId);
}

export function unregisterCustomBlockEvaluator(defId: string): void {
  EVALUATORS.delete(defId);
}
