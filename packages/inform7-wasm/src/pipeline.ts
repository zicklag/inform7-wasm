import type { CompileOptions, CompileResult } from "./types.js";
import type { VirtualFS } from "./virtualfs.js";
import { runWasi } from "./wasi.js";

/**
 * Compile an Inform 7 story entirely in-memory using a virtual filesystem.
 *
 * Works identically on Node.js, Deno, and the browser — no real filesystem
 * access is needed at any point.
 */
export async function compile(options: CompileOptions): Promise<CompileResult> {
  if (!options.source) {
    throw new Error("The 'source' option is required.");
  }

  const { inform7: inform7Wasm, inform6: inform6Wasm, inblorb: inblorbWasm } = options.wasm;

  // Build the virtual filesystem
  const encoder = new TextEncoder();
  const virtualFs: VirtualFS = {
    ...(options.inform7Internal ?? {}),
    ...(options.virtualProject ?? {}),
    "/story/Source/story.ni": encoder.encode(options.source),
    "/story/Build/.empty": new Uint8Array(0),
  };

  // ── Step 1: .ni → .i6 (inform7) ──
  options.onProgress?.("Compiling source to I6 (inform7)...");
  const afterInform7 = await runWasi(inform7Wasm, {
    args: ["inform7.wasm", "-project", "/story", "-internal", "/inform7/Internal"],
    virtualFs,
  });

  const autoInf = findInOutput(afterInform7, "/story/Build/auto.inf");
  if (!autoInf) {
    throw new Error("inform7 failed to produce auto.inf");
  }

  // ── Step 2: .i6 → .ulx (inform6) ──
  options.onProgress?.("Compiling I6 to Glulx (inform6)...");
  Object.assign(virtualFs, afterInform7);

  const afterInform6 = await runWasi(inform6Wasm, {
    args: ["inform6.wasm", "-E2SwG", "/story/Build/auto.inf", "/story/Build/output.ulx"],
    virtualFs,
  });

  const outputUlx = findInOutput(afterInform6, "/story/Build/output.ulx");
  if (!outputUlx) {
    throw new Error("inform6 failed to produce output.ulx");
  }

  // ── Step 3: .ulx → .gblorb (inblorb) ──
  let outputGblorb: Uint8Array | undefined;

  if (!inblorbWasm) {
    throw new Error("inblorb.wasm is required for gblorb format");
  }

  options.onProgress?.("Packaging to blorb (inblorb)...");
  Object.assign(virtualFs, afterInform6);

  const afterInblorb = await runWasi(inblorbWasm, {
    args: ["inblorb.wasm", "-project", "/story"],
    virtualFs,
  });

  outputGblorb = findInOutput(afterInblorb, "/story/Build/output.zblorb");

  return {
    virtualFs: afterInblorb,
    output: {
      inf: autoInf,
      ulx: outputUlx,
      gblorb: outputGblorb,
    },
  };
}

function findInOutput(output: VirtualFS, fullPath: string): Uint8Array | undefined {
  if (output[fullPath]) return output[fullPath];
  const filename = fullPath.split("/").pop()!;
  for (const [path, data] of Object.entries(output)) {
    if (path.endsWith(`/${filename}`) || path === filename) {
      return data;
    }
  }
  return undefined;
}
