# inform7-wasm

> **Note:** The documentation and code in this repository (excluding the Inform 7 code included as git submodules) was authored by AI. The docs might not be 100% accurate. The code is mostly unreviewed and is a minimally tested proof-of-concept.
>
> The process for compiling inform7 to WASM is pretty minimal and straight-forward, so that's pretty close to a "done" state I think.
>
> I'm less confident in the JS packge. It could probably use some work.

[![Web Demo](screenshot.png)](https://zicklag.github.io/inform7-wasm/)

**[Try the web demo →](https://zicklag.github.io/inform7-wasm/)**

A fully reproducible build of the [Inform 7](https://ganelson.github.io/inform-website/) toolchain as **pure WASI modules** — no JavaScript glue, no native dependencies at runtime.

Compile Inform 7 source text (`.ni`) into playable Glulx story files (`.gblorb`) using only WebAssembly, on any platform with a WASI runtime.

## What's in this repo

- **WASM binaries** — Everything needed to compile `inform7`, `inform6`, and `inblorb` to WASM, plus the build scripts and patches
- **JS package** — [`inform7-wasm`](packages/inform7-wasm/) on npm, a TypeScript library for compiling stories in Node.js, Deno, and the browser
- **Web demo** — A minimal browser-based compiler demo at [`packages/web-demo/`](packages/web-demo/) that compiles and runs stories entirely client-side

## Quick Start

### Prerequisites

- [pixi](https://pixi.sh/) — for the build environment
- `wget` — for downloading WASI SDK dependencies

### Build

```bash
git clone https://github.com/your-org/inform7-wasm.git
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
├── Internal/          # resource files for inform7
└── wasi-stubs.o       # POSIX stubs (pthread, system, clock)
```

### Compile a Story (Node.js — recommended)

If you have Node.js 20+ installed, use the included script:

```bash
# Compile the example story
node examples/compile.mjs

# Compile your own project
node examples/compile.mjs /path/to/My\ Project
```

The script handles all three steps automatically and works on any platform with Node.js.

### Compile a Story (wasmtime)

If you prefer [wasmtime](https://wasmtime.dev/), use the included script:

```bash
# Compile the example story
bash examples/compile-wasmtime.sh

# Compile your own project
bash examples/compile-wasmtime.sh /path/to/My\ Project
```

### Project Structure

Your project directory should look like:

```
My Project/
├── Source/
│   └── story.ni          # Your Inform 7 source text
├── Build/                # Created by inform7
├── Index/                # Created by inform7
└── My Project.materials/ # Created by inform7
  └── Extensions/        # Project-specific extensions
```

## License

This project is dedicated to the public domain under the [Unlicense](LICENSE).

## Further Reading

For technical details — how the WASM build works, the function pointer fix, source patches, dependencies, and project structure — see [HOW.md](HOW.md).
