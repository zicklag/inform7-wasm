# inform7-wasm

[![Web Demo](screenshot.png)](https://zicklag.github.io/inform7-wasm/)

**[Try the web demo →](https://zicklag.github.io/inform7-wasm/)**

A build of the [Inform 7](https://ganelson.github.io/inform-website/) toolchain as WASI WASM modules.

Lets you compile Inform 7 source text (`.ni`) into playable Glulx story files (`.gblorb`) on any platform with a WASI runtime — Node.js, Deno, wasmtime, or the browser.

## What's in this repo

- **Build Script & Patches:** A script and the patches needed to compile inform7's toolchain to WASM.
- **JS package** — [`inform7`](https://www.npmjs.com/package/inform7) on npm, a TypeScript library for compiling stories in Node.js, Deno, and the browser using the WASM modules.
- **Web demo** — A browser demo at [`packages/web-demo/`](packages/web-demo/) that compiles and runs stories entirely client-side, using the inform7 package for compilation and parchment as the interpreter.

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

## Compiling to WASM

### Prerequisites

- [pixi](https://pixi.sh/) — for the build environment (provides clang, lld)
- `wget` — for downloading WASI SDK dependencies
- `git` — for submodules

### Build the WASM binaries

```bash
git clone https://github.com/zicklag/inform7-wasm.git
cd inform7-wasm
git submodule update --init --recursive
pixi install
pixi run build
```

Output goes to `build/`:

```
build/
├── inform7.wasm       # .ni → .i6 compiler
├── inform6.wasm       # .i6 → .ulx compiler
├── inblorb.wasm       # .ulx → .gblorb packager
├── Internal/          # resource files (CSS, templates, languages, kits)
└── wasi-stubs.o       # POSIX stubs (pthread, system, clock)
```

### Using Wasmtime

There's an example bash script that will compile a story using the [Wasmtime](https://wasmtime.dev/) instead of Node.js. This lets you run the WASM files directly without using any JS runtime.

```bash
bash examples/compile-wasmtime.sh /path/to/My\ Project
```

## Further Reading

For technical details — how the WASM build works, the function pointer fix, source patches, and build internals — see [HOW.md](HOW.md).
