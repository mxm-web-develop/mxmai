#!/usr/bin/env bash
# 部署 Admin Web 到国内副机（8.136.186.242:8080），API 反代香港主力 Gateway
#
# 用法（项目根目录）:
#   DEPLOY_SSH_PASS='...' bash scripts/deploy-admin-china.sh
#   DEPLOY_SSH_PASS='...' bash scripts/deploy-admin-china.sh --skip-build
#   DEPLOY_SSH_PASS='...' bash scripts/deploy-admin-china.sh --skip-hk-patch
#
# 环境变量:
#   DEPLOY_HOST=root@8.136.186.242
#   HK_SSH=mxm-hk                            # 推荐：~/.ssh/config 直连 8.218.14.129:2222
#   HK_HOST=root@8.218.14.129
#   HK_SSH_PASS=...          # 仅副机跳板回退时需要
#   HK_API_ORIGIN=https://mxm-ai.com
#   ADMIN_PUBLIC_ORIGIN=http://8.136.186.242:8080

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-root@8.136.186.242}"
DEPLOY_IP="${DEPLOY_HOST#*@}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"
HK_SSH="${HK_SSH:-mxm-hk}"
HK_HOST="${HK_HOST:-root@8.218.14.129}"
HK_IP="${HK_IP:-8.218.14.129}"
HK_API_ORIGIN="${HK_API_ORIGIN:-https://mxm-ai.com}"
ADMIN_PUBLIC_ORIGIN="${ADMIN_PUBLIC_ORIGIN:-http://${DEPLOY_IP}:8080}"

DO_BUILD=true
SKIP_HK_PATCH=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) DO_BUILD=false ;;
    --skip-hk-patch) SKIP_HK_PATCH=true ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

log() { echo "[deploy-admin-china] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$@"
  fi
}

rsync_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e rsync -az "$@"
  else
    rsync -az "$@"
  fi
}

HK_PASS="${HK_SSH_PASS:-${DEPLOY_SSH_PASS:-}}"

ssh_hk() {
  local remote_cmd="$1"
  ssh_cmd "$HK_SSH" "$(printf '%q' "$remote_cmd")"
}

ssh_hk_via_edge() {
  local remote_cmd="$1"
  if [[ -z "$HK_PASS" ]]; then
    ssh_cmd "$DEPLOY_HOST" "ssh -o StrictHostKeyChecking=accept-new ${HK_HOST} $(printf '%q' "$remote_cmd")"
  else
    ssh_cmd "$DEPLOY_HOST" "command -v sshpass >/dev/null || (export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get install -y -qq sshpass); SSHPASS='$HK_PASS' sshpass -e ssh -o StrictHostKeyChecking=accept-new ${HK_HOST} $(printf '%q' "$remote_cmd")"
  fi
}

if [[ "$DO_BUILD" == true ]]; then
  log "构建 Admin Web..."
  bash scripts/sync-agent-skill.sh
  pnpm --filter web exec vite build
fi

if [[ ! -d "$ROOT/web/dist" ]]; then
  echo "缺少 web/dist，请先 pnpm build:web" >&2
  exit 1
fi

log "同步 web/dist → ${DEPLOY_HOST}:${DEPLOY_PATH}/web/dist"
ssh_cmd "$DEPLOY_HOST" "mkdir -p ${DEPLOY_PATH}/web/dist"
rsync_cmd --delete "$ROOT/web/dist/" "${DEPLOY_HOST}:${DEPLOY_PATH}/web/dist/"

log "安装 nginx 站点（:8080）..."
rsync_cmd "$ROOT/scripts/nginx/admin-china-edge.conf" "${DEPLOY_HOST}:/tmp/admin-china-edge.conf"
ssh_cmd "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
cp /tmp/admin-china-edge.conf /etc/nginx/sites-available/admin-china-edge.conf
ln -sf /etc/nginx/sites-available/admin-china-edge.conf /etc/nginx/sites-enabled/admin-china-edge.conf
nginx -t
systemctl enable nginx
systemctl reload nginx
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 8080/tcp || true
fi
REMOTE

if [[ "$SKIP_HK_PATCH" != true ]]; then
  PATCH_CMD=$(cat <<EOF
set -euo pipefail
cd /opt/supermxmai
if grep -q '^PUBLIC_GATEWAY_ORIGIN=' .env; then
  sed -i 's|^PUBLIC_GATEWAY_ORIGIN=.*|PUBLIC_GATEWAY_ORIGIN=${ADMIN_PUBLIC_ORIGIN}|' .env
else
  echo 'PUBLIC_GATEWAY_ORIGIN=${ADMIN_PUBLIC_ORIGIN}' >> .env
fi
if grep -q '^CORS_ORIGIN=' .env; then
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=${ADMIN_PUBLIC_ORIGIN},http://${DEPLOY_IP},http://localhost:3000,http://localhost:5173|' .env
else
  echo 'CORS_ORIGIN=${ADMIN_PUBLIC_ORIGIN},http://${DEPLOY_IP},http://localhost:3000,http://localhost:5173' >> .env
fi
if [[ -f /etc/default/minio ]]; then
  source /etc/default/minio
  MINIO_ACCESS_KEY=\${MINIO_ROOT_USER} MINIO_SECRET_KEY=\${MINIO_ROOT_PASSWORD} \\
    PUBLIC_GATEWAY_ORIGIN=${ADMIN_PUBLIC_ORIGIN} \\
    bash /opt/supermxmai/scripts/patch-env-minio-local.sh /opt/supermxmai/.env
fi
pm2 reload all --update-env
EOF
)
  if ssh -o BatchMode=yes -o ConnectTimeout=10 "$HK_SSH" 'true' 2>/dev/null; then
    log "更新香港 PUBLIC_GATEWAY_ORIGIN / CORS / MinIO URL（经 ${HK_SSH}）..."
    ssh_hk "$PATCH_CMD"
  elif [[ -n "$HK_PASS" ]]; then
    log "更新香港 .env（经副机跳板 ${HK_HOST}）..."
    ssh_hk_via_edge "$PATCH_CMD"
  else
    log "无法 SSH 香港（请配置 Host mxm-hk 或设置 HK_SSH_PASS），跳过 .env patch"
  fi
fi

log "验收 ${DEPLOY_HOST}..."
CODE_PAGE="$(ssh_cmd "$DEPLOY_HOST" "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/")"
CODE_HEALTH="$(ssh_cmd "$DEPLOY_HOST" "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health")"
CODE_API="$(ssh_cmd "$DEPLOY_HOST" "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v1/account/captcha/config" 2>/dev/null || echo 000)"
HK_HEALTH="$(ssh_cmd "$DEPLOY_HOST" "curl -sS -o /dev/null -w '%{http_code}' ${HK_API_ORIGIN}/health")"

echo "  Admin /        => HTTP ${CODE_PAGE}"
echo "  Admin /health  => HTTP ${CODE_HEALTH}"
echo "  Admin /api     => HTTP ${CODE_API}"
echo "  HK  /health    => HTTP ${HK_HEALTH} (经副机访问)"

cat <<EOF

════════════════════════════════════════════════════════════
Admin Web 国内入口已发布

  Admin:  ${ADMIN_PUBLIC_ORIGIN}/
  H5:     http://${DEPLOY_IP}/          （需 OPEN_API_PROXY_TARGET 指向香港）
  香港主力: ${HK_API_ORIGIN}

请在阿里云安全组为 ${DEPLOY_IP} 放行 TCP 8080（若尚未放行）。
EOF
