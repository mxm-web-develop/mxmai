#!/usr/bin/env bash
# 安装 Nginx 站点配置（需 root）
set -euo pipefail

DOMAIN="${1:-_}"
CONF_SRC="$(cd "$(dirname "$0")" && pwd)/nginx/supermxmai.conf"
CONF_DST="/etc/nginx/sites-available/supermxmai.conf"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请 sudo 运行: sudo bash $0 [domain]" >&2
  exit 1
fi

sed "s/YOUR_DOMAIN/$DOMAIN/g" "$CONF_SRC" > "$CONF_DST"
ln -sf "$CONF_DST" /etc/nginx/sites-enabled/supermxmai.conf
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx
echo "Nginx 已加载 supermxmai（server_name: $DOMAIN）"
