import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockProgram } from "../../src/integrations/blockEngine/types";

const files = new Map<string, string>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: { path: string; contents?: string }) => {
    if (cmd === "write_text_file") files.set(args.path, args.contents!);
    if (cmd === "read_text_file") return files.get(args.path);
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("../../src/storage/blockPrograms", () => ({ createBlockProgram: vi.fn().mockResolvedValue(42) }));

import { open, save } from "@tauri-apps/plugin-dialog";
import { createBlockProgram } from "../../src/storage/blockPrograms";
import { exportNanowidget, importNanowidget } from "../../src/core/nanowidgetExport";

const PROGRAM: BlockProgram = {
  id: "p1",
  name: "Clock text",
  nodes: [
    { id: "a", defId: "data/get-current-time", label: "Now", x: 0, y: 0 },
    { id: "b", defId: "display/show-text", label: "Show", x: 200, y: 0 },
  ],
  edges: [{ id: "e1", from: { nodeId: "a", portId: "time" }, to: { nodeId: "b", portId: "text" } }],
  rootNodeId: "b",
  createdAt: 1,
  updatedAt: 2,
};

function importText(text: string) {
  files.set("/tmp/in.nanowidget", text);
  vi.mocked(open).mockResolvedValue("/tmp/in.nanowidget");
  return importNanowidget();
}

describe(".nanowidget export / import", () => {
  afterEach(() => {
    files.clear();
    vi.clearAllMocks();
  });

  it("round-trips a program as a new program", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/out.nanowidget");
    await exportNanowidget(PROGRAM);
    const written = JSON.parse(files.get("/tmp/out.nanowidget")!);
    expect(written).toEqual({ schemaVersion: 1, name: "Clock text", program: PROGRAM });

    vi.mocked(open).mockResolvedValue("/tmp/out.nanowidget");
    await expect(importNanowidget()).resolves.toBe(42);
    expect(createBlockProgram).toHaveBeenCalledWith(PROGRAM);
  });

  it("does nothing when either dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await exportNanowidget(PROGRAM);
    expect(files.size).toBe(0);
    vi.mocked(open).mockResolvedValue(null);
    await expect(importNanowidget()).resolves.toBeNull();
  });

  it("explains malformed files instead of importing them", async () => {
    await expect(importText("not json")).rejects.toThrow(/isn't valid JSON/);
    await expect(importText(JSON.stringify({ name: "x", program: PROGRAM }))).rejects.toThrow(/schema version/);
    await expect(importText(JSON.stringify({ schemaVersion: 1, program: { id: "x", name: "y" } }))).rejects.toThrow(/corrupted/);
    expect(createBlockProgram).not.toHaveBeenCalled();
  });
});
