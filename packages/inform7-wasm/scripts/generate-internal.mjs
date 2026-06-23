#!/usr/bin/env node
/**
 * generate-internal.mjs
 *
 * Reads the assets/internal/ directory and generates a gzip-compressed
 * length-prefixed binary blob (assets/internal.data.gz).
 *
 * Format: [pathLen:4][path:pathLen][contentLen:4][content:contentLen] repeated
 *
 * The browser can load the gzipped version and decompress it natively using
 * DecompressionStream, then parse the flat binary format inline — no base64,
 * no JSON, no dependencies.
 *
 * Usage: node scripts/generate-internal.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const internalDir = path.join(packageRoot, "assets", "internal");

function walkDir(dir, basePath = "") {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath, relativePath));
    } else if (entry.isFile()) {
      entries.push({
        path: `/${relativePath}`,
        data: fs.readFileSync(fullPath),
      });
    }
  }
  return entries;
}

console.log("Scanning assets/internal/ directory...");
const files = walkDir(internalDir);
console.log(`Found ${files.length} files`);

// Build length-prefixed binary blob
const encoder = new TextEncoder();
const chunks = [];

for (const { path: filePath, data } of files) {
  const pathBytes = encoder.encode(filePath);

  // Each entry gets its own header — the chunks array stores references
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, pathBytes.length, true);
  view.setUint32(4, data.length, true);

  chunks.push(header, pathBytes, data);
}

const blob = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
let offset = 0;
for (const chunk of chunks) {
  blob.set(chunk, offset);
  offset += chunk.length;
}

console.log(`Raw blob: ${(blob.length / 1024 / 1024).toFixed(1)} MB`);

// Write raw binary (no gzip — let the host/server handle compression)
const outPath = path.join(packageRoot, "assets", "internal.data");
fs.writeFileSync(outPath, blob);
console.log(`Written: ${outPath} (${(blob.length / 1024 / 1024).toFixed(1)} MB)`);
