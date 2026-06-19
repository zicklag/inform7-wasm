#!/usr/bin/env bash
# build.sh — Reproducible WASM build of the Inform 7 toolchain
#
# Builds inform7.wasm, inform6.wasm, and inblorb.wasm as pure WASI modules.
#
# Prerequisites:
#   - pixi (for clang, lld)
#   - git
#   - wget
#   - C compiler (gcc or clang) for building native inweb
#
# Usage: pixi run build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Versions
WASI_SDK_VERSION="24.0"
WASI_SDK_TAG="24"

# Paths
RESOURCES="$SCRIPT_DIR/resources"
BUILD="$SCRIPT_DIR/build"
SUPPORT="$SCRIPT_DIR/support"
PATCHES="$SCRIPT_DIR/patches"
SUB="$SCRIPT_DIR/submodules"

WASI_SYSROOT="$RESOURCES/wasi-sysroot-$WASI_SDK_VERSION"
COMPILER_RT="$RESOURCES/libclang_rt.builtins-wasm32-wasi-$WASI_SDK_VERSION"
CUSTOM_INCLUDE="$SUPPORT/custom-include"
WASI_STUBS_C="$SUPPORT/wasi-stubs.c"

# Detect a working C compiler for building native inweb
if command -v gcc &>/dev/null; then
    NATIVE_CC="gcc"
elif command -v clang &>/dev/null; then
    NATIVE_CC="clang"
else
    NATIVE_CC=".pixi/envs/default/bin/clang"
fi

mkdir -p "$RESOURCES" "$BUILD"

# Ensure compiler-rt builtins are findable by clang
CLANG_RESOURCE_DIR=".pixi/envs/default/lib/clang/22/lib/wasm32-unknown-wasip1"
mkdir -p "$CLANG_RESOURCE_DIR"
if [ ! -f "$CLANG_RESOURCE_DIR/libclang_rt.builtins.a" ]; then
    ln -sf "$COMPILER_RT/libclang_rt.builtins-wasm32.a" \
        "$CLANG_RESOURCE_DIR/libclang_rt.builtins.a"
fi

echo "=== Inform 7 WASM Build ==="
echo ""

# ============================================================
# Step 1: Download WASI dependencies
# ============================================================
echo "--- Step 1/7: Downloading WASI dependencies ---"

if [ ! -f "$WASI_SYSROOT/lib/wasm32-wasip1/crt1-command.o" ]; then
    echo "Downloading wasi-sysroot..."
    SYSROOT_URL="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$WASI_SDK_TAG/wasi-sysroot-$WASI_SDK_VERSION.tar.gz"
    echo "  URL: $SYSROOT_URL"
    wget --no-netrc --no-hsts -q "$SYSROOT_URL" -O /tmp/wasi-sysroot.tar.gz 2>&1
    tar xzf /tmp/wasi-sysroot.tar.gz -C "$RESOURCES"
    rm /tmp/wasi-sysroot.tar.gz
    echo "  -> $(du -sh "$WASI_SYSROOT" | cut -f1)"
else
    echo "  wasi-sysroot already downloaded"
fi

if [ ! -f "$COMPILER_RT/libclang_rt.builtins-wasm32.a" ]; then
    echo "Downloading compiler-rt builtins..."
    CRT_URL="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$WASI_SDK_TAG/libclang_rt.builtins-wasm32-wasi-$WASI_SDK_VERSION.tar.gz"
    wget --no-netrc --no-hsts -q "$CRT_URL" -O /tmp/compiler-rt.tar.gz
    tar xzf /tmp/compiler-rt.tar.gz -C "$RESOURCES"
    rm /tmp/compiler-rt.tar.gz
    echo "  -> $(du -sh "$COMPILER_RT" | cut -f1)"
else
    echo "  compiler-rt already downloaded"
fi

# ============================================================
# Step 2: Initialize and update submodules
# ============================================================
echo "--- Step 2/7: Initializing submodules ---"

