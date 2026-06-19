#!/usr/bin/env node
/**
 * generate-internal-json.mjs
 *
 * Reads the internal/ directory and generates a JSON manifest with all file
 * contents base64-encoded, plus a gzip-compressed copy.
 *
 * The browser can load the gzipped version (~5 MB) and decompress it natively
 * using DecompressionStream, avoiding the 15.6 MB raw JSON download.
 *
 * Usage: node scripts/generate-internal-json.mjs
 *
 * Output:
 *   internal.json      — raw JSON (15.6 MB)
 *   internal.json.gz   — gzip compressed (5 MB)
 */

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const internalDir = path.join(packageRoot, "internal");

function walkDir(dir, basePath = "") {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath, relativePath));
    } else if (entry.isFile()) {
      const content = fs.readFileSync(fullPath);
      entries.push({
        path: `/${relativePath}`,
        data: content.toString("base64"),
      });
    }
  }
  return entries;
}

console.log("Scanning internal/ directory...");
const files = walkDir(internalDir);
console.log(`Found ${files.length} files`);

const manifest = {
  version: 1,
  generated: new Date().toISOString(),
  files,
};

const json = JSON.stringify(manifest);

// Write raw JSON
const jsonPath = path.join(packageRoot, "internal.json");
fs.writeFileSync(jsonPath, json);
const jsonSize = fs.statSync(jsonPath).size;
console.log(`Written: ${jsonPath} (${(jsonSize / 1024 / 1024).toFixed(1)} MB)`);

// Write gzip-compressed
const gzPath = path.join(packageRoot, "internal.json.gz");
const gzipped = zlib.gzipSync(json, { level: 9 });
fs.writeFileSync(gzPath, gzipped);
console.log(`Written: ${gzPath} (${(gzipped.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Compression ratio: ${(gzipped.length / jsonSize * 100).toFixed(1)}%`);
