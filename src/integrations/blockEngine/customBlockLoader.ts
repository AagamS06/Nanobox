/**
 * Custom block definitions — user-authored blocks backed by a JS body.
 *
 * A row in `custom_block_defs` becomes two things at runtime: a `BlockDef`
 * registered with the evaluator (so it appears in the palette and passes
 * validation) and a compiled runner stored in `customBlockRegistry`, which the
 * evaluator consults for any def id under the `custom/` prefix.
 *
 * See `customBlockRegistry.ts` for the sandboxing caveats.
 */

import type { BlockDef, Port } from "./types";
import { registerBlockDef } from "./evaluator";
import { compileCustomBlockBody, setCustomBlockEvaluator } from "./customBlockRegistry";
import {
  listCustomBlockDefs,
  parsePorts,
  type CustomBlockDefRow,
  type CustomPortSpec,
} from "../../storage/customBlockDefs";

export {
  CUSTOM_DEF_PREFIX,
  MAX_JS_BODY_BYTES,
  compileCustomBlockBody,
  getCustomBlockEvaluator,
  isCustomDefId,
  unregisterCustomBlockEvaluator,
  type CustomBlockEvaluator,
} from "./customBlockRegistry";

function toPorts(specs: CustomPortSpec[], isInput: boolean): Port[] {
  return specs.map((spec) => ({
    id: spec.id,
    name: spec.name,
    type: spec.type,
    isInput,
  }));
}

/**
 * Builds a `BlockDef` from a stored row, registers it with the evaluator, and
 * compiles its body. Throws if the body doesn't parse — the caller decides how
 * loudly to report that.
 */
export function buildAndRegisterCustomBlockDef(row: CustomBlockDefRow): BlockDef {
  const def: BlockDef = {
    id: row.def_id,
    type: "transform",
    label: row.label,
    description: row.description,
    inputs: toPorts(parsePorts(row.inputs_json), true),
    outputs: toPorts(parsePorts(row.outputs_json), false),
    category: "Custom",
  };

  // Compile before registering so a syntax error leaves nothing half-registered.
  setCustomBlockEvaluator(row.def_id, compileCustomBlockBody(row.js_body));
  registerBlockDef(def);
  return def;
}

let initialLoad: Promise<unknown> | null = null;

/**
 * Loads custom blocks once per window, for code that runs programs outside
 * the Block Builder (the Block Widget). Without this, a widget using a custom
 * block failed with "not registered" after every restart until the Builder
 * happened to be opened. Retries next time if the load fails.
 */
export function ensureCustomBlockDefsLoaded(): Promise<unknown> {
  initialLoad ??= loadCustomBlockDefs().catch((err) => {
    initialLoad = null;
    throw err;
  });
  return initialLoad;
}

/**
 * Loads every stored custom block and registers it. One bad body doesn't stop
 * the rest — it's logged and skipped, so a single broken block can still be
 * opened and fixed in the creator.
 */
export async function loadCustomBlockDefs(): Promise<CustomBlockDefRow[]> {
  const rows = await listCustomBlockDefs();
  rows.forEach((row) => {
    try {
      buildAndRegisterCustomBlockDef(row);
    } catch (err) {
      console.error(`custom block "${row.def_id}" failed to compile`, err);
    }
  });
  return rows;
}
