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

BASE_DIR="/home/deploy/cv"
SITE_ROOT="/opt/1panel/www/sites/codes123/index"
RELEASE_DIR="$BASE_DIR/releases/$DEPLOY_SHA"
STATIC_STAGE="$BASE_DIR/static-$DEPLOY_SHA"
ENV_FILE="$BASE_DIR/env/quant-service.env"

mkdir -p "$BASE_DIR"/releases "$BASE_DIR"/env "$BASE_DIR"/data \
  "$BASE_DIR"/bin "$BASE_DIR"/run "$BASE_DIR"/logs

[[ -d "$RELEASE_DIR" ]] || {
  printf 'release 不存在：%s\n' "$RELEASE_DIR" >&2
  exit 1
}
[[ -s "$RELEASE_DIR/quant-service" && -s "$RELEASE_DIR/frontend.tar.gz" && \
  -s "$RELEASE_DIR/start-quant-service.sh" ]] || {
  printf '上传的 release 不完整：%s\n' "$RELEASE_DIR" >&2
  exit 1
}
# GitHub Artifact downloads may normalize file modes to 0644.
chmod 755 "$RELEASE_DIR/quant-service"
[[ -w "$SITE_ROOT" ]] || {
  printf '站点目录不可写：%s\n' "$SITE_ROOT" >&2
  exit 1
}
[[ -r "$ENV_FILE" ]] || {
  printf '首次部署前必须创建生产环境文件：%s\n' "$ENV_FILE" >&2
  printf '请填写 OKX、SMTP 等配置，并设置 chmod 600。\n' >&2
  exit 1
}

install -m 0755 "$RELEASE_DIR/start-quant-service.sh" "$BASE_DIR/bin/start-quant-service.sh"
ln -sfn "$RELEASE_DIR" "$BASE_DIR/current.next"
mv -Tf "$BASE_DIR/current.next" "$BASE_DIR/current"
"$BASE_DIR/bin/start-quant-service.sh"

rm -rf "$STATIC_STAGE"
mkdir -p "$STATIC_STAGE"
tar -xzf "$RELEASE_DIR/frontend.tar.gz" -C "$STATIC_STAGE"
test -s "$STATIC_STAGE/index.html"
rsync -a --delete "$STATIC_STAGE/" "$SITE_ROOT/"
rm -rf "$STATIC_STAGE"

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
