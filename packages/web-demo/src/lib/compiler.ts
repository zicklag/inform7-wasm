import {
  compile as inform7Compile,
  parseInternalData,
} from "inform7-wasm";

function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/+$/, "") + path;
}

let internalFs: Record<string, Uint8Array> | null = null;

async function getInternalFs(): Promise<Record<string, Uint8Array>> {
  if (!internalFs) {
    const response = await fetch(asset("/inform7-internals.data"));
    internalFs = parseInternalData(new Uint8Array(await response.arrayBuffer()));
  }
  return internalFs;
}

async function fetchWasm(path: string): Promise<Uint8Array> {
  const response = await fetch(asset(path));
  if (!response.ok) {
    throw new Error(
      `Failed to load WASM: ${path} (${response.status} ${response.statusText})`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface CompileResult {
  gblorb?: Uint8Array;
  ulx?: Uint8Array;
}

export interface CompileOptions {
  source: string;
  onLog?: (line: string) => void;
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { source, onLog } = options;

  const [virtualInternal, inform7Bytes, inform6Bytes, inblorbBytes] =
    await Promise.all([
      getInternalFs(),
      fetchWasm("/inform7.wasm"),
      fetchWasm("/inform6.wasm"),
      fetchWasm("/inblorb.wasm"),
    ]);

  const [inform7Mod, inform6Mod, inblorbMod] = await Promise.all([
    WebAssembly.compile(inform7Bytes),
    WebAssembly.compile(inform6Bytes),
    WebAssembly.compile(inblorbBytes),
  ]);

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
        inform7: inform7Mod,
        inform6: inform6Mod,
        inblorb: inblorbMod,
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
