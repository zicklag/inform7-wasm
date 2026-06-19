# inform7-wasm

A fully reproducible build of the [Inform 7](https://ganelson.github.io/inform-website/) toolchain as **pure WASI modules** — no JavaScript glue, no native dependencies at runtime.

Compile Inform 7 source text (`.ni`) into playable Glulx story files (`.gblorb`) using only WebAssembly, on any platform with a WASI runtime.

## What's Inside

Three WASM binaries, each a self-contained command-line tool:

| Binary | Size | Role |
|--------|------|------|
| `inform7.wasm` | 5.1 MB | Compiles `.ni` source → Inform 6 intermediate (`.i6`) |
| `inform6.wasm` | 668 KB | Compiles `.i6` → Glulx story file (`.ulx`) |
| `inblorb.wasm` | 380 KB | Packages `.ulx` → blorb file (`.gblorb`) with resources |

Also includes `Internal/` — the resource directory (CSS, templates, language definitions, kits) that `inform7.wasm` needs at runtime.

## Quick Start

### Prerequisites

- [pixi](https://pixi.sh/) — for the build environment
- `wget` — for downloading WASI SDK dependencies
- A C compiler (`gcc` or `clang`) — for building `inweb` natively

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

## How It Works

### The WASI Approach

All three tools are compiled as **pure WASI Preview 1** modules using `clang` with the `wasm32-wasip1` target. They have zero JavaScript dependencies and can run in any WASI-compliant runtime (wasmtime, wasmer, Node.js WASI, etc.).

### The Function Pointer Fix

Inform 7's method dispatch system stores function pointers as `void*` and casts them back at call sites. The `VOID_METHOD_TYPE` macro declared the function type as returning `void`, but 278 handler functions actually returned `int`. In native C this works (the return value is ignored), but WASM's `call_indirect` requires exact signature match including return type.

The fix: changed all 278 handler functions from `void` to `int` across 86 `.w` source files, plus `return;` → `return 0;` in macro sections. These changes are in the `patches/` directory and are applied to the submodules during build.

### Source Patches

| Patch | Files Changed | Description |
|-------|--------------|-------------|
| `patches/inweb-wasi.patch` | 1 file | `Methods.w`: `VOID_METHOD_TYPE` returns `int` |
| `patches/inform-wasi.patch` | 86 files | 278 handler functions: `void` → `int`; `asm` → `asm_flag`; `return;` → `return 0;` in macros |

## Project Structure

```
inform7-wasm/
├── build.sh                 # Reproducible build script
├── pixi.toml                # Pixi project configuration
├── patches/
│   ├── inform-wasi.patch    # Source patches for inform repo
│   └── inweb-wasi.patch     # Source patches for inweb repo
├── support/
│   ├── wasi-stubs.c         # POSIX stubs (pthread, system, clock)
│   └── custom-include/
│       └── setjmp.h         # WASI-safe setjmp override
├── submodules/
│   ├── inform/              # ganelson/inform @ v10.1.2
│   ├── inweb/               # ganelson/inweb @ v7.2.0
│   └── intest/              # ganelson/intest @ v2.1.0
├── resources/               # (gitignored) Downloaded WASI SDK
└── build/                   # (gitignored) Build output
```

## Dependencies

### Build-time (via pixi / conda-forge)

- `clang` ≥ 22.1.8 — C compiler with WASI target support
- `lld` ≥ 22.1.8 — LLVM linker

### Build-time (downloaded)

- `wasi-sysroot-24.0.tar.gz` — WASI libc headers and libraries
- `libclang_rt.builtins-wasm32-wasi-24.0.tar.gz` — compiler-rt builtins for wasm32

Both are downloaded from the [wasi-sdk releases](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-24) on first build and cached in `resources/`.

### Runtime

- Any WASI Preview 1 runtime (wasmtime, wasmer, Node.js 20+ with `--experimental-wasi-unstable-preview1`)

## What's New

- **Node.js compile script** — `examples/compile.mjs` compiles any Inform 7 project using Node.js built-in WASI (no wasmtime needed)
- **Example story** — `examples/hello/` contains a minimal "Hello World" story ready to compile
- **Binary kits** — All five Inter kits are now built during compilation, not just EnglishLanguageKit

## Upcoming

- **npm package** — `@inform7/wasi` for use in Node.js and browser via `@bjorn3/browser_wasi_shim`
- **Unified WASM binary** — single binary that runs the full pipeline in-process
- **CI/CD** — automated builds with GitHub Actions
- **Multi-arch** — AArch64 WASM builds

## License

The Inform 7 toolchain is distributed under the [Artistic License 2.0](https://opensource.org/licenses/Artistic-2.0). This build system and patches are provided under the same license.
