#!/usr/bin/env bash
set -euo pipefail

[[ $# == 1 ]] || {
  printf '用法：remote-deploy.sh <commit-sha>\n' >&2
  exit 2
}

DEPLOY_SHA="$1"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  printf '提交 SHA 无效\n' >&2
  exit 2
}

BASE_DIR="${CV_DEPLOY_ROOT:-$HOME/cv}"
SITE_ROOT="${CV_SITE_ROOT:-/www/sites/codes123/index}"
RELEASE_DIR="$BASE_DIR/releases/$DEPLOY_SHA"
ENV_FILE="$BASE_DIR/env/quant-service.env"

mkdir -p "$BASE_DIR/releases" "$BASE_DIR/env" "$BASE_DIR/data" \
  "$BASE_DIR/bin" "$BASE_DIR/run" "$BASE_DIR/logs"
chmod 700 "$BASE_DIR/env" "$BASE_DIR/data" "$BASE_DIR/run" "$BASE_DIR/logs"

[[ -d "$RELEASE_DIR" && -s "$RELEASE_DIR/quant-service" && \
  -s "$RELEASE_DIR/frontend.tar.gz" && \
  -s "$RELEASE_DIR/start-quant-service.sh" && \
  -s "$RELEASE_DIR/quant-service.env.example" ]] || {
  printf '上传的 release 不完整：%s\n' "$RELEASE_DIR" >&2
  exit 1
}
[[ -d "$SITE_ROOT" && -w "$SITE_ROOT" ]] || {
  printf '1Panel 网站目录不存在或不可写：%s\n' "$SITE_ROOT" >&2
  exit 1
}
if [[ -e "$BASE_DIR/current" && ! -L "$BASE_DIR/current" ]]; then
  printf '部署路径已存在且 current 不是 release 链接，拒绝覆盖：%s/current\n' "$BASE_DIR" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled --quiet quant-service.service 2>/dev/null; then
  printf '检测到仍启用的 quant-service systemd 单元；请先执行 sudo systemctl disable --now quant-service.service\n' >&2
  exit 1
fi

# Refuse to claim the assigned port if it belongs to another application.
listeners="$(ss -H -ltn "sport = :18188")"
if [[ -n "$listeners" ]]; then
  own_pid="$(cat "$BASE_DIR/run/quant-service.pid" 2>/dev/null || true)"
  own_command=""
  if [[ "$own_pid" =~ ^[0-9]+$ ]] && kill -0 "$own_pid" 2>/dev/null; then
    own_command="$(ps -p "$own_pid" -o args= 2>/dev/null || true)"
  fi
  if [[ "$own_command" != *"$BASE_DIR/current/quant-service"* ]]; then
    ss -ltnp "sport = :18188" >&2 || true
    printf '端口 18188 已被其他项目占用，拒绝部署\n' >&2
    exit 1
  fi
fi

chmod 755 "$RELEASE_DIR/quant-service" "$RELEASE_DIR/start-quant-service.sh"
install -m 0755 "$RELEASE_DIR/start-quant-service.sh" "$BASE_DIR/bin/start-quant-service.sh"

# Install only a safe template on first deployment; never overwrite server secrets.
if [[ ! -e "$ENV_FILE" ]]; then
  install -m 0600 "$RELEASE_DIR/quant-service.env.example" "$ENV_FILE"
fi
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || {
  printf '运行配置不是普通文件，拒绝使用：%s\n' "$ENV_FILE" >&2
  exit 1
}
chmod 600 "$ENV_FILE"

previous_release="$(readlink "$BASE_DIR/current" 2>/dev/null || true)"
ln -sfn "$RELEASE_DIR" "$BASE_DIR/current.next"
mv -Tf "$BASE_DIR/current.next" "$BASE_DIR/current"

if ! "$BASE_DIR/bin/start-quant-service.sh"; then
  if [[ -n "$previous_release" ]]; then
    ln -sfn "$previous_release" "$BASE_DIR/current.rollback"
    mv -Tf "$BASE_DIR/current.rollback" "$BASE_DIR/current"
    "$BASE_DIR/bin/start-quant-service.sh" || true
  fi
  exit 1
fi

static_stage="$(mktemp -d "$BASE_DIR/static-stage.XXXXXX")"
trap 'rm -rf "$static_stage"' EXIT
tar -xzf "$RELEASE_DIR/frontend.tar.gz" -C "$static_stage"
[[ -s "$static_stage/index.html" ]] || {
  printf '前端 release 缺少 index.html\n' >&2
  exit 1
}
rsync -a --delete "$static_stage/" "$SITE_ROOT/"

if command -v crontab >/dev/null 2>&1; then
  cron_tmp="$(mktemp)"
  crontab -l 2>/dev/null | grep -v '# cv-quant-service' >"$cron_tmp" || true
  printf '@reboot %s/bin/start-quant-service.sh # cv-quant-service\n' "$BASE_DIR" >>"$cron_tmp"
  crontab "$cron_tmp"
  rm -f "$cron_tmp"
else
  printf '警告：服务器没有 crontab，重启后需重新运行部署工作流。\n' >&2
fi

printf '部署完成：%s\n' "$DEPLOY_SHA"