if [ ! -d "$SUB" ]; then
    echo "Error: submodules directory not found." >&2
    echo "Run: git submodule update --init --recursive" >&2
    exit 1
fi

git submodule update --init --recursive 2>/dev/null || true
echo "  Submodules ready"

# ============================================================
# Step 3: Apply patches
# ============================================================
echo "--- Step 3/7: Applying patches ---"

apply_patch() {
    local repo="$1"
    local patch="$2"
    local tag="$3"
    cd "$SUB/$repo"
    # Check if patch is already applied by looking at git log
    if git log --oneline "$tag..HEAD" 2>/dev/null | grep -q "wasi\|WASI"; then
        echo "  $repo patch already applied"
    else
        git am "$PATCHES/$patch" 2>/dev/null || git apply "$PATCHES/$patch" 2>/dev/null || {
            echo "  WARNING: Could not apply $repo patch (may already be applied)"
        }
        echo "  $repo patch applied"
    fi
    cd "$SCRIPT_DIR"
}

apply_patch "inweb" "inweb-wasi.patch" "v7.2.0"
apply_patch "inform" "inform-wasi.patch" "v10.1.2"

# ============================================================
# Step 4: Build native inweb (needed to regenerate tangled files)
# ============================================================
echo "--- Step 4/7: Building native inweb ---"

INWEB_SRC="$SUB/inweb/Tangled/inweb.c"
INWEB_BIN="$BUILD/inweb-native"

if [ ! -f "$INWEB_BIN" ]; then
    echo "  Compiling inweb with $NATIVE_CC..."
    $NATIVE_CC -DPLATFORM_LINUX -DPLATFORM_POSIX -o "$INWEB_BIN" "$INWEB_SRC" -lm
    echo "  inweb built ($(du -h "$INWEB_BIN" | cut -f1))"
else
    echo "  inweb already built"
fi

# ============================================================
# Step 5: Regenerate tangled files
# ============================================================
echo "--- Step 5/7: Regenerating tangled files ---"

cd "$SUB/inform"
"$INWEB_BIN" inform7 -at "$SUB/inweb" -tangle
echo "  inform7 tangled"
"$INWEB_BIN" inblorb -at "$SUB/inweb" -tangle
echo "  inblorb tangled"

# Tangle extensions (Standard Rules, Basic Inform)
mkdir -p "inform7/Internal/Extensions/Graham Nelson"
"$INWEB_BIN" inform7/extensions/standard_rules -at "$SUB/inweb" \
    -tangle-to "inform7/Internal/Extensions/Graham Nelson/Standard Rules.i7x"
echo "  Standard Rules tangled"
"$INWEB_BIN" inform7/extensions/basic_inform -at "$SUB/inweb" \
    -tangle-to "inform7/Internal/Extensions/Graham Nelson/Basic Inform.i7x"
echo "  Basic Inform tangled"

cd "$SCRIPT_DIR"

# ============================================================
# Step 6: Compile WASM binaries
# ============================================================
echo "--- Step 6/7: Compiling WASM binaries ---"

CLANG=".pixi/envs/default/bin/clang"

# Common flags
WASI_FLAGS=(
    --target=wasm32-wasip1
    --sysroot="$WASI_SYSROOT"
    -DPLATFORM_POSIX
    -DPLATFORM_LINUX
)

# Compile wasi-stubs
echo "  Compiling wasi-stubs..."
$CLANG "${WASI_FLAGS[@]}" -std=gnu11 -O0 -c "$WASI_STUBS_C" -o "$BUILD/wasi-stubs.o"

