import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomWidget } from "../../src/widgets/built-in/CustomWidget/CustomWidget";
import { listBlockPrograms, getBlockProgram } from "../../src/storage/blockPrograms";
import { updateWidgetSettings, type WidgetInstance } from "../../src/storage/widgetInstances";

vi.mock("../../src/storage/blockPrograms", () => ({
  listBlockPrograms: vi.fn(),
  getBlockProgram: vi.fn(),
}));

vi.mock("../../src/storage/widgetInstances", () => ({
  updateWidgetSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/storage/customWidgetFiles", () => ({
  saveCustomWidgetFile: vi.fn().mockResolvedValue("/tmp/widget.nanowidget.json"),
}));

vi.mock("../../src/integrations/blockEngine/bridge", () => ({ liveBridge: {} }));

const CODE = { title: "Weather", html: "<p>sun</p>", css: "", js: "" };

function makeInstance(settings: string | null): WidgetInstance {
  return { id: 7, widget_type: "custom", x: 0, y: 0, w: 300, h: 300, opacity: 1, settings, style_settings: null };
}

function lastSaved() {
  const calls = vi.mocked(updateWidgetSettings).mock.calls;
  return JSON.parse(calls[calls.length - 1][1] as string);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CustomWidget", () => {
  beforeEach(() => {
    vi.mocked(listBlockPrograms).mockResolvedValue([]);
    vi.mocked(getBlockProgram).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a two-option switch with Codeable Widget selected for a new widget", () => {
    render(<CustomWidget instance={makeInstance(null)} />);

    const group = screen.getByRole("radiogroup", { name: "Widget type" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Codeable Widget" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Block Widget" })).not.toBeChecked();
    // A never-saved Codeable widget opens straight into its editor.
    expect(screen.getByText("Save & Run")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Custom Widget" })).toBeInTheDocument();
  });

  it("switches to Block mode, saves the choice, and shows the block editor", async () => {
    const onSaved = vi.fn();
    render(<CustomWidget instance={makeInstance(null)} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("radio", { name: "Block Widget" }));
    await flush();

    expect(screen.getByRole("radio", { name: "Block Widget" })).toBeChecked();
    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(lastSaved()).toEqual({ mode: "block", code: null, block: null });
    expect(onSaved).toHaveBeenCalledWith(JSON.stringify({ mode: "block", code: null, block: null }));
  });

  it("keeps the Codeable setup when switching to Block and back", async () => {
    const settings = JSON.stringify({ mode: "code", code: CODE, block: null });
    render(<CustomWidget instance={makeInstance(settings)} />);

    expect(screen.getByRole("region", { name: "Weather" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Block Widget" }));
    await flush();
    fireEvent.click(screen.getByRole("radio", { name: "Codeable Widget" }));
    await flush();

    expect(lastSaved()).toEqual({ mode: "code", code: CODE, block: null });
    // Back on the saved code's running preview, not a fresh editor.
    expect(screen.getByTitle("Custom widget preview")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Weather" })).toBeInTheDocument();
  });

  it("saves Codeable code without losing the Block setup", async () => {
    const block = { programId: 3, intervalMs: 5_000 };
    render(<CustomWidget instance={makeInstance(JSON.stringify({ mode: "code", code: null, block }))} />);

    fireEvent.change(screen.getByPlaceholderText("My widget"), { target: { value: "Clocky" } });
    fireEvent.click(screen.getByText("Save & Run"));

    await waitFor(() => expect(updateWidgetSettings).toHaveBeenCalled());
    const saved = lastSaved();
    expect(saved.mode).toBe("code");
    expect(saved.code.title).toBe("Clocky");
    expect(saved.block).toEqual(block);
  });

  it("opens an old Block Widget in Block mode", async () => {
    render(<CustomWidget instance={makeInstance(JSON.stringify({ programId: 99, intervalMs: 30_000 }))} />);
    await flush();

    expect(screen.getByRole("radio", { name: "Block Widget" })).toBeChecked();
    await waitFor(() => expect(screen.getByText("This program was deleted.")).toBeInTheDocument());
  });

  it("does nothing when the already-selected option is picked again", async () => {
    render(<CustomWidget instance={makeInstance(null)} />);

    fireEvent.click(screen.getByRole("radio", { name: "Codeable Widget" }));
    await flush();

    expect(updateWidgetSettings).not.toHaveBeenCalled();
  });
});
