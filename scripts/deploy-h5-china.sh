#!/usr/bin/env bash
# 构建并部署 eshop-agentic-h5 到国内服务器（默认 8.136.186.242）
#
# 用法（项目根目录）:
#   pnpm deploy:h5-china
#   pnpm deploy:h5-china -- --skip-build
#   pnpm deploy:h5-china -- --setup-only   # 仅初始化服务器（Node/pnpm/pm2/nginx）
#
# 环境变量:
#   DEPLOY_HOST=root@8.136.186.242
#   DEPLOY_PATH=/opt/eshop-agentic-h5
#   OPEN_API_PROXY_TARGET=https://mxm-ai.com   # 香港主力 Gateway（Next 服务端 /api 反代）
#   H5_ENV_FILE=eshop-agentic-h5/.env            # 含 MXMTOKEN 等（勿提交 git）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-root@8.136.186.242}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/eshop-agentic-h5}"
OPEN_API_PROXY_TARGET="${OPEN_API_PROXY_TARGET:-https://mxm-ai.com}"
H5_ENV_FILE="${H5_ENV_FILE:-eshop-agentic-h5/.env}"
H5_PKG="eshop-agentic-h5"

DO_BUILD=true
DO_SETUP=false
SETUP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --) ;;
    --skip-build) DO_BUILD=false ;;
    --setup-only) SETUP_ONLY=true; DO_SETUP=true ;;
    --with-setup) DO_SETUP=true ;;
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

log() { echo "[deploy-h5-china] $*"; }

if [[ "$DO_SETUP" == true || "$SETUP_ONLY" == true ]]; then
  log "初始化服务器 ${DEPLOY_HOST}..."
  scp "$ROOT/scripts/install-h5-china-server.sh" "${DEPLOY_HOST}:/tmp/install-h5-china-server.sh"
  ssh "$DEPLOY_HOST" "bash /tmp/install-h5-china-server.sh"
fi

if [[ "$SETUP_ONLY" == true ]]; then
  log "setup-only 完成"
  exit 0
fi

if [[ "$DO_BUILD" == true ]]; then
  # 保留命令行/脚本默认值，避免 eshop .env 里的 localhost 覆盖生产 Gateway
  _PROXY_TARGET="${OPEN_API_PROXY_TARGET:-https://mxm-ai.com}"
  if [[ -f "$ROOT/$H5_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT/$H5_ENV_FILE"
    set +a
  else
    log "警告: 未找到 $H5_ENV_FILE，构建将缺少 MXMTOKEN（可在 H5「设置」页手动填 Key）"
  fi
  export OPEN_API_PROXY_TARGET="$_PROXY_TARGET"
  export NODE_ENV=production
  export NEXT_PUBLIC_API_MODE="${NEXT_PUBLIC_API_MODE:-http}"
  export NEXT_PUBLIC_OPEN_API_BASE="${NEXT_PUBLIC_OPEN_API_BASE:-}"
  export NEXT_PUBLIC_OPEN_API_USE_PROXY="${NEXT_PUBLIC_OPEN_API_USE_PROXY:-true}"
  log "清理旧构建产物…"
  rm -rf "$ROOT/$H5_PKG/.next"
  log "本地构建 H5（API 反代 → ${OPEN_API_PROXY_TARGET}）..."
  pnpm --filter "$H5_PKG" build
fi

if [[ ! -d "$ROOT/$H5_PKG/.next/standalone/$H5_PKG" ]]; then
  echo "缺少 $H5_PKG/.next/standalone/$H5_PKG，请先 next build（output: standalone）" >&2
  exit 1
fi

STANDALONE_ROOT="$ROOT/$H5_PKG/.next/standalone"
STANDALONE_APP="$STANDALONE_ROOT/$H5_PKG"
if [[ ! -f "$STANDALONE_APP/server.js" ]]; then
  echo "缺少 $STANDALONE_APP/server.js，请先 next build（output: standalone）" >&2
  exit 1
fi

log "同步 standalone 包 → ${DEPLOY_HOST}:${DEPLOY_PATH}..."
ssh "$DEPLOY_HOST" "mkdir -p ${DEPLOY_PATH}/${H5_PKG}/.next/static ${DEPLOY_PATH}/${H5_PKG}/public"

# 含 monorepo 根 node_modules/.pnpm（symlink 目标），不可只同步子目录
rsync -az --delete \
  "$STANDALONE_ROOT/" "${DEPLOY_HOST}:${DEPLOY_PATH}/"

rsync -az --delete \
  "$ROOT/$H5_PKG/.next/static/" "${DEPLOY_HOST}:${DEPLOY_PATH}/${H5_PKG}/.next/static/"

rsync -az --delete \
  "$ROOT/$H5_PKG/public/" "${DEPLOY_HOST}:${DEPLOY_PATH}/${H5_PKG}/public/"

rsync -az "$ROOT/scripts/ecosystem-h5-china.config.cjs" "${DEPLOY_HOST}:${DEPLOY_PATH}/ecosystem.config.cjs"
rsync -az "$ROOT/scripts/nginx/eshop-h5-china.conf" "${DEPLOY_HOST}:/tmp/eshop-h5-china.conf"

log "pm2 启动 standalone..."
H5_PARTNER_KEY="${MXM_PARTNER_KEY:-${MXMTOKEN:-}}"
ssh "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
cd ${DEPLOY_PATH}
cat > eshop-agentic-h5/.env.production.local <<EOF
OPEN_API_PROXY_TARGET=${OPEN_API_PROXY_TARGET}
NODE_ENV=production
PORT=3100
HOSTNAME=127.0.0.1
MXM_PARTNER_KEY=${H5_PARTNER_KEY}
MXMTOKEN=${H5_PARTNER_KEY}
EOF
pm2 delete eshop-h5 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
if command -v nginx >/dev/null; then
  cp /tmp/eshop-h5-china.conf /etc/nginx/sites-available/eshop-h5-china.conf
  ln -sf /etc/nginx/sites-available/eshop-h5-china.conf /etc/nginx/sites-enabled/eshop-h5-china.conf
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t && systemctl enable nginx && systemctl reload nginx
fi
REMOTE

IP="${DEPLOY_HOST#*@}"
log "完成。验收: curl -sS -o /dev/null -w '%{http_code}' http://${IP}/"
log "H5 首页: http://${IP}/"
