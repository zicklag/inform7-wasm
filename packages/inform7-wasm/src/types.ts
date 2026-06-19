/** Options for compiling an Inform 7 story. */
export interface CompileOptions {
  /**
   * Source text of the Inform 7 story.
   */
  source: string;

  /** Output format. Default: 'gblorb' */
  format?: "ulx" | "gblorb";

  /**
   * Override WASM binary locations.
   *
   * In Node.js/Deno: a file path (string) or URL.
   * In the browser: a URL (string | URL) or a pre-fetched ArrayBuffer.
   *
   * Defaults to the WASM binaries bundled with this package.
   */
  wasm?: {
    inform7?: string | URL | ArrayBuffer;
    inform6?: string | URL | ArrayBuffer;
    inblorb?: string | URL | ArrayBuffer;
  };

  /**
   * Virtual filesystem for the Internal resource directory.
   *
   * A flat map of virtual paths to file contents. Generate this from
   * the bundled internal.json.gz manifest using `loadInternalFromUrl()`:
   *
   * ```ts
   * const virtualInternal = await loadInternalFromUrl("/internal.json.gz");
   * ```
   *
   * Required for browser use. In Node.js/Deno, defaults to loading from
   * the bundled `internal.json.gz` shipped with this package.
   */
  virtualInternal?: Record<string, Uint8Array>;

  /**
   * Virtual filesystem for the project directory.
   *
   * A flat map of virtual paths to file contents. If not provided, the
   * source text is placed at `/story/Source/story.ni` automatically.
   */
  virtualProject?: Record<string, Uint8Array>;

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
