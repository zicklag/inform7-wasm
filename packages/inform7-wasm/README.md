# inform7

Compile [Inform 7](https://ganelson.github.io/inform-website/) interactive fiction stories to playable `.gblorb` files using pure WASM modules — no native dependencies at runtime.

Works in **Node.js**, **Deno**, and the **browser**.

## Install

```bash
npm install inform7
# or
pnpm add inform7
# or
deno add npm:inform7
```

## Usage

### Compile from source (returns buffers)

```typescript
import { compile, parseVirtualFS } from "inform7";
import { readFile } from "node:fs/promises";

// Load the pre-compiled WASM modules and Internal resource blob
const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile("node_modules/inform7/assets/inform7.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inform6.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inblorb.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inform7-internal.data").then(parseVirtualFS),
]);

const result = await compile({
  source: `"Hello World" by Example

The Starting Room is a room. "A simple room."
The player is in the Starting Room.`,
  wasm: { inform7, inform6, inblorb },
  inform7Internal,
});

// result.output.gblorb — Uint8Array of the playable file
// result.output.ulx    — Uint8Array of the Glulx story
// result.output.inf   — Uint8Array of the generated Inform 6 code
```

### Compile with progress

```typescript
const result = await compile({
  source: `...`,
  wasm: { inform7, inform6, inblorb },
  inform7Internal,
  onProgress: (msg) => console.log(msg),
});
```

## API

### `compile(options: CompileOptions): Promise<CompileResult>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | `string` | **required** | Source text of the story |
| `wasm` | `{ inform7, inform6, inblorb }` | **required** | Pre-compiled `WebAssembly.Module` instances |
| `inform7Internal` | `VirtualFS` | **required** | Virtual filesystem with Internal resources (parse from `inform7-internal.data`) |
| `format` | `'ulx' \| 'gblorb'` | `'gblorb'` | Output format |
| `virtualProject` | `VirtualFS` | auto | Override the virtual project directory |
| `onProgress` | `(msg: string) => void` | — | Progress callback |

### Low-level API

```typescript
import { runWasi, parseVirtualFS } from "inform7";

// Load the WASM and inform7Internals like in the Usage example above.

// Build a virtual filesystem with source and Internal resources
let fs = {
  ...inform7Internal,
  "/my-project/Source/story.ni": new TextEncoder().encode(source),
};

// Step 1: .ni → .i6
fs = await runWasi(inform7, {
  args: ["inform7.wasm", "-project", "/my-project", "-internal", "/inform7/Internal"],
  virtualFs: fs,
});

// Step 2: .i6 → .ulx
fs = await runWasi(inform6, {
  args: ["inform6.wasm", "-E2SwG", "/my-project/Build/auto.inf", "/my-project/Build/output.ulx"],
  virtualFs: fs,
});

// Step 3: .ulx → .gblorb
fs = await runWasi(inblorb, {
  args: ["inblorb.wasm", "-project", "/my-project"],
  virtualFs: fs,
});

const gblorb = fs["/my-project/Build/output.zblorb"];
```

See [`examples/low-level.mjs`](examples/low-level.mjs) for a complete working example.

## How it works

The package bundles three WASM binaries compiled from the official Inform 7 source:

1. **inform7.wasm** — Compiles `.ni` source → Inform 6 intermediate (`.i6`)
2. **inform6.wasm** — Compiles `.i6` → Glulx story file (`.ulx`)
3. **inblorb.wasm** — Packages `.ulx` → blorb file (`.gblorb`) with resources

Plus the `Internal/` resource directory (CSS, templates, language definitions, kits) serialized as `inform7-internal.data`.

All compilation happens entirely in-memory via a virtual filesystem backed by [`@bjorn3/browser_wasi_shim`](https://github.com/bjorn3/browser_wasi_shim), so it works identically on Node.js, Deno, and the browser.

## License

MIT
