/**
 * Helpers for loading the Internal resource directory into a virtual
 * filesystem. Works on all platforms (Node.js, Deno, browser).
 *
 * Gzip decompression uses the native DecompressionStream API, available
 * in Node.js 20+, Deno, and all modern browsers.
 */

import { isNode } from "./runtime.js";

/**
 * Load the Internal resource directory from a URL.
 *
 * Accepts either the raw `internal.json` or the gzipped `internal.json.gz`.
 * If the URL ends with `.gz`, the response is decompressed natively.
 *
 * Generate the manifest with:
 *   node scripts/generate-internal-json.mjs
 *
 * @param url URL to internal.json or internal.json.gz
 * @returns A flat path→Uint8Array map suitable for `virtualInternal`
 */
export async function loadInternalFromUrl(
  url: string | URL,
): Promise<Record<string, Uint8Array>> {
  const urlStr = typeof url === "string" ? url : url.toString();

  if (isNode) {
    return loadInternalFromNode(urlStr);
  }

  // Browser / Deno
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load internal manifest: ${response.status} ${response.statusText}`,
    );
  }
  if (urlStr.endsWith(".gz")) {
    return loadInternalFromGzipResponse(response);
  }
  return decodeManifest(await response.json());
}

/**
 * Load the Internal resource directory from a fetch Response (browser/Deno).
 */
export async function loadInternalFromResponse(
  response: Response,
): Promise<Record<string, Uint8Array>> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("gzip") || response.url.endsWith(".gz")) {
    return loadInternalFromGzipResponse(response);
  }
  return decodeManifest(await response.json());
}

/**
 * Load the Internal resource directory from the package's bundled
 * `internal.json.gz` file.
 *
 * This is the easiest way to get the virtual filesystem:
 *
 * ```ts
 * import { compile, loadInternalFromPackage } from "inform7-wasm";
 *
 * const virtualInternal = await loadInternalFromPackage();
 * const result = await compile({ source: storyText, virtualInternal });
 * ```
 */
export async function loadInternalFromPackage(): Promise<
  Record<string, Uint8Array>
> {
  const url = new URL("../internal.json.gz", import.meta.url);
  return loadInternalFromUrl(url);
}

/**
 * Create a virtual project filesystem.
 *
 * @param source The Inform 7 source text
 * @returns A flat path→Uint8Array map for the project directory
 */
export function createVirtualProject(
  source: string,
): Record<string, Uint8Array> {
  const encoder = new TextEncoder();
  return {
    "/story/Source/story.ni": encoder.encode(source),
  };
}

// ── Internal helpers ────────────────────────────────────────────────────

async function loadInternalFromNode(
  filePath: string,
): Promise<Record<string, Uint8Array>> {
  const fs = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");

  // Convert file:// URL to a regular path if needed
  const resolvedPath = filePath.startsWith("file://")
    ? fileURLToPath(filePath)
    : filePath;

  const buffer = await fs.readFile(resolvedPath);

  let json: string;
  if (filePath.endsWith(".gz")) {
    // Use DecompressionStream (available in Node.js 20+)
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(buffer);
    writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    json = new TextDecoder().decode(result);
  } else {
    json = new TextDecoder().decode(buffer);
  }

  return decodeManifest(JSON.parse(json));
}

async function loadInternalFromGzipResponse(
  response: Response,
): Promise<Record<string, Uint8Array>> {
  if (!response.body) {
    throw new Error("Response body is null, cannot decompress");
  }
  const stream = response.body.pipeThrough(
    new DecompressionStream("gzip"),
  );
  return decodeManifest(await new Response(stream).json());
}

function decodeManifest(
  manifest: InternalManifest,
): Record<string, Uint8Array> {
  if (manifest.version !== 1) {
    throw new Error(`Unknown internal manifest version: ${manifest.version}`);
  }
  const files: Record<string, Uint8Array> = {};
  for (const entry of manifest.files) {
    files[`/inform7/Internal${entry.path}`] = Uint8Array.from(
      atob(entry.data),
      (c) => c.charCodeAt(0),
    );
  }
  return files;
}

interface InternalManifest {
  version: number;
  generated: string;
  files: Array<{
    path: string;
    data: string;
  }>;
}
