#!/usr/bin/env node

/**
 * examples/high-level.mjs
 *
 * Demonstrates the high-level API: compile a story with a single function call.
 *
 * Usage:
 *   node examples/high-level.mjs
 *
 * The compiled .gblorb is written to examples/output/high-level.gblorb.
 */

import { compile, parseVirtualFS } from "../packages/inform7-wasm/dist/index.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = [
  '"High-Level Demo" by Example',
  "",
  'The Laboratory is a room. "A cluttered laboratory filled with bubbling beakers and humming machines."',
  "",
  'The mysterious crystal is in the Laboratory. "A glowing crystal pulses with an inner light."',
  'The description of the crystal is "It radiates a warm, pulsating glow."',
  "",
  "Instead of taking the crystal:",
  '  say "As you reach for it, the crystal flares brightly and you pull your hand back.";',
  "",
  "The brass key is in the Laboratory.",
  "",
  "The Storage Room is west of the Laboratory.",
  "",
  'Test me with "look / examine crystal / take crystal / go west".',
].join("\n");

// ── Compile ──────────────────────────────────────────────────────────────

console.log("=== High-Level API Demo ===\n");

const pkgDir = new URL("../packages/inform7-wasm/", import.meta.url);

const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile(new URL("assets/inform7.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inform6.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inblorb.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inform7-internal.data", pkgDir)).then(parseVirtualFS),
]);

console.log("Compiling...");
const result = await compile({
  source,
  wasm: { inform7, inform6, inblorb },
  inform7Internal,
  onProgress: console.log,
});

// ── Write output ─────────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, "output");
await mkdir(outDir, { recursive: true });

if (result.output.gblorb) {
  const outPath = path.join(outDir, "high-level.gblorb");
  await writeFile(outPath, result.output.gblorb);
  const kb = (result.output.gblorb.byteLength / 1024).toFixed(1);
  console.log(`\n✅ Wrote ${kb} KB → ${outPath}`);
}

if (result.output.ulx) {
  const kb = (result.output.ulx.byteLength / 1024).toFixed(1);
  console.log(`   (${kb} KB ulx also available)`);
}

if (result.output.inf) {
  const kb = (result.output.inf.byteLength / 1024).toFixed(1);
  console.log(`   (${kb} KB I6 source also available)`);
}

console.log("\nDone! Upload the .gblorb to https://iplayif.com to play.");
