#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
RELEASE_DIR="$DIST/release"
PUBLIC_SRC="$ROOT/public"
START_SCRIPT="$ROOT/AxureShare.command"
STOP_SCRIPT="$ROOT/StopAxureShare.command"
README_SRC="$ROOT/README.md"

NODE_VERSION="18.20.3"
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
ARM64_TAR="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
X64_TAR="node-v${NODE_VERSION}-darwin-x64.tar.gz"

download_node() {
  local tarball="$1"
  local url="$2"
  local cache_dir="$ROOT/.cache"
  local cache_path="$cache_dir/$tarball"

  mkdir -p "$cache_dir"
  if [ -f "$cache_path" ]; then
    printf "使用缓存的 Node 包：%s\n" "$tarball" >&2
  else
    printf "下载 Node：%s\n" "$tarball" >&2
    curl -L --fail --retry 3 --retry-delay 2 "$url" -o "$cache_path"
  fi
  echo "$cache_path"
}

copy_project_files() {
  local dest="$1"
  mkdir -p "$dest"

  rsync -a "$PUBLIC_SRC/" "$dest/public/"
  cp "$ROOT/server.js" "$dest/server.js"
  cp "$ROOT/package.json" "$dest/package.json"
  cp "$ROOT/package-lock.json" "$dest/package-lock.json"
  cp "$START_SCRIPT" "$dest/AxureShare.command"
  cp "$STOP_SCRIPT" "$dest/StopAxureShare.command"
  cp "$README_SRC" "$dest/README.md"
  chmod +x "$dest/AxureShare.command" "$dest/StopAxureShare.command"

  if [ -d "$ROOT/node_modules" ]; then
    rsync -a "$ROOT/node_modules/" "$dest/node_modules/"
  fi

  mkdir -p "$dest/data/uploads" "$dest/data/sites" "$dest/logs"
}

cleanup_node_bundle() {
  local dest="$1"
  rm -rf "$dest/node/lib/node_modules/npm/docs" \
         "$dest/node/lib/node_modules/npm/html" \
         "$dest/node/lib/node_modules/npm/man"
  chmod +x "$dest/node/bin/"*
}

prepare_bundle() {
  local label="$1"
  local tarball_path="$2"
  local arch="$3"
  local dest="$RELEASE_DIR/AxureShare-${label}"
  local node_dir="node-v${NODE_VERSION}-darwin-${arch}"

  echo "=== 构建 $label 发布包 ==="
  rm -rf "$dest"
  mkdir -p "$dest"

  copy_project_files "$dest"

  echo "解压 Node..."
  tar -xzf "$tarball_path" -C "$dest"
  mv "$dest/$node_dir" "$dest/node"

  cleanup_node_bundle "$dest"

  (cd "$dest" && find . -name "*.DS_Store" -delete)

  (cd "$RELEASE_DIR" && zip -qry "AxureShare-${label}.zip" "AxureShare-${label}")
}

echo "准备 dist 目录..."
mkdir -p "$RELEASE_DIR"
rm -rf \
  "$RELEASE_DIR/AxureShare-macOS-arm64" \
  "$RELEASE_DIR/AxureShare-macOS-arm64.zip" \
  "$RELEASE_DIR/AxureShare-macOS-x64" \
  "$RELEASE_DIR/AxureShare-macOS-x64.zip"

ARM64_PATH="$(download_node "$ARM64_TAR" "$NODE_BASE_URL/$ARM64_TAR")"
X64_PATH="$(download_node "$X64_TAR" "$NODE_BASE_URL/$X64_TAR")"

prepare_bundle "macOS-arm64" "$ARM64_PATH" "arm64"
prepare_bundle "macOS-x64" "$X64_PATH" "x64"

echo "完成。发布包位于 $DIST"
