import { loadWasm, runWasi } from "./wasi.js";
import type { CompileOptions, CompileResult } from "./types.js";

/**
 * Compile an Inform 7 story entirely in-memory using a virtual filesystem.
 *
 * Works identically on Node.js, Deno, and the browser — no real filesystem
 * access is needed at any point.
 */
export async function compile(
  options: CompileOptions,
): Promise<CompileResult> {
  if (!options.source) {
    throw new Error("The 'source' option is required.");
  }

  const format = options.format ?? "gblorb";

  // Resolve WASM binaries
  const inform7Wasm = await loadWasm(
    options.wasm?.inform7 ??
      new URL("../wasm/inform7.wasm", import.meta.url),
  );
  const inform6Wasm = await loadWasm(
    options.wasm?.inform6 ??
      new URL("../wasm/inform6.wasm", import.meta.url),
  );
  const inblorbWasm = await loadWasm(
    options.wasm?.inblorb ??
      new URL("../wasm/inblorb.wasm", import.meta.url),
  );

  // Build the virtual filesystem
  const encoder = new TextEncoder();
  const virtualFs: Record<string, Uint8Array> = {
    ...(options.virtualInternal ?? {}),
    ...(options.virtualProject ?? {}),
    "/story/Source/story.ni": encoder.encode(options.source),
    "/story/Build/.empty": new Uint8Array(0),
    "/story.materials/Extensions/.empty": new Uint8Array(0),
  };

  // ── Step 1: .ni → .i6 (inform7) ──
  options.onProgress?.("Compiling source to I6 (inform7)...");
  const afterInform7 = await runWasi(
    inform7Wasm,
    {
      args: [
        "inform7.wasm",
        "-project", "/story",
        "-internal", "/inform7/Internal",
      ],
      env: { INFORM7_PATH: "/inform7/Internal" },
      preopens: {
        "/story": "/story",
        "/inform7/Internal": "/inform7/Internal",
      },
    },
    virtualFs,
  );

  const autoInf = findInOutput(afterInform7, "/story/Build/auto.inf");
  if (!autoInf) {
    throw new Error("inform7 failed to produce auto.inf");
  }

  // ── Step 2: .i6 → .ulx (inform6) ──
  options.onProgress?.("Compiling I6 to Glulx (inform6)...");
  Object.assign(virtualFs, afterInform7);

  const afterInform6 = await runWasi(
    inform6Wasm,
    {
      args: [
        "inform6.wasm",
        "-E2SwG",
        "/story/Build/auto.inf",
        "/story/Build/output.ulx",
      ],
      env: {},
      preopens: { "/story": "/story" },
    },
    virtualFs,
  );

  const outputUlx = findInOutput(afterInform6, "/story/Build/output.ulx");
  if (!outputUlx) {
    throw new Error("inform6 failed to produce output.ulx");
  }

  // ── Step 3: .ulx → .gblorb (inblorb) ──
  let outputGblorb: Uint8Array | undefined;

  if (format === "gblorb") {
    if (!inblorbWasm) {
      throw new Error("inblorb.wasm is required for gblorb format");
    }

    options.onProgress?.("Packaging to blorb (inblorb)...");
    Object.assign(virtualFs, afterInform6);

    const afterInblorb = await runWasi(
      inblorbWasm,
      {
        args: ["inblorb.wasm", "-project", "/story"],
        env: { INFORM7_PATH: "/inform7/Internal" },
        preopens: {
          "/story": "/story",
          "/inform7/Internal": "/inform7/Internal",
        },
      },
      virtualFs,
    );

    outputGblorb = findInOutput(afterInblorb, "/story/Build/output.zblorb");
  }

  return {
    output: {
      inf: autoInf,
      ulx: outputUlx,
      gblorb: outputGblorb,
    },
  };
}

function findInOutput(
  output: Record<string, Uint8Array>,
  fullPath: string,
): Uint8Array | undefined {
  if (output[fullPath]) return output[fullPath];
  const filename = fullPath.split("/").pop()!;
  for (const [path, data] of Object.entries(output)) {
    if (path.endsWith(`/${filename}`) || path === filename) {
      return data;
    }
  }
  return undefined;
}
