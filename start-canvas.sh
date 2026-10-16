#!/usr/bin/env bash
set -e

PORT=3000
LOG_FILE="$HOME/Canvas/server.log"

echo "=== 检查并清理旧 Canvas 进程 ==="
python3 -c "
import os, signal, subprocess
ps = subprocess.run(['ps', '-eo', 'pid,cmd'], capture_output=True, text=True)
for line in ps.stdout.splitlines():
    if 'server.ts' in line and 'python' not in line:
        pid = int(line.strip().split()[0])
        try: os.kill(pid, signal.SIGKILL)
        except: pass
" || true
sleep 1

echo "=== 启动 Canvas 服务 (端口: $PORT, 域名: https://canvas.alibb123.ccwu.cc) ==="
cd /home/ubuntu/Canvas
nohup npx tsx server.ts > "$LOG_FILE" 2>&1 &
sleep 2

echo "Canvas 服务已在后台启动，日志记录于: $LOG_FILE"
cat "$LOG_FILE" | tail -n 10
