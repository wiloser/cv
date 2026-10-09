#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${CV_DEPLOY_ROOT:-$HOME/cv}"
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

mkdir -p "$RUN_DIR" "$LOG_DIR" "$DATA_DIR" "$(dirname "$ENV_FILE")"
chmod 700 "$RUN_DIR" "$LOG_DIR" "$DATA_DIR" "$(dirname "$ENV_FILE")"

if [[ -f "$ENV_FILE" ]]; then
  [[ -r "$ENV_FILE" ]] || {
    printf '运行配置不可读：%s\n' "$ENV_FILE" >&2
    exit 1
  }
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Keep production networking and data isolated even if the env file contains
# local-development values from .env.example.
export HTTP_ADDR="127.0.0.1:$PORT"
export DATA_DIR

# A previously installed system service must be disabled by an administrator
# once before switching to this deploy-user process manager.
if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled --quiet quant-service.service 2>/dev/null; then
  printf '检测到仍启用的 quant-service systemd 单元；请先执行 sudo systemctl disable --now quant-service.service\n' >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    old_command="$(ps -p "$old_pid" -o args= 2>/dev/null || true)"
    if [[ "$old_command" == *"$BASE_DIR/current/quant-service"* ]]; then
      kill "$old_pid"
      for _ in {1..30}; do
        kill -0 "$old_pid" 2>/dev/null || break
        sleep 0.2
      done
      old_command="$(ps -p "$old_pid" -o args= 2>/dev/null || true)"
      if kill -0 "$old_pid" 2>/dev/null && [[ "$old_command" == *"$BASE_DIR/current/quant-service"* ]]; then
        kill -KILL "$old_pid"
      fi
    else
      printf '忽略不属于本项目的旧 PID：%s\n' "$old_pid" >&2
    fi
  fi
  rm -f "$PID_FILE"
fi

command -v ss >/dev/null 2>&1 || {
  printf '服务器缺少 ss（iproute2），无法安全检查端口 %s\n' "$PORT" >&2
  exit 1
}
listeners="$(ss -H -ltn "sport = :$PORT")"
if [[ -n "$listeners" ]]; then
  ss -ltnp "sport = :$PORT" >&2 || true
  printf '端口 %s 已被其他进程占用，拒绝启动量化服务\n' "$PORT" >&2
  exit 1
fi

cd "$BASE_DIR"
nohup "$BINARY" >>"$LOG_DIR/quant-service.log" 2>&1 </dev/null &
new_pid="$!"
printf '%s\n' "$new_pid" >"$PID_FILE"

for _ in {1..90}; do
  if curl --fail --silent "http://127.0.0.1:$PORT/healthz" >/dev/null; then
    printf 'PASS quant service (127.0.0.1:%s)\n' "$PORT"
    exit 0
  fi
  if ! kill -0 "$new_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

printf '量化服务健康检查失败，日志：%s\n' "$LOG_DIR/quant-service.log" >&2
tail -n 80 "$LOG_DIR/quant-service.log" >&2 || true
new_command="$(ps -p "$new_pid" -o args= 2>/dev/null || true)"
if kill -0 "$new_pid" 2>/dev/null && [[ "$new_command" == *"$BASE_DIR/current/quant-service"* ]]; then
  kill "$new_pid" || true
fi
rm -f "$PID_FILE"
exit 1
