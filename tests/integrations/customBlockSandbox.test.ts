import { afterEach, describe, expect, it, vi } from "vitest";
import { compileCustomBlockBody, runInWorker } from "../../src/integrations/blockEngine/customBlockRegistry";

type Reply = { ok: boolean; value?: unknown; error?: string } | null;

/** Stand-in for a Web Worker (jsdom has none): replies with `reply`, or never if null. */
function installFakeWorker(reply: Reply) {
  const instances: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    terminated = false;
    received: unknown = null;
    constructor() {
      instances.push(this);
    }
    postMessage(data: unknown) {
      this.received = data;
      if (reply) setTimeout(() => this.onmessage?.({ data: reply }), 0);
    }
    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake" });
  return instances;
}

describe("custom block sandbox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rejects a body that doesn't parse, without running anything", () => {
    expect(() => compileCustomBlockBody("return (")).toThrow(SyntaxError);
  });

  it("runs bodies in a worker and returns their value", async () => {
    const workers = installFakeWorker({ ok: true, value: 42 });
    const run = compileCustomBlockBody("return inputs.n * 2");
    await expect(run({ n: 21 })).resolves.toBe(42);
    expect(workers[0].received).toEqual({ body: "return inputs.n * 2", inputs: { n: 21 } });
    expect(workers[0].terminated).toBe(true);
  });

  it("passes errors thrown inside the body back out", async () => {
    installFakeWorker({ ok: false, error: "boom" });
    await expect(runInWorker("throw new Error('boom')", {})).rejects.toThrow("boom");
  });

  it("stops a runaway block after the time limit instead of hanging", async () => {
    vi.useFakeTimers();
    const workers = installFakeWorker(null); // never replies, like while(true){}
    const result = runInWorker("while (true) {}", {}, 2_000);
    const assertion = expect(result).rejects.toThrow("took longer than 2s and was stopped");
    await vi.advanceTimersByTimeAsync(2_001);
    await assertion;
    expect(workers[0].terminated).toBe(true);
  });

  it("falls back to running inline only where workers don't exist", async () => {
    const run = compileCustomBlockBody("return 'inline ' + inputs.x");
    await expect(run({ x: "ok" })).resolves.toBe("inline ok");
  });
});
