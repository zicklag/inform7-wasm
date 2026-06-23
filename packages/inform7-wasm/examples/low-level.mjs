#!/usr/bin/env node

/**
 * examples/low-level.mjs
 *
 * Demonstrates the low-level API: run each inform binary step by step with
 * a custom virtual filesystem.
 *
 * Usage:
 *   node examples/low-level.mjs
 *
 * The compiled .gblorb is written to examples/output/low-level.gblorb.
 */

import { runWasi, parseVirtualFS } from "../dist/index.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = new URL("../", import.meta.url);

// ── Load assets ──────────────────────────────────────────────────────────

const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile(new URL("assets/inform7.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inform6.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inblorb.wasm", pkgDir)).then(WebAssembly.compile),
  readFile(new URL("assets/inform7-internal.data", pkgDir)).then(parseVirtualFS),
]);

// ── Build virtual filesystem ─────────────────────────────────────────────

const encoder = new TextEncoder();
const source = `"Low-Level Demo" by Example

The Meadow is a room. "A sunlit meadow."

The wooden bridge is in the Meadow.`;

let fs = {
  ...inform7Internal,
  "/my-project/Source/story.ni": encoder.encode(source),
};

// ── Step 1: .ni → .i6 (inform7) ─────────────────────────────────────────

fs = await runWasi(inform7, {
  args: ["inform7.wasm", "-project", "/my-project", "-internal", "/inform7/Internal"],
  virtualFs: fs,
});

// const autoInf = fs["/my-project/Build/auto.inf"];

// ── Step 2: .i6 → .ulx (inform6) ─────────────────────────────────────────

fs = await runWasi(inform6, {
  args: ["inform6.wasm", "-E2SwG", "/my-project/Build/auto.inf", "/my-project/Build/output.ulx"],
  virtualFs: fs,
});

// const outputUlx = fs["/my-project/Build/output.ulx"];

// ── Step 3: .ulx → .gblorb (inblorb) ─────────────────────────────────────

fs = await runWasi(inblorb, {
  args: ["inblorb.wasm", "-project", "/my-project"],
  virtualFs: fs,
});

const outputGblorb = fs["/my-project/Build/output.zblorb"];

// ── Write output ─────────────────────────────────────────────────────────

await mkdir(path.resolve(__dirname, "output"), { recursive: true });
await writeFile(path.resolve(__dirname, "output", "low-level.gblorb"), outputGblorb);
