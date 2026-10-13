import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo as TodoRecord } from "../../src/storage/todos";

vi.mock("../../src/storage/todos", async (orig) => ({
  ...(await orig<typeof import("../../src/storage/todos")>()),
  listTodos: vi.fn(),
  createTodo: vi.fn().mockResolvedValue(undefined),
  setTodoDone: vi.fn().mockResolvedValue(undefined),
  deleteTodo: vi.fn().mockResolvedValue(undefined),
  clearDoneTodos: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/core/scheduler", () => ({ SCHEDULER_EVENT: "nanobox:scheduler-fired", runRoutine: vi.fn() }));
vi.mock("../../src/core/launcher", async (orig) => ({ ...(await orig<typeof import("../../src/core/launcher")>()) }));

import { createTodo, listTodos, setTodoDone, sortTodos } from "../../src/storage/todos";
import { parseActions } from "../../src/storage/routines";
import { Todo } from "../../src/widgets/built-in/Todo/Todo";
import { summariseActions } from "../../src/widgets/built-in/Routines/Routines";
import { targetLabel } from "../../src/core/launcher";

const t = (over: Partial<TodoRecord>): TodoRecord => ({
  id: 1, text: "x", due_time: null, done: false, done_at: null, notified_on: null, ...over,
});

describe("sortTodos", () => {
  it("orders timed first by time, then untimed, then done (newest first)", () => {
    const sorted = sortTodos([
      t({ id: 1, text: "untimed A" }),
      t({ id: 2, text: "done old", done: true, done_at: "2026-10-14T01:00:00Z" }),
      t({ id: 3, text: "18:00", due_time: "18:00" }),
      t({ id: 4, text: "untimed B" }),
      t({ id: 5, text: "07:30", due_time: "07:30" }),
      t({ id: 6, text: "done new", done: true, done_at: "2026-10-14T05:00:00Z" }),
    ]);
    expect(sorted.map((x) => x.text)).toEqual(["07:30", "18:00", "untimed A", "untimed B", "done new", "done old"]);
  });
});

describe("Todo widget", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a to-do with an optional time and ticks one off", async () => {
    vi.mocked(listTodos).mockResolvedValue([t({ id: 9, text: "Call Mom" })]);
    render(<Todo />);
    await screen.findByText("Call Mom");
    expect(screen.getByText("0/1 done")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New to-do"), { target: { value: "Gym" } });
    fireEvent.click(screen.getByLabelText("Add a time"));
    fireEvent.change(screen.getByLabelText("Time today"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => expect(createTodo).toHaveBeenCalledWith("Gym", "18:00"));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Mark "Call Mom" done'));
    });
    expect(setTodoDone).toHaveBeenCalledWith(9, true);
  });
});

describe("routine helpers", () => {
  it("parses stored actions defensively", () => {
    expect(parseActions("not json")).toEqual([]);
    expect(
      parseActions(JSON.stringify([{ type: "open", target: "x.exe" }, { type: "open", target: "" }, { type: "notify", text: "hi" }, { type: "bad" }])),
    ).toEqual([
      { type: "open", target: "x.exe", label: undefined },
      { type: "notify", text: "hi" },
    ]);
  });

  it("summarises what a routine does", () => {
    expect(
      summariseActions([
        { type: "open", target: "C:\\Program Files\\Unity\\Unity.exe" },
        { type: "open", target: "https://www.youtube.com/results?q=spaghetti" },
        { type: "notify", text: "Go!" },
      ]),
    ).toBe("Opens Unity, youtube.com · shows a message");
    expect(summariseActions([])).toBe("Does nothing yet");
  });

  it("labels targets nicely", () => {
    expect(targetLabel("/Applications/Spotify.app")).toBe("Spotify");
    expect(targetLabel("C:\\Users\\me\\Notes\\plan.txt")).toBe("plan.txt");
    expect(targetLabel("https://www.amazon.com.au/s?k=gift+wrap")).toBe("amazon.com.au");
  });
});
