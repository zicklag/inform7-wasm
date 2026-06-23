#!/usr/bin/env node

/**
 * examples/low-level.mjs
 *
 * Demonstrates the low-level API: run each inform binary step by step with
 * completely custom WASI args and a hand-crafted virtual filesystem.
 *
 * Usage:
 *   node examples/low-level.mjs
 *
 * The compiled .gblorb is written to examples/output/low-level.gblorb.
 */

import { runWasi, parseInternalData } from "../packages/inform7-wasm/dist/index.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = [
  '"Low-Level Demo" by Example',
  "",
  'The Meadow is a room. "A sunlit meadow with wildflowers swaying in the breeze."',
  "",
  'The wooden bridge is a thing in the Meadow. "A small wooden bridge crosses the babbling brook."',
  'The description of the bridge is "It\'s old but sturdy, worn smooth by countless crossings."',
  "",
  'Test me with "look / examine bridge".',
].join("\n");

// ── Load assets ──────────────────────────────────────────────────────────

console.log("=== Low-Level API Demo ===\n");

const pkgDir = new URL("../packages/inform7-wasm/", import.meta.url);

console.log("Loading WASM binaries and Internal resources...");

const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile(new URL("assets/inform7.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inform6.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inblorb.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/internal.data", pkgDir)).then(parseInternalData),
]);

const encoder = new TextEncoder();

let virtualFs = {
  ...inform7Internal,
  "/my-project/Source/story.ni": encoder.encode(source),
  "/my-project/Build/.empty": new Uint8Array(0),
};

// ── Step 1: .ni → .i6 (inform7) ──────────────────────────────────────────

console.log("--- Step 1/3: inform7 (.ni → .i6) ---");
console.log("  Args: -project /my-project -internal /inform7/Internal");

const afterInform7 = await runWasi(inform7, {
  args: ["inform7.wasm", "-project", "/my-project", "-internal", "/inform7/Internal"],
  virtualFs,
});

const autoInf = afterInform7["/my-project/Build/auto.inf"];
if (!autoInf) {
  console.error("❌ inform7 failed to produce auto.inf");
  process.exit(1);
}
console.log(`  ✅ Produced auto.inf (${(autoInf.byteLength / 1024).toFixed(1)} KB)\n`);

// ── Step 2: .i6 → .ulx (inform6) ─────────────────────────────────────────

console.log("--- Step 2/3: inform6 (.i6 → .ulx) ---");
console.log("  Args: -E2SwG /my-project/Build/auto.inf /my-project/Build/output.ulx");

Object.assign(virtualFs, afterInform7);

const afterInform6 = await runWasi(inform6, {
  args: ["inform6.wasm", "-E2SwG", "/my-project/Build/auto.inf", "/my-project/Build/output.ulx"],
  virtualFs,
});

const outputUlx = afterInform6["/my-project/Build/output.ulx"];
if (!outputUlx) {
  console.error("❌ inform6 failed to produce output.ulx");
  process.exit(1);
}
console.log(`  ✅ Produced output.ulx (${(outputUlx.byteLength / 1024).toFixed(1)} KB)\n`);

// ── Step 3: .ulx → .gblorb (inblorb) ─────────────────────────────────────

console.log("--- Step 3/3: inblorb (.ulx → .gblorb) ---");
console.log("  Args: -project /my-project");

Object.assign(virtualFs, afterInform6);

const afterInblorb = await runWasi(inblorb, {
  args: ["inblorb.wasm", "-project", "/my-project"],
  virtualFs,
});

const outputGblorb = afterInblorb["/my-project/Build/output.zblorb"];
if (!outputGblorb) {
  console.error("❌ inblorb failed to produce output.zblorb");
  process.exit(1);
}
console.log(`  ✅ Produced output.zblorb (${(outputGblorb.byteLength / 1024).toFixed(1)} KB)\n`);

// ── Write output ─────────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, "output");
await mkdir(outDir, { recursive: true });

const gblorbPath = path.join(outDir, "low-level.gblorb");
await writeFile(gblorbPath, outputGblorb);
console.log(`✅ Wrote ${(outputGblorb.byteLength / 1024).toFixed(1)} KB → ${gblorbPath}`);
console.log("Done! Upload the .gblorb to https://iplayif.com to play.");
