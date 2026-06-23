import type { VirtualFS } from "./virtualfs.js";

/** Options for compiling an Inform 7 story. */
export interface CompileOptions {
  /**
   * Source text of the Inform 7 story.
   */
  source: string;

  /** Output format. Default: 'gblorb' */
  format?: "ulx" | "gblorb";

  /**
   * Pre-compiled WebAssembly modules for each tool.
   *
   * Compile once with `WebAssembly.compile(bytes)`, then reuse across
   * multiple compilations to avoid recompilation overhead.
   */
  wasm: {
    inform7: WebAssembly.Module;
    inform6: WebAssembly.Module;
    inblorb: WebAssembly.Module;
  };

  /**
   * Virtual filesystem for Inform 7's Internal resource directory.
   *
   * Paths should be under `/inform7/Internal/...` — this is where
   * inform7 expects to find its templates, language definitions, kits,
   * and built-in extensions.
   *
   * Generate this from the bundled `inform7-internal.data` file:
   *
   * ```ts
   * const raw = parseVirtualFS(await readFile("inform7-internal.data"));
   * const inform7Internal: VirtualFS = {};
   * for (const [path, data] of Object.entries(raw)) {
   *   inform7Internal[`/inform7/Internal${path}`] = data;
   * }
   * ```
   */
  inform7Internal?: VirtualFS;

  /**
   * Virtual filesystem for the project directory.
   *
   * A flat map of virtual paths to file contents. If not provided, the
   * source text is placed at `/story/Source/story.ni` automatically.
   */
  virtualProject?: VirtualFS;

  /**
   * Callback for progress updates from the compiler.
   */
  onProgress?: (message: string) => void;
}

/** Result of a successful compilation. */
export interface CompileResult {
  /** Output files as Uint8Array buffers. */
  output: {
    /** The compiled Inform 6 intermediate source. */
    inf?: Uint8Array;
    /** The Glulx story file. */
    ulx?: Uint8Array;
    /** The packaged blorb file. */
    gblorb?: Uint8Array;
  };
}
