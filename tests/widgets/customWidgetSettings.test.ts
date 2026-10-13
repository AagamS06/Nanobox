import { describe, expect, it } from "vitest";
import {
  EMPTY_SETTINGS,
  parseCustomWidgetSettings,
  serializeCustomWidgetSettings,
} from "../../src/widgets/built-in/CustomWidget/settings";

const CODE = { title: "Hello", html: "<p>hi</p>", css: "p{}", js: "1" };

describe("parseCustomWidgetSettings", () => {
  it("treats a brand-new widget as an unsaved Codeable widget", () => {
    expect(parseCustomWidgetSettings(null)).toEqual({ mode: "code", code: null, block: null });
  });

  it("round-trips the combined shape, keeping both modes' setup", () => {
    const settings = { mode: "block" as const, code: CODE, block: { programId: 4, intervalMs: 5_000 } };
    expect(parseCustomWidgetSettings(serializeCustomWidgetSettings(settings))).toEqual(settings);
  });

  it("reads an old Custom Widget (bare code object) as Codeable mode", () => {
    expect(parseCustomWidgetSettings(JSON.stringify(CODE))).toEqual({ mode: "code", code: CODE, block: null });
  });

  it("reads an old Block Widget (bare config) as Block mode", () => {
    expect(parseCustomWidgetSettings(JSON.stringify({ programId: 2, intervalMs: 60_000 }))).toEqual({
      mode: "block",
      code: null,
      block: { programId: 2, intervalMs: 60_000 },
    });
  });

  it("matches what migration 11 writes for an unconfigured old Block Widget", () => {
    expect(parseCustomWidgetSettings('{"mode":"block","code":null,"block":null}')).toEqual({
      mode: "block",
      code: null,
      block: null,
    });
  });

  it("falls back to an empty widget on unreadable settings instead of throwing", () => {
    for (const raw of ["garbage", "null", "[]", '"text"', "42", '{"mode":"other"}']) {
      expect(parseCustomWidgetSettings(raw)).toEqual(EMPTY_SETTINGS);
    }
  });

  it("repairs bad field values", () => {
    const parsed = parseCustomWidgetSettings(
      JSON.stringify({ mode: "block", code: { html: 5 }, block: { programId: "7", intervalMs: -1 } }),
    );
    expect(parsed.code).toEqual({ title: "Untitled widget", html: "", css: "", js: "" });
    expect(parsed.block).toEqual({ programId: null, intervalMs: 30_000 });
  });
});
