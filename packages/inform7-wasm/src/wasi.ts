/**
 * WASI runner — uses @bjorn3/browser_wasi_shim on all platforms
 * (Node.js, Deno, and browser) so the compilation pipeline is always
 * backed by a virtual filesystem. No real filesystem access needed.
 */

import {
  ConsoleStdout,
  Directory,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
} from "@bjorn3/browser_wasi_shim";
import type { Fd, Inode } from "@bjorn3/browser_wasi_shim";

export interface WasiOptions {
  /** CLI arguments (default: []) */
  args?: string[];
  /** Environment variables (default: {}) */
  env?: Record<string, string>;
  /** Virtual filesystem state (path → content). Preopens are auto-derived. */
  virtualFs?: Record<string, Uint8Array>;
  /** Called for each line written to stdout (default: console.log) */
  onStdout?: (line: string) => void;
  /** Called for each line written to stderr (default: console.error) */
  onStderr?: (line: string) => void;
}

/**
 * Run a WASM module with WASI using a virtual filesystem.
 *
 * Preopen directories are automatically derived from the file paths in
 * virtualFs — every top-level directory gets a preopen so the WASM program
 * can access any file in the virtual filesystem.
 *
 * @param wasmModule  The compiled WebAssembly module
 * @param options    WASI args and virtual filesystem
 * @returns          Filesystem state after execution (path → content)
 */
export async function runWasi(
  wasmModule: WebAssembly.Module,
  options: WasiOptions = {},
): Promise<Record<string, Uint8Array>> {
  const { args = [], env = {}, virtualFs = {}, onStdout, onStderr } = options;

  const stdoutHandler = onStdout ?? ((line: string) => console.log(line));
  const stderrHandler = onStderr ?? ((line: string) => console.error(line));

  // stdin / stdout / stderr
  const fds: Fd[] = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(stdoutHandler),
    ConsoleStdout.lineBuffered(stderrHandler),
  ];

  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  // Auto-derive preopen directories from the virtual filesystem paths.
  // Every top-level directory gets a preopen so the WASM program can
  // access any file.
  const rootDirs: Map<string, Directory> = new Map();
  const preopens = derivePreopens(virtualFs);

  for (const virt of preopens) {
    const { rootDir } = buildDirTree(virt, virtualFs);
    fds.push(new PreopenDirectory(virt, rootDir.contents));
    rootDirs.set(virt, rootDir);
  }

  const wasi = new WASI([args[0] ?? "wasm", ...args.slice(1)], envArray, fds);

  const inst = await WebAssembly.instantiate(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  // Narrow the generic WASM instance to the shape WASI.start() expects.
  // The inform7/inform6/inblorb WASM binaries always export memory and _start.
  if (!hasWasiExports(inst)) {
    throw new Error("WASM module is missing required exports (memory, _start)");
  }
  wasi.start(inst);

  // Collect all files from the virtual filesystem
  const output: Record<string, Uint8Array> = {};
  for (const [rootPath, dir] of rootDirs) {
    collectFiles(dir, rootPath, output);
  }
  return output;
}

// ── Virtual filesystem helpers ──────────────────────────────────────────

/**
 * Derive the set of preopen directories from the file paths in the virtual
 * filesystem. Each unique top-level directory becomes a preopen.
 *
 * Example: files at /story/... and /inform7/... produce preopens
 * for /story and /inform7.
 */
function derivePreopens(files: Record<string, Uint8Array>): string[] {
  const dirs = new Set<string>();
  for (const filePath of Object.keys(files)) {
    // Paths are absolute: /foo/bar/baz → top-level dir is /foo
    const match = filePath.match(/^(\/[^/]+)/);
    if (match) {
      dirs.add(match[1]);
    }
  }
  return [...dirs].sort();
}

function buildDirTree(root: string, files: Record<string, Uint8Array>): { rootDir: Directory } {
  const rootDir = new Directory(new Map());

  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.startsWith(root)) continue;
    const relative = filePath.slice(root.length).replace(/^\//, "");
    if (!relative) continue;

    const parts = relative.split("/");
    let current: Map<string, Inode> = rootDir.contents;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current.set(part, new File(content));
      } else {
        if (!current.has(part)) {
          current.set(part, new Directory(new Map()));
        }
        const entry = current.get(part);
        if (entry instanceof Directory) {
          current = entry.contents;
        } else {
          break;
        }
      }
    }
  }

  return { rootDir };
}

function isFileEntry(entry: Inode): entry is File {
  return "data" in entry;
}

function isDirectoryEntry(entry: Inode): entry is Directory {
  return "contents" in entry;
}

/**
 * Type guard that narrows the generic WASM instance to the shape
 * WASI.start() expects. The inform7/inform6/inblorb binaries always
 * export a `memory` object and a `_start` function.
 */
function hasWasiExports(
  instance: WebAssembly.Instance,
): instance is { exports: { memory: WebAssembly.Memory; _start: () => unknown } } {
  return "memory" in instance.exports && "_start" in instance.exports;
}

function collectFiles(dir: Directory, basePath: string, output: Record<string, Uint8Array>): void {
  for (const [name, entry] of dir.contents) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (isFileEntry(entry)) {
      output[path] = entry.data;
    } else if (isDirectoryEntry(entry)) {
      collectFiles(entry, path, output);
    }
  }
}
