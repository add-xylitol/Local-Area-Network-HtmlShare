#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "未找到运行中的服务。"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [ -z "$PID" ]; then
  echo "PID 文件为空，清理后退出。"
  rm -f "$PID_FILE"
  exit 0
fi

if ps -p "$PID" >/dev/null 2>&1; then
  echo "停止服务 (PID $PID)..."
  kill "$PID"
  sleep 1
  if ps -p "$PID" >/dev/null 2>&1; then
    echo "进程仍在运行，尝试强制结束..."
    kill -9 "$PID" >/dev/null 2>&1 || true
  fi
  echo "服务已停止。"
else
  echo "进程 $PID 未在运行。"
fi

rm -f "$PID_FILE"

exit 0
