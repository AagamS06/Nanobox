import type { BlockProgram, BlockNode, BlockDef, ExecutionContext, EvalResult, ExecutionBridge } from "./types";
import { NULL_BRIDGE } from "./types";
import { CUSTOM_DEF_PREFIX, getCustomBlockEvaluator } from "./customBlockRegistry";

const MAX_EXECUTION_DEPTH = 100;
const DEFAULT_BLOCK_DEFS = new Map<string, BlockDef>();

/**
 * Register a block definition so it can be used in programs.
 */
export function registerBlockDef(def: BlockDef) {
  DEFAULT_BLOCK_DEFS.set(def.id, def);
}

/** Read-only view of every registered block definition, keyed by def id. */
export function getBlockDefs(): Map<string, BlockDef> {
  return DEFAULT_BLOCK_DEFS;
}

/**
 * Validate a block program for correctness.
 * - All referenced blocks exist
 * - All edges connect valid ports
 * - No type mismatches on connections
 * - Root node exists
 */
export function validateProgram(program: BlockProgram): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!program.nodes.find((n) => n.id === program.rootNodeId)) {
    errors.push(`Root node "${program.rootNodeId}" not found`);
  }

  program.nodes.forEach((node) => {
    const def = DEFAULT_BLOCK_DEFS.get(node.defId);
    if (!def) {
      errors.push(`Block definition "${node.defId}" not registered (used by node "${node.id}")`);
    }
  });

  program.edges.forEach((edge) => {
    const fromNode = program.nodes.find((n) => n.id === edge.from.nodeId);
    const toNode = program.nodes.find((n) => n.id === edge.to.nodeId);

    if (!fromNode) {
      errors.push(`Edge source node "${edge.from.nodeId}" not found`);
      return;
    }
    if (!toNode) {
      errors.push(`Edge target node "${edge.to.nodeId}" not found`);
      return;
    }

    const fromDef = DEFAULT_BLOCK_DEFS.get(fromNode.defId);
    const toDef = DEFAULT_BLOCK_DEFS.get(toNode.defId);

    if (!fromDef || !toDef) return; // Already reported above

    const fromPort = fromDef.outputs.find((p) => p.id === edge.from.portId);
    const toPort = toDef.inputs.find((p) => p.id === edge.to.portId);

    if (!fromPort) {
      errors.push(`Output port "${edge.from.portId}" not found on block "${fromDef.id}"`);
    }
    if (!toPort) {
      errors.push(`Input port "${edge.to.portId}" not found on block "${toDef.id}"`);
    }

    // Type checking (if not "any")
    if (fromPort && toPort && fromPort.type !== "any" && toPort.type !== "any") {
      if (fromPort.type !== toPort.type) {
        errors.push(
          `Type mismatch on edge: "${fromPort.type}" (${fromNode.id}.${edge.from.portId}) ` +
            `-> "${toPort.type}" (${toNode.id}.${edge.to.portId})`
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate a block program by traversing the AST and executing blocks.
 * Returns the final result from the root node.
 */
export async function evaluateProgram(program: BlockProgram, bridge: ExecutionBridge = NULL_BRIDGE): Promise<EvalResult> {
  const validation = validateProgram(program);
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid program: ${validation.errors.join("; ")}`,
    };
  }

  const rootNode = program.nodes.find((n) => n.id === program.rootNodeId);
  if (!rootNode) {
    return { success: false, error: "Root node not found" };
  }

  const context: ExecutionContext = {
    program,
    definitions: DEFAULT_BLOCK_DEFS,
    nodeValues: new Map(),
    depth: 0,
    maxDepth: MAX_EXECUTION_DEPTH,
    bridge,
  };

  return evaluateNode(rootNode, context);
}

/**
 * Evaluate a single block node and its dependencies.
 * Recursively evaluates input nodes first.
 */
export async function evaluateNode(node: BlockNode, context: ExecutionContext): Promise<EvalResult> {
  if (context.depth > (context.maxDepth ?? MAX_EXECUTION_DEPTH)) {
    return {
      success: false,
      error: "Max execution depth exceeded (infinite loop?)",
    };
  }

  // Return cached result if already evaluated
  const cached = context.nodeValues.get(node.id);
  if (cached) return cached;

  const blockDef = context.definitions.get(node.defId);
  if (!blockDef) {
    return { success: false, error: `Block definition "${node.defId}" not found` };
  }

  // Evaluate all input edges first
  const inputValues: Record<string, any> = {};

  const incomingEdges = context.program.edges.filter((e) => e.to.nodeId === node.id);

  for (const edge of incomingEdges) {
    const sourceNode = context.program.nodes.find((n) => n.id === edge.from.nodeId);
    if (!sourceNode) continue;

    context.depth++;
    const sourceResult = await evaluateNode(sourceNode, context);
    context.depth--;

    if (!sourceResult.success) {
      return { success: false, error: `Failed to evaluate upstream node: ${sourceResult.error}` };
    }

    // Get the output value from source port
    const sourcePort = blockDef.inputs.find((p) => p.id === edge.to.portId);
    if (sourcePort) {
      inputValues[edge.to.portId] =
        sourceResult.outputPortValues?.[edge.from.portId] ?? sourceResult.value;
    }
  }

  // Add default values for unconnected inputs
  blockDef.inputs.forEach((port) => {
    if (!(port.id in inputValues) && port.defaultValue !== undefined) {
      inputValues[port.id] = port.defaultValue;
    }
  });

  // Execute the block (defined by block library)
  const result = await executeBlock(blockDef, node, inputValues, context.bridge);
  context.nodeValues.set(node.id, result);

  return result;
}

const ok = (outputPortValues: Record<string, any>, value?: any): EvalResult => ({
  success: true,
  value,
  outputPortValues,
});

const fail = (error: string): EvalResult => ({ success: false, error });

const asNumber = (v: any): number => (typeof v === "number" ? v : Number(v) || 0);
const asString = (v: any): string => (v === undefined || v === null ? "" : String(v));
const asBool = (v: any): boolean => Boolean(v);

function compare(op: string, a: any, b: any): boolean {
  switch (op) {
    case "!=":
      return a !== b;
    case "<":
      return asNumber(a) < asNumber(b);
    case ">":
      return asNumber(a) > asNumber(b);
    case "<=":
      return asNumber(a) <= asNumber(b);
    case ">=":
      return asNumber(a) >= asNumber(b);
    case "==":
    default:
      return a === b;
  }
}

function mathOp(op: string, a: number, b: number): number {
  switch (op) {
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? NaN : a / b;
    case "%":
      return b === 0 ? NaN : a % b;
    case "+":
    default:
      return a + b;
  }
}

/** `{0}`/`{1}`/... placeholders substituted from `values` by index. */
function formatTemplate(template: string, values: any[]): string {
  return template.replace(/\{(\d+)\}/g, (_match, index) => asString(values[Number(index)]));
}

const DATE_TOKENS: Array<[RegExp, (d: Date) => string]> = [
  [/YYYY/g, (d) => String(d.getFullYear())],
  [/MM/g, (d) => String(d.getMonth() + 1).padStart(2, "0")],
  [/DD/g, (d) => String(d.getDate()).padStart(2, "0")],
  [/HH/g, (d) => String(d.getHours()).padStart(2, "0")],
  [/mm/g, (d) => String(d.getMinutes()).padStart(2, "0")],
  [/ss/g, (d) => String(d.getSeconds()).padStart(2, "0")],
];

function formatDate(dateStr: string, format: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_TOKENS.reduce((out, [pattern, render]) => out.replace(pattern, render(date)), format);
}

/**
 * Execute a single block. Pure/computational blocks (display, logic,
 * transform, GetCurrentTime) run directly. Blocks that touch live app
 * state or the OS (Data/Action, plus the two non-timer triggers) go
 * through `bridge` so this function has no direct Tauri/DB dependency and
 * stays testable — a bridge-less call degrades to "no data"/failure
 * rather than throwing.
 */
async function executeBlock(
  def: BlockDef,
  node: BlockNode,
  inputs: Record<string, any>,
  bridge: ExecutionBridge
): Promise<EvalResult> {
  // User-authored blocks aren't in the switch below — their body lives in
  // SQLite and is compiled on load. See customBlockLoader for the sandboxing
  // caveats.
  if (def.id.startsWith(CUSTOM_DEF_PREFIX)) {
    const run = getCustomBlockEvaluator(def.id);
    if (!run) return fail(`Custom block "${def.id}" has no compiled body`);
    try {
      const value = await run(inputs);
      const firstOutput = def.outputs[0]?.id;
      return ok(firstOutput ? { [firstOutput]: value } : {}, value);
    } catch (err) {
      return fail(`Custom block "${def.label}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  switch (def.id) {
    // ---- Triggers (pull-based snapshot of current state, not a live push) ----
    case "trigger/on-timer":
      return ok({ tick: Date.now() }, Date.now());
    case "trigger/on-calendar-event": {
      const event = (await bridge.getNextCalendarEvent?.()) ?? null;
      return ok({ event, title: event?.title ?? "" }, event);
    }
    case "trigger/on-music-change": {
      const track = (await bridge.getNowPlaying?.()) ?? null;
      return ok({ track, artist: track?.artist ?? "" }, track);
    }

    // ---- Display (passthrough / normalize) ----
    case "display/show-text":
      return ok({ out: asString(inputs.text) }, asString(inputs.text));
    case "display/show-number":
      return ok({ out: asNumber(inputs.value) }, asNumber(inputs.value));
    case "display/show-image":
      return ok({ out: asString(inputs.url) }, asString(inputs.url));
    case "display/progress-bar": {
      const pct = Math.min(100, Math.max(0, asNumber(inputs.value)));
      return ok({ out: pct }, pct);
    }

    // ---- Logic ----
    case "logic/if-else": {
      const cond = asBool(inputs.condition);
      return ok({ true: cond ? cond : undefined, false: cond ? undefined : true }, cond);
    }
    case "logic/compare": {
      const op = node.config?.operator ?? "==";
      const result = compare(op, inputs.a, inputs.b);
      return ok({ result }, result);
    }
    case "logic/boolean-and": {
      const result = asBool(inputs.a) && asBool(inputs.b);
      return ok({ result }, result);
    }
    case "logic/boolean-or": {
      const result = asBool(inputs.a) || asBool(inputs.b);
      return ok({ result }, result);
    }

    // ---- Data ----
    case "data/get-current-time": {
      const time = new Date().toISOString();
      return ok({ time }, time);
    }
    case "data/get-now-playing": {
      const nowPlaying = (await bridge.getNowPlaying?.()) ?? null;
      return ok(
        { track: nowPlaying, artist: nowPlaying?.artist ?? "", album: nowPlaying?.album ?? "" },
        nowPlaying
      );
    }
    case "data/get-note": {
      if (!bridge.getNote) return fail("No note storage bridge configured");
      const content = await bridge.getNote(asString(inputs.noteId));
      return ok({ content: content ?? "" }, content);
    }

    // ---- Actions ----
    case "action/play-sound": {
      if (!bridge.playSound) return fail("No sound bridge configured");
      await bridge.playSound(asString(inputs.file));
      return ok({ done: true }, true);
    }
    case "action/send-notification": {
      if (!bridge.sendNotification) return fail("No notification bridge configured");
      await bridge.sendNotification(asString(inputs.title), asString(inputs.body));
      return ok({ done: true }, true);
    }
    case "action/open-app": {
      if (!bridge.openApp) return fail("No app-launch bridge configured");
      await bridge.openApp(asString(inputs.appPath));
      return ok({ done: true }, true);
    }
    case "action/set-alarm": {
      if (!bridge.setAlarm) return fail("No alarm bridge configured");
      await bridge.setAlarm(asString(inputs.time), asString(inputs.label));
      return ok({ done: true }, true);
    }

    // ---- Transform ----
    case "transform/format-text": {
      const result = formatTemplate(asString(inputs.template), Array.isArray(inputs.values) ? inputs.values : []);
      return ok({ result }, result);
    }
    case "transform/math-op": {
      const op = node.config?.operator ?? "+";
      const result = mathOp(op, asNumber(inputs.a), asNumber(inputs.b));
      return ok({ result }, result);
    }
    case "transform/date-format": {
      const result = formatDate(asString(inputs.date), asString(inputs.format));
      return ok({ result }, result);
    }
    case "transform/join-strings": {
      const arr = Array.isArray(inputs.array) ? inputs.array : [];
      const result = arr.map(asString).join(asString(inputs.separator ?? ","));
      return ok({ result }, result);
    }

    default:
      return fail(`No execution handler for block "${def.id}"`);
  }
}

/**
 * Get all blocks that depend on a given node.
 * Useful for invalidating cache when a node changes.
 */
export function getDependents(nodeId: string, program: BlockProgram): BlockNode[] {
  const dependentIds = new Set<string>();

  const collect = (id: string) => {
    const edges = program.edges.filter((e) => e.from.nodeId === id);
    edges.forEach((e) => {
      if (!dependentIds.has(e.to.nodeId)) {
        dependentIds.add(e.to.nodeId);
        collect(e.to.nodeId);
      }
    });
  };

  collect(nodeId);
  return program.nodes.filter((n) => dependentIds.has(n.id));
}
