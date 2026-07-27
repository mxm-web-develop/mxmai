#!/usr/bin/env bash
# 向生产 Supabase 导入图集业务（内容配图 JSON 直出 + 文档配图）
# 用法: bash scripts/seed-graph-album-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"

log() { echo "[seed-graph-album] $*" ; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  fi
}

log "从 ${DEPLOY_HOST} 读取生产 Supabase 配置..."
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

ssh_cmd "grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY)=' '${REMOTE_ENV}'" >"$TMP_ENV"

set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a

unset SUPABASE_SERVICE_KEY SUPABASE_SERVICE_ROLE_KEY 2>/dev/null || true

if [[ -z "${SUPABASE_URL:-}" ]] || [[ "$SUPABASE_URL" == *localhost* ]]; then
  echo "生产 SUPABASE_URL 无效: ${SUPABASE_URL:-空}" >&2
  exit 1
fi

export MXM_SEED_PRODUCTION=1
cd "$ROOT/mxmcgi"

BUNDLES=(
  src/tasks/examples/graph-design-content-illustration.business.json
  src/tasks/examples/text-plan-album-spec.business.json
  src/tasks/examples/graph-group-content-album.business.json
  src/tasks/examples/graph-group-content-album-plan.business.json
)

for b in "${BUNDLES[@]}"; do
  log "写入生产库: $b"
  pnpm run apply:bundle -- "$b"
done

log "reload mxmcgi..."
ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler 2>/dev/null || true"

log "完成。Graph 页查找: 图集 · 内容配图 / 图集 · 文档配图"
