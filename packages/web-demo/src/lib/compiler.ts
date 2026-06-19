import {
  compile as inform7Compile,
  loadInternalFromUrl,
} from "inform7-wasm";

// Cache the virtual internal filesystem after first load
let internalFs: Record<string, Uint8Array> | null = null;

async function getInternalFs(): Promise<Record<string, Uint8Array>> {
  if (!internalFs) {
    // Load from the static copy (uncompressed JSON to avoid gzip-on-gzip
    // issues with Vite's dev server)
    internalFs = await loadInternalFromUrl("/inform7-internals.json");
  }
  return internalFs;
}

/**
 * Fetch a WASM binary from a static URL and return it as a Uint8Array.
 */
async function fetchWasm(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Failed to load WASM: ${path} (${response.status} ${response.statusText})`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface CompileResult {
  /** The compiled gblorb data */
  gblorb?: Uint8Array;
  /** The raw Glulx story file (fallback if gblorb wasn't produced) */
  ulx?: Uint8Array;
}

export interface CompileOptions {
  /** Inform 7 source text */
  source: string;
  /** Called with each line of compiler output */
  onLog?: (line: string) => void;
}

/**
 * Compile an Inform 7 source string to a playable gblorb.
 */
export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { source, onLog } = options;

  const [virtualInternal, inform7Wasm, inform6Wasm, inblorbWasm] =
    await Promise.all([
      getInternalFs(),
      fetchWasm("/inform7.wasm"),
      fetchWasm("/inform6.wasm"),
      fetchWasm("/inblorb.wasm"),
    ]);

  // Intercept console.log to capture WASI stdout
  const origLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    lines.push(line);
    onLog?.(line);
  };

  try {
    const result = await inform7Compile({
      source,
      virtualInternal,
      wasm: {
        inform7: inform7Wasm.buffer,
        inform6: inform6Wasm.buffer,
        inblorb: inblorbWasm.buffer,
      },
      format: "gblorb",
      onProgress(msg) {
        const line = `[progress] ${msg}`;
        lines.push(line);
        onLog?.(line);
      },
    });

    return {
      gblorb: result.output.gblorb,
      ulx: result.output.ulx,
    };
  } finally {
    console.log = origLog;
  }
}