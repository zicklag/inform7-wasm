/**
 * WASI runner — uses @bjorn3/browser_wasi_shim on all platforms
 * (Node.js, Deno, and browser) so the compilation pipeline is always
 * backed by a virtual filesystem. No real filesystem access needed.
 */

import { isNode } from "./runtime.js";

export interface WasiOptions {
  args: string[];
  env: Record<string, string>;
  preopens: Record<string, string>;
}

/**
 * Load a WASM binary from a path, URL, or ArrayBuffer.
 *
 * In the browser and Deno, uses fetch(). In Node.js, uses fs.readFile()
 * because Node's fetch() doesn't support file:// URLs yet.
 */
export async function loadWasm(
  wasmPath: string | URL | ArrayBuffer,
): Promise<Uint8Array> {
  if (wasmPath instanceof ArrayBuffer) {
    return new Uint8Array(wasmPath);
  }
  if (isNode) {
    const fs = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const wasmStr = typeof wasmPath === "string" ? wasmPath : wasmPath.toString();
    const resolvedPath = wasmStr.startsWith("file://")
      ? fileURLToPath(wasmStr)
      : wasmStr;
    return await fs.readFile(resolvedPath);
  }
  // Browser / Deno
  const response = await fetch(wasmPath);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Run a WASM module with WASI using a virtual filesystem.
 *
 * @param wasmBytes  The compiled WASM binary
 * @param options    WASI args, env, and preopens
 * @param virtualFs  Initial filesystem state (path → content)
 * @returns          Filesystem state after execution (path → content)
 */
export async function runWasi(
  wasmBytes: Uint8Array,
  options: WasiOptions,
  virtualFs: Record<string, Uint8Array> = {},
): Promise<Record<string, Uint8Array>> {
  const {
    WASI,
    File,
    OpenFile,
    ConsoleStdout,
    PreopenDirectory,
    Directory,
  } = await import("@bjorn3/browser_wasi_shim");

  // stdin / stdout / stderr
  const fds: any[] = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((line: string) => console.log(line)),
    ConsoleStdout.lineBuffered((line: string) => console.error(line)),
  ];

  const envArray = Object.entries(options.env).map(
    ([k, v]) => `${k}=${v}`,
  );

  // Track root Directory objects so we can read output files after execution.
  const rootDirs: Map<string, any> = new Map();

  for (const [virt] of Object.entries(options.preopens)) {
    const { rootDir } = buildDirTree(virt, virtualFs, Directory, File);
    fds.push(new PreopenDirectory(virt, rootDir.contents));
    rootDirs.set(virt, rootDir);
  }

  const wasi = new WASI(
    [options.args[0], ...options.args.slice(1)],
    envArray,
    fds,
  );

  const mod = await WebAssembly.compile(wasmBytes as unknown as BufferSource);
  const inst = await WebAssembly.instantiate(mod, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  wasi.start(inst as any);

  // Collect all files from the virtual filesystem
  const output: Record<string, Uint8Array> = {};
  for (const [rootPath, dir] of rootDirs) {
    collectFiles(dir, rootPath, output);
  }
  return output;
}

// ── Virtual filesystem helpers ──────────────────────────────────────────

function buildDirTree(
  root: string,
  files: Record<string, Uint8Array>,
  DirectoryClass: any,
  FileClass: any,
): { rootDir: any } {
  const rootDir = new DirectoryClass(new Map());

  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.startsWith(root)) continue;
    const relative = filePath.slice(root.length).replace(/^\//, "");
    if (!relative) continue;

    const parts = relative.split("/");
    let current = rootDir.contents;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current.set(part, new FileClass(content.buffer));
      } else {
        if (!current.has(part)) {
          current.set(part, new DirectoryClass(new Map()));
        }
        const entry = current.get(part);
        if (entry?.contents instanceof Map) {
          current = entry.contents;
        } else {
          break;
        }
      }
    }
  }

  return { rootDir };
}

function collectFiles(
  dir: any,
  basePath: string,
  output: Record<string, Uint8Array>,
): void {
  if (!dir.contents || !(dir.contents instanceof Map)) return;
  for (const [name, entry] of dir.contents) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (entry.data instanceof Uint8Array) {
      output[path] = entry.data;
    } else if (entry.contents instanceof Map) {
      collectFiles(entry, path, output);
    }
  }
}
