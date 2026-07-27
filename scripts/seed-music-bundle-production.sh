#!/usr/bin/env bash
# 向生产 Supabase 导入 mxm-business-bundle（读取主服务器 /opt/supermxmai/.env）
# 用法: bash scripts/seed-music-bundle-production.sh [path/to/bundle.business.json]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"
BUNDLE="${1:-src/tasks/examples/music-compose-maxplan-test.business.json}"

log() { echo "[seed-music-bundle] $*" ; }

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
log "写入生产库 bundle: ${SUPABASE_URL}"
cd "$ROOT"
pnpm --filter @mxmai/mxmcgi run apply:bundle -- "$BUNDLE"

log "reload mxmcgi..."
ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler"

log "完成。请刷新 Admin → 业务管理，查找 music/compose/maxplan-direct 与 maxplan-test"
