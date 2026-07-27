#!/usr/bin/env bash
# 香港主力机申请 Let's Encrypt 证书（certbot + nginx）
#
# 用法（项目根目录）:
#   DEPLOY_SSH_PASS='...' HK_SSH_PASS='...' bash scripts/setup-ssl-hk.sh
#   CERTBOT_EMAIL=you@example.com bash scripts/setup-ssl-hk.sh
#
# 前置：
#   - mxm-ai.com / www 的 DNS 境外线路需解析到香港机（8.218.14.129）
#   - 阿里云安全组放行 TCP 80、443

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-mxm-ai.com}"
CN_HOST="${CN_HOST:-root@8.136.186.242}"
HK_HOST="${HK_HOST:-mxm-hk}"
HK_IP="${HK_IP:-8.218.14.129}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN}}"
HK_PUBLIC_ORIGIN="${HK_PUBLIC_ORIGIN:-https://${DOMAIN}}"

log() { echo "[setup-ssl-hk] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$@"
  fi
}

ssh_hk_via_edge() {
  local remote_cmd="$1"
  local hk_pass="${HK_SSH_PASS:-${DEPLOY_SSH_PASS:-}}"
  if [[ -z "$hk_pass" ]]; then
    ssh_cmd "$CN_HOST" "ssh -o StrictHostKeyChecking=accept-new ${HK_HOST} $(printf '%q' "$remote_cmd")"
  else
    ssh_cmd "$CN_HOST" "command -v sshpass >/dev/null || (export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get install -y -qq sshpass); SSHPASS='$hk_pass' sshpass -e ssh -o StrictHostKeyChecking=accept-new ${HK_HOST} $(printf '%q' "$remote_cmd")"
  fi
}

log "检查 DNS（${DOMAIN} → ${HK_IP}）..."
RESOLVED="$(ssh_cmd "$CN_HOST" "dig +short ${DOMAIN} @8.8.8.8 | tail -1")"
if [[ "$RESOLVED" != "$HK_IP" ]]; then
  echo "警告: ${DOMAIN} 当前解析为 ${RESOLVED:-空}，期望 ${HK_IP}。certbot 可能失败。" >&2
fi

log "安装 certbot 并申请证书..."
CERT_CMD=$(cat <<EOF
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx
ufw allow 443/tcp 2>/dev/null || true
if certbot certificates 2>/dev/null | grep -q "Certificate Name: ${DOMAIN}"; then
  certbot renew --nginx --quiet || certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} \\
    --non-interactive --agree-tos --email ${CERTBOT_EMAIL} --redirect --no-eff-email
else
  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} \\
    --non-interactive --agree-tos --email ${CERTBOT_EMAIL} --redirect --no-eff-email
fi
nginx -t
systemctl reload nginx
EOF
)
ssh_hk_via_edge "$CERT_CMD"

log "更新香港 PUBLIC_GATEWAY_ORIGIN → ${HK_PUBLIC_ORIGIN} ..."
CN_ADMIN_ORIGIN="http://${DOMAIN}:8080"
CN_IP="${CN_HOST#*@}"
CN_ADMIN_ORIGIN_IP="http://${CN_IP}:8080"
CORS_VAL="${HK_PUBLIC_ORIGIN},https://www.${DOMAIN},${CN_ADMIN_ORIGIN},${CN_ADMIN_ORIGIN_IP},http://${CN_IP},http://localhost:3000"

PATCH_CMD=$(cat <<EOF
set -euo pipefail
cd /opt/supermxmai
if grep -q '^PUBLIC_GATEWAY_ORIGIN=' .env; then
  sed -i 's|^PUBLIC_GATEWAY_ORIGIN=.*|PUBLIC_GATEWAY_ORIGIN=${HK_PUBLIC_ORIGIN}|' .env
else
  echo 'PUBLIC_GATEWAY_ORIGIN=${HK_PUBLIC_ORIGIN}' >> .env
fi
if grep -q '^CORS_ORIGIN=' .env; then
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=${CORS_VAL}|' .env
else
  echo 'CORS_ORIGIN=${CORS_VAL}' >> .env
fi
if [[ -f /etc/default/minio ]]; then
  source /etc/default/minio
  MINIO_ACCESS_KEY=\${MINIO_ROOT_USER} MINIO_SECRET_KEY=\${MINIO_ROOT_PASSWORD} \\
    PUBLIC_GATEWAY_ORIGIN=${HK_PUBLIC_ORIGIN} \\
    bash /opt/supermxmai/scripts/patch-env-minio-local.sh /opt/supermxmai/.env
fi
pm2 reload all --update-env
EOF
)
ssh_hk_via_edge "$PATCH_CMD"

log "验收..."
HTTPS_CODE="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 https://${DOMAIN}/")"
HTTP_CODE="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code} redirect=%{redirect_url}' --connect-timeout 10 http://${DOMAIN}/")"
API_CODE="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 https://${DOMAIN}/api/v1/account/captcha/config")"

echo "  https://${DOMAIN}/        => HTTP ${HTTPS_CODE}"
echo "  http://${DOMAIN}/         => ${HTTP_CODE}"
echo "  https://${DOMAIN}/api/... => HTTP ${API_CODE}"

cat <<EOF

════════════════════════════════════════════════════════════
香港 HTTPS 已配置

  访问: ${HK_PUBLIC_ORIGIN}
  证书: certbot 自动续期（/etc/cron.d/certbot）

若内地用户 DNS 指向副机，需在 8.136.186.242 单独再跑一套证书脚本（后续可加 setup-ssl-cn.sh）。
EOF
