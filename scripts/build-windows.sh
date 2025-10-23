#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
RELEASE_DIR="$DIST/release"
PUBLIC_SRC="$ROOT/public"
START_BAT="$ROOT/AxureShare.bat"
START_PS1="$ROOT/AxureShare.ps1"
STOP_BAT="$ROOT/StopAxureShare.bat"
STOP_PS1="$ROOT/StopAxureShare.ps1"
README_SRC="$ROOT/README.md"

NODE_VERSION="18.20.3"
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
WIN_ZIP="node-v${NODE_VERSION}-win-x64.zip"

download_node() {
  local archive="$1"
  local url="$2"
  local cache_dir="$ROOT/.cache"
  local cache_path="$cache_dir/$archive"

  mkdir -p "$cache_dir"
  if [ -f "$cache_path" ]; then
    printf "使用缓存的 Node 包：%s\n" "$archive" >&2
  else
    printf "下载 Node：%s\n" "$archive" >&2
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
  cp "$START_BAT" "$dest/AxureShare.bat"
  cp "$START_PS1" "$dest/AxureShare.ps1"
  cp "$STOP_BAT" "$dest/StopAxureShare.bat"
  cp "$STOP_PS1" "$dest/StopAxureShare.ps1"
  cp "$README_SRC" "$dest/README.md"

  if [ -d "$ROOT/node_modules" ]; then
    rsync -a "$ROOT/node_modules/" "$dest/node_modules/"
  fi

  mkdir -p "$dest/data/uploads" "$dest/data/sites" "$dest/logs"
}

cleanup_node_bundle() {
  local dest="$1"
  find "$dest/node" -name "*.pdb" -delete || true
}

prepare_bundle() {
  local dest="$RELEASE_DIR/AxureShare-windows-x64"
  local zip_path="$1"
  local node_dir="node-v${NODE_VERSION}-win-x64"

  echo "=== 构建 Windows-x64 发布包 ==="
  rm -rf "$dest"
  mkdir -p "$dest"

  copy_project_files "$dest"

  echo "解压 Node..."
  unzip -q "$zip_path" -d "$dest"
  mv "$dest/$node_dir" "$dest/node"

  cleanup_node_bundle "$dest"

  (cd "$dest" && find . -name "*.DS_Store" -delete)

  (cd "$RELEASE_DIR" && zip -qry "AxureShare-windows-x64.zip" "AxureShare-windows-x64")
}

echo "准备 dist 目录..."
mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR/AxureShare-windows-x64" "$RELEASE_DIR/AxureShare-windows-x64.zip"

ZIP_PATH="$(download_node "$WIN_ZIP" "$NODE_BASE_URL/$WIN_ZIP")"

prepare_bundle "$ZIP_PATH"

echo "完成。发布包位于 $DIST"
