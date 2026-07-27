#!/usr/bin/env bash
# 清空生产 Supabase 业务配置（prompt + scope 路由 + business_pricing）
# 读取香港主力 /opt/supermxmai/.env；不删 provider_models / 用户任务。
#
# 用法（项目根）:
#   bash scripts/wipe-business-configs-production.sh --dry-run
#   bash scripts/wipe-business-configs-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"
DRY=()
for a in "$@"; do
  [[ "$a" == "--dry-run" ]] && DRY=(--dry-run)
done

log() { echo "[wipe-business-configs] $*" ; }

ssh_cmd() {
  ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
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

export MXM_ALLOW_REMOTE_WIPE=1
export MXM_SEED_PRODUCTION=1
cd "$ROOT/mxmcgi"

log "执行 wipe-business-configs.ts ${DRY[*]:-} ..."
pnpm exec tsx src/scripts/wipe-business-configs.ts "${DRY[@]}"

if [[ ${#DRY[@]} -eq 0 ]]; then
  log "reload mxmcgi..."
  ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler 2>/dev/null || pm2 reload mxmcgi-api mxmcgi-worker"
fi

log "完成。"
