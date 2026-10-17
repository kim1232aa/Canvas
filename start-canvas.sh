#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PORT="${PORT:-3000}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/server.log}"

echo "=== 检查并清理旧 Canvas 进程（仅本目录的 server.ts） ==="
old_pids=()
for pid in $(pgrep -f 'server\.ts' || true); do
  [ "$pid" = "$$" ] && continue
  if [ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)" = "$SCRIPT_DIR" ]; then
    old_pids+=("$pid")
  fi
done

if [ "${#old_pids[@]}" -gt 0 ]; then
  kill -TERM "${old_pids[@]}" 2>/dev/null || true
  # 给 5 秒优雅退出（让进行中的写入收尾），仍存活再强杀
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    alive=0
    for pid in "${old_pids[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 0.5
  done
  for pid in "${old_pids[@]}"; do
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  done
fi

echo "=== 启动 Canvas 服务 (端口: $PORT) ==="
cd "$SCRIPT_DIR"
nohup npx tsx server.ts > "$LOG_FILE" 2>&1 &
sleep 2

echo "Canvas 服务已在后台启动: http://127.0.0.1:$PORT${CANVAS_PUBLIC_URL:+  (公网: $CANVAS_PUBLIC_URL)}"
echo "日志: $LOG_FILE"
tail -n 10 "$LOG_FILE"
