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
├── packages/
│   ├── inform7-wasm/        # npm package (TypeScript, Node.js + browser)
│   └── web-demo/            # SvelteKit browser IDE (Monaco + Glulx interpreter)
├── examples/
│   ├── compile.mjs          # File-based compilation via Node.js WASI
│   ├── compile-wasmtime.sh  # File-based compilation via wasmtime
│   ├── high-level.mjs       # JS package high-level API demo
│   ├── low-level.mjs        # JS package low-level API demo
│   └── hello/               # Example "Hello World" story
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

- **JS package** — [`inform7`](https://www.npmjs.com/package/inform7) on npm for Node.js, Deno, and browser
- **Web demo** — Browser-based IDE at [`packages/web-demo/`](packages/web-demo/) deployed to GitHub Pages
- **CI/CD** — GitHub Actions workflow at `.github/workflows/deploy-web-demo.yml` auto-deploys the web demo
- **High-level API** — Single `compile()` call in the JS package (see `examples/high-level.mjs`)
- **Low-level API** — Step-by-step `runWasi()` with virtual filesystem (see `examples/low-level.mjs`)
- **Node.js compile script** — `examples/compile.mjs` compiles any Inform 7 project using Node.js built-in WASI
- **Example story** — `examples/hello/` contains a minimal "Hello World" story ready to compile
- **Binary kits** — All five Inter kits are now built during compilation, not just EnglishLanguageKit
- **Performance optimization** — WASM binaries compiled with `-O2` for speed
