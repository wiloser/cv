#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/home/deploy/cv"
CURRENT_DIR="$BASE_DIR/current"
RUN_DIR="$BASE_DIR/run"
LOG_DIR="$BASE_DIR/logs"
DATA_DIR="$BASE_DIR/data"
ENV_FILE="$BASE_DIR/env/quant-service.env"
PID_FILE="$RUN_DIR/quant-service.pid"
BINARY="$CURRENT_DIR/quant-service"
PORT=18188

[[ -x "$BINARY" ]] || {
  printf '量化服务二进制不存在或不可执行：%s\n' "$BINARY" >&2
  exit 1
}
[[ -r "$ENV_FILE" ]] || {
  printf '生产环境文件不存在：%s\n' "$ENV_FILE" >&2
  printf '请填写 OKX、SMTP 等配置后再部署。\n' >&2
  exit 1
}

mkdir -p "$RUN_DIR" "$LOG_DIR" "$DATA_DIR"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    old_command="$(ps -p "$old_pid" -o args= 2>/dev/null || true)"
    if [[ "$old_command" == *"$CURRENT_DIR/quant-service"* ]]; then
      kill "$old_pid"
      for _ in {1..30}; do
        kill -0 "$old_pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -0 "$old_pid" 2>/dev/null && kill -KILL "$old_pid"
    else
      printf '忽略不属于本项目的旧 PID：%s\n' "$old_pid" >&2
    fi
  fi
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export HTTP_ADDR="127.0.0.1:$PORT"
export DATA_DIR="$DATA_DIR"

cd "$BASE_DIR"
nohup "$BINARY" \
  >>"$LOG_DIR/quant-service.log" 2>&1 < /dev/null &
printf '%s\n' "$!" >"$PID_FILE"

for _ in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:$PORT/healthz" >/dev/null; then
    printf 'PASS quant service (127.0.0.1:%s)\n' "$PORT"
    exit 0
  fi
  sleep 1
done

printf '量化服务健康检查失败，日志：%s\n' "$LOG_DIR/quant-service.log" >&2
tail -n 80 "$LOG_DIR/quant-service.log" >&2 || true
exit 1
