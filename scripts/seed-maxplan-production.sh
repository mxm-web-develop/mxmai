#!/usr/bin/env bash
# 向生产 Supabase 写入 maxplan 物理模型与业务路由（读取主服务器 /opt/supermxmai/.env）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"

log() { echo "[seed-maxplan] $*"; }

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

ssh_cmd "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)=' '${REMOTE_ENV}'" >"$TMP_ENV"

set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a

if [[ -z "${SUPABASE_URL:-}" ]] || [[ "$SUPABASE_URL" == *localhost* ]]; then
  echo "生产 SUPABASE_URL 无效: ${SUPABASE_URL:-空}" >&2
  exit 1
fi

export MXM_SEED_PRODUCTION=1
log "写入生产库: ${SUPABASE_URL}"
cd "$ROOT"
pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-models

log "reload mxmcgi（刷新 provider_models 内存缓存）..."
ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler"

log "完成。请刷新 Admin → Provider 管理 → 物理模型目录（provider=maxplan）"
