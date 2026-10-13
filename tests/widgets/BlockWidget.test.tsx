import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockWidget } from "../../src/widgets/built-in/BlockWidget/BlockWidget";
import { getBlockProgram, listBlockPrograms, type BlockProgramRow } from "../../src/storage/blockPrograms";
import type { BlockProgram } from "../../src/integrations/blockEngine/types";

vi.mock("../../src/storage/blockPrograms", () => ({
  listBlockPrograms: vi.fn(),
  getBlockProgram: vi.fn(),
}));

// Real bridge.ts imports @tauri-apps/plugin-notification and plugin-opener,
// neither available in this jsdom test — swap in an inert stand-in, the same
// way tests/integrations/blockEngine.test.ts avoids importing bridge.ts at all.
vi.mock("../../src/integrations/blockEngine/bridge", () => ({ liveBridge: {} }));

const PROGRAM: BlockProgram = {
  id: "1",
  name: "Greeting",
  nodes: [
    { id: "a", defId: "data/get-current-time", label: "Now", x: 0, y: 0 },
    { id: "b", defId: "display/show-text", label: "Show", x: 200, y: 0 },
  ],
  edges: [{ id: "e1", from: { nodeId: "a", portId: "time" }, to: { nodeId: "b", portId: "text" } }],
  rootNodeId: "b",
  createdAt: 0,
  updatedAt: 0,
};

const PROGRAM_ROW: BlockProgramRow = {
  id: 1,
  name: "Greeting",
  program_json: JSON.stringify(PROGRAM),
  created_at: "2026-08-19T00:00:00Z",
  updated_at: "2026-08-19T00:00:00Z",
};

const onSave = vi.fn().mockResolvedValue(undefined);

describe("BlockWidget", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prompts for a program to run when the instance has no saved config", async () => {
    vi.mocked(listBlockPrograms).mockResolvedValue([PROGRAM_ROW]);

    render(<BlockWidget config={null} onSave={onSave} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Greeting" })).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("runs the saved program and displays its root value", async () => {
    vi.mocked(listBlockPrograms).mockResolvedValue([PROGRAM_ROW]);
    vi.mocked(getBlockProgram).mockResolvedValue(PROGRAM_ROW);

    const onProgramName = vi.fn();
    render(<BlockWidget config={{ programId: 1, intervalMs: 30_000 }} onSave={onSave} onProgramName={onProgramName} />);

    await waitFor(() => {
      expect(screen.getByText(/^\d{4}-\d{2}-\d{2}T/)).toBeInTheDocument();
    });
    // The program name becomes the Custom Widget's title.
    expect(onProgramName).toHaveBeenLastCalledWith("Greeting");
  });

  it("shows an error when the configured program was deleted", async () => {
    vi.mocked(listBlockPrograms).mockResolvedValue([]);
    vi.mocked(getBlockProgram).mockResolvedValue(null);

    render(<BlockWidget config={{ programId: 99, intervalMs: 30_000 }} onSave={onSave} />);

    await waitFor(() => {
      expect(screen.getByText("This program was deleted.")).toBeInTheDocument();
    });
  });

  it("saves the chosen program and interval", async () => {
    vi.mocked(listBlockPrograms).mockResolvedValue([PROGRAM_ROW]);
    vi.mocked(getBlockProgram).mockResolvedValue(PROGRAM_ROW);

    render(<BlockWidget config={null} onSave={onSave} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText("Program"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ programId: 1, intervalMs: 30_000 });
    });
  });
});
