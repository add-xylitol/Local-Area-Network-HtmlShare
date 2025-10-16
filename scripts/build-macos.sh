#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
BIN_DIR="$DIST/bin"
RELEASE_DIR="$DIST/release"
PUBLIC_SRC="$ROOT/public"
START_SCRIPT="$ROOT/AxureShare.command"
STOP_SCRIPT="$ROOT/StopAxureShare.command"
README_SRC="$ROOT/README.md"

TARGETS=("node18-macos-arm64" "node18-macos-x64")

echo "清理 dist 目录..."
rm -rf "$DIST"
mkdir -p "$BIN_DIR" "$RELEASE_DIR"

echo "构建可执行文件..."
for target in "${TARGETS[@]}"; do
  ARCH="${target#node18-}"
  OUTPUT="$BIN_DIR/axure-share-${ARCH}"
  echo "  -> $target"
  npx pkg "$ROOT/server.js" --targets "$target" --output "$OUTPUT"
  chmod +x "$OUTPUT"
done

copy_release_assets() {
  local dest_dir="$1"
  mkdir -p "$dest_dir"
  rsync -a "$PUBLIC_SRC/" "$dest_dir/public/"
  mkdir -p "$dest_dir/data/uploads" "$dest_dir/data/sites" "$dest_dir/logs"
  cp "$START_SCRIPT" "$dest_dir/AxureShare.command"
  cp "$STOP_SCRIPT" "$dest_dir/StopAxureShare.command"
  chmod +x "$dest_dir/AxureShare.command" "$dest_dir/StopAxureShare.command"
  cp "$README_SRC" "$dest_dir/README.md"
}

echo "整理发布包..."
for target in "${TARGETS[@]}"; do
  ARCH="${target#node18-}"
  case "$ARCH" in
    macos-arm64) LABEL="macOS-arm64" ;;
    macos-x64) LABEL="macOS-x64" ;;
    *) LABEL="$ARCH" ;;
  esac
  DEST="$RELEASE_DIR/AxureShare-${LABEL}"
  copy_release_assets "$DEST"
  cp "$BIN_DIR/axure-share-${ARCH}" "$DEST/axure-share"
  chmod +x "$DEST/axure-share"
  (cd "$RELEASE_DIR" && zip -qry "AxureShare-${LABEL}.zip" "AxureShare-${LABEL}")
done

echo "完成。发布包位于 $RELEASE_DIR"
