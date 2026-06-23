# inform7

Unofficial WASM port of [Inform 7](https://ganelson.github.io/inform-website/). Can compile stories to playable `.gblorb` files from **Node.js**, **Deno**, and the **browser**!

## Install

```bash
npm install inform7
# or
pnpm add inform7
# or
deno add npm:inform7
```

## Usage

### Low-level API

The core exports are `runWasi` and `parseVirtualFS`. They give you full control over each compilation step.

```typescript
import { runWasi, parseVirtualFS } from "inform7";
import { readFile } from "node:fs/promises";

// Load the pre-compiled WASM modules and Internal resource blob
const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile("node_modules/inform7/assets/inform7.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inform6.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inblorb.wasm").then(WebAssembly.compile),
  // Inform has a collection of data files needed to run, which are parsed from a binary
  // bundle into a virtual FS here. The virtual FS will have the files at /inform7/Internal
  readFile("node_modules/inform7/assets/inform7-internal.data").then(parseVirtualFS),
]);

// Build a virtual filesystem with source and Internal resources
let fs = {
  ...inform7Internal,
  "/my-project/Source/story.ni": new TextEncoder().encode(`
    "Hello World" by Example
  
    The Starting Room is a room. "A simple room."
    The player is in the Starting Room.
  `),
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

### `compile` helper

For the common case of going straight from source to a `.gblorb` (or `.ulx`), use the `compile` convenience function:

```typescript
import { compile, parseVirtualFS } from "inform7";
import { readFile } from "node:fs/promises";

const [inform7, inform6, inblorb, inform7Internal] = await Promise.all([
  readFile("node_modules/inform7/assets/inform7.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inform6.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inblorb.wasm").then(WebAssembly.compile),
  readFile("node_modules/inform7/assets/inform7-internal.data").then(parseVirtualFS),
]);

const result = await compile({
  source: `
    "Hello World" by Example
    
    The Starting Room is a room. "A simple room."
    The player is in the Starting Room.
  `,
  wasm: { inform7, inform6, inblorb },
  inform7Internal,
});

// result.output.gblorb — Uint8Array of the playable file
// result.output.ulx    — Uint8Array of the Glulx story
// result.output.inf    — Uint8Array of the generated Inform 6 code
// result.virtualFs     — Mapping of file path to Uint8Array of files from the resulting filesystem
```

Optionally pass `onProgress` to see compilation status:

```typescript
const result = await compile({
  source: `...`,
  wasm: { inform7, inform6, inblorb },
  inform7Internal,
  onProgress: (msg) => console.log(msg),
});
```

## How it works

[This repo](https://github.com/zicklag/inform7-wasm/tree/main) contains the build script and patches necessary to compile the official inform7, inform6, and inblorb CLI tools to WASM modules with the [WASI] standard. This basically lets us run the inform tools virtually in any WASI runtime, such as node.js, Deno, web browsers, or [Wasmtime](https://docs.wasmtime.dev/).

The patches were straight-forward, though somewhat extensive. Because WASM requires strict type checking on indirect function calls, a few hundred functions had to be switched from returning `void` to returning `int`, but otherwise no changes to the inform source were required.

[WASI]: https://wasi.dev/
