/**
 * Settings model for the combined Custom Widget.
 *
 * One widget instance can be either a Codeable Widget (hand-written
 * HTML/CSS/JS in a sandboxed iframe) or a Block Widget (runs a saved Block
 * Builder program). Both configurations are kept side by side, so flipping
 * the mode switch back and forth never throws away the other one's setup.
 *
 * Stored in `widget_instances.settings` as:
 *   { "mode": "code" | "block", "code": {...} | null, "block": {...} | null }
 *
 * `code` / `block` being null means "never saved", which opens that mode's
 * editor straight away — the same first-run behaviour each widget had when
 * it was its own widget type.
 *
 * Migration 11 (src-tauri/src/lib.rs) rewrites old rows into this shape, but
 * the parser still accepts the two pre-merge shapes so a row that somehow
 * skipped the migration keeps working instead of resetting.
 */

export type CustomWidgetMode = "code" | "block";

export interface CustomWidgetCode {
  title: string;
  html: string;
  css: string;
  js: string;
}

export interface BlockWidgetConfig {
  programId: number | null;
  intervalMs: number;
}

export interface CustomWidgetSettings {
  mode: CustomWidgetMode;
  code: CustomWidgetCode | null;
  block: BlockWidgetConfig | null;
}

export const DEFAULT_MODE: CustomWidgetMode = "code";
export const DEFAULT_BLOCK_INTERVAL_MS = 30_000;

export const EMPTY_SETTINGS: CustomWidgetSettings = { mode: DEFAULT_MODE, code: null, block: null };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCode(value: unknown): CustomWidgetCode | null {
  if (!isObject(value)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    title: str(value.title) || "Untitled widget",
    html: str(value.html),
    css: str(value.css),
    js: str(value.js),
  };
}

function parseBlock(value: unknown): BlockWidgetConfig | null {
  if (!isObject(value)) return null;
  return {
    programId: typeof value.programId === "number" ? value.programId : null,
    intervalMs:
      typeof value.intervalMs === "number" && value.intervalMs > 0 ? value.intervalMs : DEFAULT_BLOCK_INTERVAL_MS,
  };
}

const looksLikeLegacyCode = (v: Json) => "html" in v || "css" in v || "js" in v;
const looksLikeLegacyBlock = (v: Json) => "programId" in v || "intervalMs" in v;

export function parseCustomWidgetSettings(raw: string | null): CustomWidgetSettings {
  if (!raw) return EMPTY_SETTINGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_SETTINGS;
  }
  if (!isObject(parsed)) return EMPTY_SETTINGS;

  if (parsed.mode === "code" || parsed.mode === "block") {
    return { mode: parsed.mode, code: parseCode(parsed.code), block: parseBlock(parsed.block) };
  }
  // Pre-merge shapes: a bare Custom Widget code object or a bare Block Widget config.
  if (looksLikeLegacyCode(parsed)) return { mode: "code", code: parseCode(parsed), block: null };
  if (looksLikeLegacyBlock(parsed)) return { mode: "block", code: null, block: parseBlock(parsed) };
  return EMPTY_SETTINGS;
}

export function serializeCustomWidgetSettings(settings: CustomWidgetSettings): string {
  return JSON.stringify(settings);
}