# --- inform6 ---
echo "  Compiling inform6.wasm..."
$CLANG "${WASI_FLAGS[@]}" \
    -D_POSIX_C_SOURCE=200112L -D_DEFAULT_SOURCE -DLINUX \
    -std=c99 -Os \
    "$SUB/inform/inform6/Inform6/"*.c \
    -o "$BUILD/inform6.wasm" -nostdlib \
    "$WASI_SYSROOT/lib/wasm32-wasip1/crt1-command.o" \
    -L"$WASI_SYSROOT/lib/wasm32-wasip1" \
    "$COMPILER_RT/libclang_rt.builtins-wasm32.a" -lc \
    -Wl,-z,stack-size=5242880 \
    -Wl,--initial-memory=16777216 -Wl,--max-memory=2147483648
echo "  -> $(du -h "$BUILD/inform6.wasm" | cut -f1)"

# --- inblorb ---
echo "  Compiling inblorb.wasm..."
$CLANG "${WASI_FLAGS[@]}" \
    -D_POSIX_C_SOURCE=200112L -D_DEFAULT_SOURCE \
    -std=c11 -Os \
    "$SUB/inform/inblorb/Tangled/inblorb.c" \
    "$BUILD/wasi-stubs.o" \
    -o "$BUILD/inblorb.wasm" -nostdlib \
    "$WASI_SYSROOT/lib/wasm32-wasip1/crt1-command.o" \
    -L"$WASI_SYSROOT/lib/wasm32-wasip1" \
    "$COMPILER_RT/libclang_rt.builtins-wasm32.a" -lc \
    -Wl,-z,stack-size=5242880 \
    -Wl,--initial-memory=16777216 -Wl,--max-memory=2147483648
echo "  -> $(du -h "$BUILD/inblorb.wasm" | cut -f1)"

# --- inform7 ---
echo "  Compiling inform7.wasm..."
$CLANG "${WASI_FLAGS[@]}" \
    -DINFORM7_PATH='"./inform/inform7/Internal"' \
    -std=gnu11 -O0 \
    -I"$CUSTOM_INCLUDE" \
    -I"$SUB/inform/inform7/Tangled" \
    -I"$SUB/inweb/foundation-module" \
    -I"$SUB/inweb/foundation-module/Chapter 2" \
    -c "$SUB/inform/inform7/Tangled/inform7.c" \
    -o "$BUILD/inform7.o"

$CLANG "${WASI_FLAGS[@]}" \
    -std=gnu11 -O0 \
    -I"$CUSTOM_INCLUDE" \
    -I"$SUB/inform/inform7/Tangled" \
    -I"$SUB/inweb/foundation-module" \
    -I"$SUB/inweb/foundation-module/Chapter 2" \
    -Wl,-z,stack-size=8388608 \
    -Wl,--initial-memory=33554432 \
    -Wl,--max-memory=2147483648 \
    "$BUILD/inform7.o" \
    "$BUILD/wasi-stubs.o" \
    "$COMPILER_RT/libclang_rt.builtins-wasm32.a" \
    -o "$BUILD/inform7.wasm"
echo "  -> $(du -h "$BUILD/inform7.wasm" | cut -f1)"

# Clean up object files
rm -f "$BUILD/inform7.o"

# ============================================================
# Step 7: Copy Internal resources
# ============================================================
echo "--- Step 7/7: Copying Internal resources ---"

cp -r "$SUB/inform/inform7/Internal" "$BUILD/Internal"

# Copy generated Syntax.preform into place
cp "$SUB/inform/inform7/Tangled/Syntax.preform" "$BUILD/Internal/Languages/English/Syntax.preform"

# Create CSS copies for Linux platform
cp "$BUILD/Internal/HTML/main.css" "$BUILD/Internal/HTML/linux-main.css"
cp "$BUILD/Internal/HTML/platform.css" "$BUILD/Internal/HTML/linux-platform.css"

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD/"*.wasm
echo ""
echo "Output in: $BUILD/"
echo "  inform7.wasm  — .ni -> .i6 compiler"
echo "  inform6.wasm  — .i6 -> .ulx compiler"
echo "  inblorb.wasm  — .ulx -> .gblorb packager"
echo "  Internal/     — resource files (CSS, templates, languages, kits)"
