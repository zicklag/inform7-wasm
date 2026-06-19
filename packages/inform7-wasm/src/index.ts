/**
 * inform7-wasm — Compile Inform 7 stories to playable .gblorb files
 * using pure WASM modules, entirely in-memory via a virtual filesystem.
 *
 * Works identically on Node.js, Deno, and the browser.
 *
 * @example
 * ```typescript
 * import { compile, loadInternalFromPackage } from "inform7-wasm";
 *
 * const virtualInternal = await loadInternalFromPackage();
 *
 * const result = await compile({
 *   source: `"Hello World" by Example
 * The Starting Room is a room. "A simple room."
 * The player is in the Starting Room.`,
 *   virtualInternal,
 * });
 *
 * // result.output.gblorb is a Uint8Array of the playable file
 * ```
 */

export { compile } from "./pipeline.js";
export {
  loadInternalFromUrl,
  loadInternalFromResponse,
  loadInternalFromPackage,
  createVirtualProject,
} from "./browser.js";
export type { CompileOptions, CompileResult } from "./types.js";
