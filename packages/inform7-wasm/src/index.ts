/**
 * inform7-wasm — Compile Inform 7 stories to playable .gblorb files
 * using pure WASM modules, entirely in-memory via a virtual filesystem.
 *
 * Works identically on Node.js, Deno, and the browser.
 */

// ── Low-level API ───────────────────────────────────────────────────────
// Run any inform binary with completely custom args and virtual filesystem.
export { runWasi } from "./wasi.js";
export type { WasiOptions } from "./wasi.js";

// ── High-level API ──────────────────────────────────────────────────────
// Convenience layer for the most common compilation needs.
export { compile } from "./pipeline.js";
export { parseVirtualFS, encodeVirtualFS, createVirtualProject, VirtualFS } from "./virtualfs.js";
export type { CompileOptions, CompileResult } from "./types.js";
