#!/usr/bin/env node
/**
 * generate-inform7-internal.mjs
 *
 * Reads the assets/inform7-internal/ directory and generates a
 * length-prefixed binary blob (assets/inform7-internal.data).
 *
 * Format: [pathLen:4][contentLen:4][path:pathLen][content:contentLen] repeated
 *
 * The resulting file can be loaded with parseVirtualFS() — the caller
 * is responsible for prefixing paths with /inform7/Internal when
 * building the VirtualFS for compilation.
 *
 * Usage: node scripts/generate-inform7-internal.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const internalDir = path.join(packageRoot, "..", "..", "build", "Internal");

function walkDir(dir, basePath = "") {
  const entries = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      Object.assign(entries, walkDir(fullPath, relativePath));
    } else if (entry.isFile()) {
      entries[`/inform7/Internal/${relativePath}`] = fs.readFileSync(fullPath);
    }
  }
  return entries;
}

console.log("Scanning assets/inform7-internal/ directory...");
const files = walkDir(internalDir);
console.log(`Found ${Object.keys(files).length} files`);

const { encodeVirtualFS } = await import("../dist/index.js");
const blob = encodeVirtualFS(files);

console.log(`Raw blob: ${(blob.length / 1024 / 1024).toFixed(1)} MB`);

// Write raw binary (no gzip — let the host/server handle compression)
const outPath = path.join(packageRoot, "assets", "inform7-internal.data");
fs.writeFileSync(outPath, blob);
console.log(`Written: ${outPath} (${(blob.length / 1024 / 1024).toFixed(1)} MB)`);
