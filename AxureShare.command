#!/bin/bash

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LOG_DIR="$DIR/logs"
LOG_FILE="$LOG_DIR/axure-share.log"
PID_FILE="$DIR/server.pid"
PORT="${PORT:-3000}"
EXECUTABLE="$DIR/axure-share"

mkdir -p "$LOG_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1，请先安装 Node.js（包含 npm）。"
    exit 1
  fi
}

if [ ! -x "$EXECUTABLE" ]; then
  require_command node
  require_command npm
fi

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [ -n "$EXISTING_PID" ] && ps -p "$EXISTING_PID" >/dev/null 2>&1; then
    echo "服务已在运行 (PID $EXISTING_PID)。"
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:${PORT}/"
    fi
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

START_ENV=("PORT=$PORT")
START_CMD=()

if [ -x "$EXECUTABLE" ]; then
  echo "检测到独立可执行文件，直接启动..."
  START_CMD=("$EXECUTABLE")
else
  if [ ! -d "$DIR/node_modules" ]; then
    echo "安装依赖..."
    npm install --production
  fi
  START_ENV+=("NODE_ENV=production")
  START_CMD=("node" "$DIR/server.js")
fi

echo "启动服务..."
nohup env "${START_ENV[@]}" "${START_CMD[@]}" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

READY=0
if command -v curl >/dev/null 2>&1; then
  for _ in {1..30}; do
    if curl --silent --fail "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 1
  done
else
  sleep 2
fi

if ! ps -p "$SERVER_PID" >/dev/null 2>&1; then
  echo "服务进程已退出，请查看日志：$LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

echo "服务已启动，PID: $SERVER_PID"
echo "日志文件：$LOG_FILE"
if [ "$READY" -eq 1 ]; then
  echo "健康检查通过，打开页面..."
else
  echo "健康检查暂未通过，请稍后手动访问。"
fi

if command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}/"
else
  echo "请在浏览器中打开：http://localhost:${PORT}/"
fi

exit 0
