#!/usr/bin/env bash
# 向生产 Supabase 写入 maxplan（MiniMax Token Plan）官方对照定价
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"

log() { echo "[seed-maxplan-pricing] $*"; }

log "从 ${DEPLOY_HOST} 读取生产 Supabase 配置..."
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" \
  "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)=' '${REMOTE_ENV}'" >"$TMP_ENV"

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
pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-pricing

log "完成。刷新 Admin → Provider 管理 → 定价表（provider=maxplan）"
