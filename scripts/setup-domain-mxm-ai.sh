#!/usr/bin/env bash
# mxm-ai.com 境内外分流：境外 → 香港主力；境内 → 副机 :8080 Admin
#
# 前置：在域名 DNS 控制台配置「分线路解析」（见脚本末尾说明）
#
# 用法（项目根目录）:
#   DEPLOY_SSH_PASS='...' HK_SSH_PASS='...' bash scripts/setup-domain-mxm-ai.sh
#   bash scripts/setup-domain-mxm-ai.sh --dns-only   # 仅打印 DNS 说明
#
# 环境变量:
#   DOMAIN=mxm-ai.com
#   CN_HOST=root@8.136.186.242
#   HK_HOST=mxm-hk   # 或 root@8.218.14.129（Port 2222）
#   HK_PUBLIC_ORIGIN=http://mxm-ai.com          # 境外用户看到的入口（有 HTTPS 后改 https://）
#   CN_ADMIN_ORIGIN=http://mxm-ai.com:8080      # 内地 Admin 入口（写入香港 CORS / MinIO）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-mxm-ai.com}"
CN_HOST="${CN_HOST:-root@8.136.186.242}"
CN_IP="${CN_HOST#*@}"
HK_HOST="${HK_HOST:-mxm-hk}"
HK_IP="${HK_IP:-8.218.14.129}"
HK_PUBLIC_ORIGIN="${HK_PUBLIC_ORIGIN:-http://${DOMAIN}}"
CN_ADMIN_ORIGIN="${CN_ADMIN_ORIGIN:-http://${DOMAIN}:8080}"
CN_ADMIN_ORIGIN_IP="${CN_ADMIN_ORIGIN_IP:-http://${CN_IP}:8080}"

DNS_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dns-only) DNS_ONLY=true ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

log() { echo "[setup-domain-mxm-ai] $*"; }

print_dns_guide() {
  cat <<EOF

════════════════════════════════════════════════════════════
DNS 分线路解析（mxm-ai.com / www.mxm-ai.com）

在域名注册商或阿里云「云解析 DNS」为 ${DOMAIN} 添加记录：

  记录类型   主机记录   线路类型        记录值
  ─────────────────────────────────────────────────
  A          @          境外            ${HK_IP}
  A          www        境外            ${HK_IP}
  A          @          默认/境内       ${CN_IP}
  A          www        默认/境内       ${CN_IP}

说明：
  • 境外用户 → ${HK_PUBLIC_ORIGIN}（香港 nginx :80，Admin + API）
  • 内地用户 → http://${DOMAIN}/ 自动 302 → ${CN_ADMIN_ORIGIN}
  • H5 仍可直接用 http://${CN_IP}/（:80，不经域名跳转）
  • 安全组：${CN_IP} 放行 TCP 80、8080；${HK_IP} 放行 TCP 80（HTTPS 另加 443）

可选：香港机申请 SSL 后把 HK_PUBLIC_ORIGIN 改为 https://${DOMAIN} 并 reload pm2。

EOF
}

if [[ "$DNS_ONLY" == true ]]; then
  print_dns_guide
  exit 0
fi

ssh_cmd() {
  local host="$1"
  shift
  local pass_var
  if [[ "$host" == "$CN_HOST" ]]; then pass_var="${DEPLOY_SSH_PASS:-}"; else pass_var="${HK_SSH_PASS:-${DEPLOY_SSH_PASS:-}}"; fi
  if [[ -n "$pass_var" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$pass_var" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$host" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$host" "$@"
  fi
}

rsync_cmd() {
  local host="$1"
  shift
  local pass_var
  if [[ "$host" == "$CN_HOST" ]]; then pass_var="${DEPLOY_SSH_PASS:-}"; else pass_var="${HK_SSH_PASS:-${DEPLOY_SSH_PASS:-}}"; fi
  if [[ -n "$pass_var" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$pass_var" sshpass -e rsync -az "$@"
  else
    rsync -az "$@"
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

log "内地副机：安装 mxm-ai.com → :8080 跳转 + Admin server_name..."
rsync_cmd "$CN_HOST" "$ROOT/scripts/nginx/mxm-ai-china-geo.conf" "${CN_HOST}:/tmp/mxm-ai-china-geo.conf"
rsync_cmd "$CN_HOST" "$ROOT/scripts/nginx/admin-china-edge.conf" "${CN_HOST}:/tmp/admin-china-edge.conf"
ssh_cmd "$CN_HOST" bash -s <<'REMOTE'
set -euo pipefail
cp /tmp/mxm-ai-china-geo.conf /etc/nginx/sites-available/mxm-ai-china-geo.conf
ln -sf /etc/nginx/sites-available/mxm-ai-china-geo.conf /etc/nginx/sites-enabled/mxm-ai-china-geo.conf
cp /tmp/admin-china-edge.conf /etc/nginx/sites-available/admin-china-edge.conf
ln -sf /etc/nginx/sites-available/admin-china-edge.conf /etc/nginx/sites-enabled/admin-china-edge.conf
nginx -t
systemctl reload nginx
REMOTE

log "香港主力：安装 ${DOMAIN} nginx 站点..."
rsync_cmd "$CN_HOST" "$ROOT/scripts/nginx/supermxmai.conf" "${CN_HOST}:/tmp/supermxmai-hk.conf"
HK_PASS="${HK_SSH_PASS:-${DEPLOY_SSH_PASS:-}}"
if [[ -n "$HK_PASS" ]]; then
  ssh_cmd "$CN_HOST" "SSHPASS='$HK_PASS' sshpass -e scp -o StrictHostKeyChecking=no /tmp/supermxmai-hk.conf ${HK_HOST}:/tmp/supermxmai.conf"
else
  ssh_cmd "$CN_HOST" "scp -o StrictHostKeyChecking=no /tmp/supermxmai-hk.conf ${HK_HOST}:/tmp/supermxmai.conf"
fi
NGINX_CMD='cp /tmp/supermxmai.conf /etc/nginx/sites-available/supermxmai.conf && ln -sf /etc/nginx/sites-available/supermxmai.conf /etc/nginx/sites-enabled/supermxmai.conf && rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true && nginx -t && systemctl reload nginx'
ssh_hk_via_edge "$NGINX_CMD"

log "香港 .env：PUBLIC_GATEWAY_ORIGIN / CORS ..."
CORS_VAL="${HK_PUBLIC_ORIGIN},${CN_ADMIN_ORIGIN},${CN_ADMIN_ORIGIN_IP},http://${CN_IP},http://localhost:3000,http://localhost:5173"
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
CN_REDIRECT="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Host: ${DOMAIN}' http://127.0.0.1/")"
CN_ADMIN="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code}' -H 'Host: ${DOMAIN}' http://127.0.0.1:8080/")"
HK_HOME="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code}' -H 'Host: ${DOMAIN}' http://${HK_IP}/")"
HK_HEALTH="$(ssh_cmd "$CN_HOST" "curl -sS -o /dev/null -w '%{http_code}' http://${HK_IP}/health")"

echo "  内地 ${DOMAIN}/ (Host)     => ${CN_REDIRECT}"
echo "  内地 ${DOMAIN}:8080/       => HTTP ${CN_ADMIN}"
echo "  境外 ${DOMAIN} @ HK        => HTTP ${HK_HOME}"
echo "  香港 /health                => HTTP ${HK_HEALTH}"

print_dns_guide
