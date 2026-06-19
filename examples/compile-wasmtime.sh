#!/usr/bin/env bash
# compile-wasmtime.sh — Compile an Inform 7 story to a playable .gblorb file
#                       using pure WASM binaries via wasmtime.
#
# Usage: ./compile-wasmtime.sh [project-dir]
#
# If no project directory is given, compiles the example story at
# examples/hello/.
#
# Requires: wasmtime (https://wasmtime.dev/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/build"
INTERNAL="$BUILD_DIR/Internal"
EXTENSIONS="$SCRIPT_DIR/extensions"

INFORM7="$BUILD_DIR/inform7.wasm"
INFORM6="$BUILD_DIR/inform6.wasm"
INBLORB="$BUILD_DIR/inblorb.wasm"

# Determine project directory
if [ $# -ge 1 ]; then
    PROJECT="$1"
else
    PROJECT="$SCRIPT_DIR/hello"
fi

if [ ! -f "$PROJECT/Source/story.ni" ]; then
    echo "Error: $PROJECT/Source/story.ni not found" >&2
    echo "Usage: $0 [project-dir]" >&2
    exit 1
fi

# Get the parent directory so inform7 can create .materials folder alongside the project
PROJECT_PARENT="$(dirname "$PROJECT")"
PROJECT_LEAF="$(basename "$PROJECT")"

echo "=== Inform 7 WASM Toolchain (wasmtime) ==="
echo "Project: $PROJECT"
echo ""

# Step 1: Compile .ni -> .i6 with inform7
echo "--- Step 1/3: Compiling source to I6 (inform7) ---"
wasmtime run \
    --dir "$PROJECT" \
    --dir "$PROJECT_PARENT" \
    --dir "$INTERNAL::/inform7/Internal" \
    --dir "$EXTENSIONS::/extensions" \
    --env INFORM7_PATH=/inform7/Internal \
    "$INFORM7" \
    -project "$PROJECT" \
    -internal /inform7/Internal \
    -external /extensions \
    2>&1 | grep -v "^$" || true

if [ ! -f "$PROJECT/Build/auto.inf" ]; then
    echo "Error: inform7 failed to produce auto.inf" >&2
    exit 1
fi
echo "  -> $(du -h "$PROJECT/Build/auto.inf" | cut -f1) I6 source generated"
echo ""

# Step 2: Compile .i6 -> .ulx with inform6
echo "--- Step 2/3: Compiling I6 to Glulx (inform6) ---"
wasmtime run \
    --dir "$PROJECT" \
    "$INFORM6" \
    -E2SwG "$PROJECT/Build/auto.inf" "$PROJECT/Build/output.ulx" \
    2>&1 | grep -v "^$" || true

if [ ! -f "$PROJECT/Build/output.ulx" ]; then
    echo "Error: inform6 failed to produce output.ulx" >&2
    exit 1
fi
echo "  -> $(du -h "$PROJECT/Build/output.ulx" | cut -f1) Glulx story file"
echo ""

# Step 3: Package .ulx -> .gblorb with inblorb
echo "--- Step 3/3: Packaging to blorb (inblorb) ---"
wasmtime run \
    --dir "$PROJECT" \
    --dir "$INTERNAL::/inform7/Internal" \
    --env INFORM7_PATH=/inform7/Internal \
    "$INBLORB" \
    -project "$PROJECT" \
    2>&1 | grep -v "^$" || true

# Find the blorb file (inblorb writes to Build/output.zblorb)
if [ -f "$PROJECT/Build/output.zblorb" ]; then
    cp "$PROJECT/Build/output.zblorb" "$PROJECT/Build/story.gblorb"
    echo "  -> $(du -h "$PROJECT/Build/story.gblorb" | cut -f1) blorb file"
fi

echo ""
echo "=== Done ==="
echo "Output files in $PROJECT/Build/:"
ls -lh "$PROJECT/Build/"*.ulx "$PROJECT/Build/"*.gblorb "$PROJECT/Build/"*.inf 2>/dev/null || true
