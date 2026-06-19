#!/usr/bin/env node

/**
 * Copy assets from the inform7-wasm package into the web-demo static directory.
 *
 * Copies:
 *   - Quixe/GlkOte interpreter files (for the IF player)
 *   - Internal resource manifest (uncompressed JSON)
 *   - WASM binaries (inform7, inform6, inblorb)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(PACKAGE_ROOT, "static", "interpreter");

// ── 1. Quixe/GlkOte interpreter files ──────────────────────────────────

const QUIXE_SRC = path.resolve(
  PACKAGE_ROOT,
  "..",
  "inform7-wasm",
  "internal",
  "Templates",
  "Quixe",
);

const INTERPRETER_FILES = [
  "glkote.min.js",
  "quixe.min.js",
  "glkote.css",
  "jquery-1.12.4.min.js",
  "dialog.css",
  "waiting.gif",
];

fs.mkdirSync(STATIC_DIR, { recursive: true });

for (const file of INTERPRETER_FILES) {
  const src = path.join(QUIXE_SRC, file);
  const dest = path.join(STATIC_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ interpreter/${file}`);
  } else {
    console.warn(`  ⚠ interpreter/${file} not found at ${src}`);
  }
}

// ── 2. Internal resource manifest (uncompressed) ───────────────────────

const INTERNAL_SRC = path.resolve(
  PACKAGE_ROOT,
  "..",
  "inform7-wasm",
  "internal.json",
);

const INTERNAL_DEST = path.join(
  PACKAGE_ROOT,
  "static",
  "inform7-internals.json",
);

if (fs.existsSync(INTERNAL_SRC)) {
  fs.copyFileSync(INTERNAL_SRC, INTERNAL_DEST);
  const size = (fs.statSync(INTERNAL_DEST).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ inform7-internals.json (${size} MB)`);
} else {
  console.warn(`  ⚠ internal.json not found at ${INTERNAL_SRC}`);
}

// ── 3. WASM binaries ────────────────────────────────────────────────────

const WASM_SRC = path.resolve(PACKAGE_ROOT, "..", "inform7-wasm", "wasm");
const WASM_DEST = PACKAGE_ROOT + "/static";

for (const file of ["inform7.wasm", "inform6.wasm", "inblorb.wasm"]) {
  const src = path.join(WASM_SRC, file);
  const dest = path.join(WASM_DEST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`  ✓ ${file} (${size} KB)`);
  } else {
    console.warn(`  ⚠ ${file} not found at ${src}`);
  }
}

console.log("\nDone — assets copied to static/");
