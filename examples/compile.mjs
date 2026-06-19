#!/usr/bin/env node
/**
 * compile.mjs — Compile an Inform 7 story to a playable .gblorb file
 *                using pure WASM binaries via Node.js WASI.
 *
 * Usage:
 *   node compile.mjs [project-dir]
 *
 * If no project directory is given, compiles the example story at
 * examples/hello/.
 *
 * Requires: Node.js 20+ (with --experimental-wasi-unstable-preview1
 *           on older versions; Node.js 22+ works out of the box).
 *
 * The project directory must contain Source/story.ni.
 */

import { WASI } from "node:wasi";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Resolve paths ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, "..", "build");
const INTERNAL_DIR = path.resolve(BUILD_DIR, "Internal");
const EXTENSIONS_DIR = path.resolve(__dirname, "extensions");

const INFORM7_WASM = path.resolve(BUILD_DIR, "inform7.wasm");
const INFORM6_WASM = path.resolve(BUILD_DIR, "inform6.wasm");
const INBLORB_WASM = path.resolve(BUILD_DIR, "inblorb.wasm");

// ── Determine project directory ────────────────────────────────────────────

let projectDir;
if (process.argv[2]) {
  projectDir = path.resolve(process.argv[2]);
} else {
  projectDir = path.resolve(__dirname, "hello");
}

const storyFile = path.join(projectDir, "Source", "story.ni");
if (!fs.existsSync(storyFile)) {
  console.error(`Error: ${storyFile} not found`);
  console.error(`Usage: node compile.mjs [project-dir]`);
  process.exit(1);
}

const projectParent = path.dirname(projectDir);
const projectLeaf = path.basename(projectDir);

// Ensure extensions directory exists (even if empty)
fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });

// ── WASI runner helper ────────────────────────────────────────────────────

async function runWasi(wasmPath, args, preopens, env) {
  const wasi = new WASI({
    version: "preview1",
    args: [path.basename(wasmPath), ...args],
    env: { ...env },
    preopens: { ...preopens },
    stdin: 0,
    stdout: 1,
    stderr: 2,
  });

  const wasmBuffer = fs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  const instance = await WebAssembly.instantiate(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  await wasi.start(instance);
}

// ── Build preopens ─────────────────────────────────────────────────────────

// Helper: only add preopens for directories that actually exist.
function preopen(virtualPath, realPath) {
  if (fs.existsSync(realPath)) {
    return { [virtualPath]: realPath };
  }
  return {};
}

// The project directory and its parent need to be accessible at their real
// paths so that inform7 can create .materials alongside the project.
const commonPreopens = {
  ...preopen(projectDir, projectDir),
  ...preopen(projectParent, projectParent),
};

const internalPreopens = preopen("/inform7/Internal", INTERNAL_DIR);
const extensionsPreopens = preopen("/extensions", EXTENSIONS_DIR);

// ── Step 1: .ni → .i6 (inform7) ───────────────────────────────────────────

console.log("=== Inform 7 WASM Toolchain (Node.js) ===");
console.log(`Project: ${projectDir}\n`);

console.log("--- Step 1/3: Compiling source to I6 (inform7) ---");
try {
  await runWasi(
    INFORM7_WASM,
    [
      "-project", projectDir,
      "-internal", "/inform7/Internal",
      "-external", "/extensions",
    ],
    { ...commonPreopens, ...internalPreopens, ...extensionsPreopens },
    { INFORM7_PATH: "/inform7/Internal" },
  );
} catch (err) {
  // inform7 may exit via proc_exit on success; catch and continue
  if (!err.message?.includes("exit")) throw err;
}

const autoInf = path.join(projectDir, "Build", "auto.inf");
if (!fs.existsSync(autoInf)) {
  console.error("Error: inform7 failed to produce auto.inf");
  process.exit(1);
}
const autoInfSize = fs.statSync(autoInf).size;
console.log(`  -> ${(autoInfSize / 1024).toFixed(1)} KB I6 source generated\n`);

// ── Step 2: .i6 → .ulx (inform6) ──────────────────────────────────────────

console.log("--- Step 2/3: Compiling I6 to Glulx (inform6) ---");
try {
  await runWasi(
    INFORM6_WASM,
    [
      "-E2SwG",
      path.join(projectDir, "Build", "auto.inf"),
      path.join(projectDir, "Build", "output.ulx"),
    ],
    { ...commonPreopens },
    {},
  );
} catch (err) {
  if (!err.message?.includes("exit")) throw err;
}

const outputUlx = path.join(projectDir, "Build", "output.ulx");
if (!fs.existsSync(outputUlx)) {
  console.error("Error: inform6 failed to produce output.ulx");
  process.exit(1);
}
const ulxSize = fs.statSync(outputUlx).size;
console.log(`  -> ${(ulxSize / 1024).toFixed(1)} KB Glulx story file\n`);

// ── Step 3: .ulx → .gblorb (inblorb) ──────────────────────────────────────

console.log("--- Step 3/3: Packaging to blorb (inblorb) ---");
try {
  await runWasi(
    INBLORB_WASM,
    ["-project", projectDir],
    { ...commonPreopens, ...internalPreopens },
    { INFORM7_PATH: "/inform7/Internal" },
  );
} catch (err) {
  if (!err.message?.includes("exit")) throw err;
}

// inblorb writes to Build/output.zblorb; copy to .gblorb
const zblorbPath = path.join(projectDir, "Build", "output.zblorb");
const gblorbPath = path.join(projectDir, "Build", "story.gblorb");
if (fs.existsSync(zblorbPath)) {
  fs.copyFileSync(zblorbPath, gblorbPath);
  const gblorbSize = fs.statSync(gblorbPath).size;
  console.log(`  -> ${(gblorbSize / 1024).toFixed(1)} KB blorb file`);
}

// ── Done ───────────────────────────────────────────────────────────────────

console.log("\n=== Done ===");
console.log(`Output files in ${path.join(projectDir, "Build")}:`);
for (const name of ["output.ulx", "story.gblorb", "auto.inf"]) {
  const p = path.join(projectDir, "Build", name);
  if (fs.existsSync(p)) {
    const size = fs.statSync(p).size;
    console.log(`  ${name}  ${(size / 1024).toFixed(1)} KB`);
  }
}
