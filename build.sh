#!/usr/bin/env bash
# build.sh — Reproducible WASM build of the Inform 7 toolchain
#
# Builds inform7.wasm, inform6.wasm, and inblorb.wasm as pure WASI modules,
# plus the binary kit files (arch-*.interb) needed by inform7 at runtime.
#
# Prerequisites:
#   - pixi (for clang, lld)
#   - git
#   - wget
#   - C compiler (gcc or clang) for building native tools
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

# Detect a working C compiler for building native tools
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
echo "--- Step 1/8: Downloading WASI dependencies ---"

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
echo "--- Step 2/8: Initializing submodules ---"

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
echo "--- Step 3/8: Applying patches ---"

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
echo "--- Step 4/8: Building native inweb ---"

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
echo "--- Step 5/8: Regenerating tangled files ---"

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

# Tangle inbuild and inter (needed to build binary kits)
"$INWEB_BIN" inbuild -at "$SUB/inweb" -tangle
echo "  inbuild tangled"
"$INWEB_BIN" inter -at "$SUB/inweb" -tangle
echo "  inter tangled"

cd "$SCRIPT_DIR"

# ============================================================
# Step 6: Compile WASM binaries
# ============================================================
echo "--- Step 6/8: Compiling WASM binaries ---"

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
echo "--- Step 7/8: Copying Internal resources ---"

cp -r "$SUB/inform/inform7/Internal" "$BUILD/Internal"

# Copy generated Syntax.preform into place
cp "$SUB/inform/inform7/Tangled/Syntax.preform" "$BUILD/Internal/Languages/English/Syntax.preform"

# Create CSS copies for Linux platform
cp "$BUILD/Internal/HTML/main.css" "$BUILD/Internal/HTML/linux-main.css"
cp "$BUILD/Internal/HTML/platform.css" "$BUILD/Internal/HTML/linux-platform.css"

# ============================================================
# Step 8: Build binary kits (arch-*.interb files)
# ============================================================
echo "--- Step 8/8: Building binary kits ---"

# The binary kits (arch-*.interb) are needed by inform7 at runtime.
# Only EnglishLanguageKit has them pre-built in the submodule; the
# other four kits must be compiled from source.
#
# We build inbuild and inter natively (not WASM) since they are
# only build-time dependencies, then use inbuild to compile each kit.

# Compile native inbuild
INBUILD_BIN="$BUILD/inbuild-native"
if [ ! -f "$INBUILD_BIN" ]; then
    echo "  Compiling inbuild natively..."
    $NATIVE_CC -DPLATFORM_LINUX -DPLATFORM_POSIX \
        -I"$SUB/inweb/foundation-module" \
        -I"$SUB/inweb/foundation-module/Chapter 2" \
        -o "$INBUILD_BIN" "$SUB/inform/inbuild/Tangled/inbuild.c" -lm
    echo "  inbuild built ($(du -h "$INBUILD_BIN" | cut -f1))"
else
    echo "  inbuild already built"
fi

# Compile native inter (called by inbuild to build kits)
INTER_BIN="$BUILD/inter-native"
INTER_DIR="$BUILD/inter-native-dir"
if [ ! -f "$INTER_BIN" ]; then
    echo "  Compiling inter natively..."
    $NATIVE_CC -DPLATFORM_LINUX -DPLATFORM_POSIX \
        -I"$SUB/inweb/foundation-module" \
        -I"$SUB/inweb/foundation-module/Chapter 2" \
        -o "$INTER_BIN" "$SUB/inform/inter/Tangled/inter.c" -lm
    echo "  inter built ($(du -h "$INTER_BIN" | cut -f1))"
else
    echo "  inter already built"
fi

# Set up inter tool directory (needs Pipelines/ alongside it)
mkdir -p "$INTER_DIR"
cp "$INTER_BIN" "$INTER_DIR/inter"
cp -r "$BUILD/Internal/Pipelines" "$INTER_DIR/Pipelines"

# Build binary kits for all architectures
echo "  Building binary kits (this may take a while)..."
INFORM7_PATH="$BUILD/Internal" \
    "$INBUILD_BIN" \
    -internal "$BUILD/Internal" \
    -tools "$INTER_DIR" \
    -rebuild \
    -contents-of "$BUILD/Internal/Inter" \
    2>&1 | grep -v "^'"

echo "  Binary kits built:"
for kit in "$BUILD"/Internal/Inter/*/; do
    name=$(basename "$kit")
    count=$(ls "$kit"/arch-*.interb 2>/dev/null | wc -l)
    echo "    $name: $count arch files"
done

# Clean up native build tools (not needed at runtime)
rm -rf "$INTER_DIR"

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD/"*.wasm
echo ""
echo "Output in: $BUILD/"
echo "  inform7.wasm  — .ni -> .i6 compiler"
echo "  inform6.wasm  — .i6 -> .ulx compiler"
echo "  inblorb.wasm  — .ulx -> .gblorb packager"
echo "  Internal/     — resource files (CSS, templates, languages, kits)"
echo ""
echo "To compile a story:"
echo "  node examples/compile.mjs [project-dir]"
