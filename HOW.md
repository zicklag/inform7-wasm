# How It Works

## The WASI Approach

All three tools are compiled as **pure WASI Preview 1** modules using `clang` with the `wasm32-wasip1` target. They have zero JavaScript dependencies and can run in any WASI-compliant runtime (wasmtime, wasmer, Node.js WASI, etc.).

## The Function Pointer Fix

Inform 7's method dispatch system stores function pointers as `void*` and casts them back at call sites. The `VOID_METHOD_TYPE` macro declared the function type as returning `void`, but 278 handler functions actually returned `int`. In native C this works (the return value is ignored), but WASM's `call_indirect` requires exact signature match including return type.

The fix: changed all 278 handler functions from `void` to `int` across 86 `.w` source files, plus `return;` → `return 0;` in macro sections. These changes are in the `patches/` directory and are applied to the submodules during build.

## Source Patches

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
