#!/usr/bin/env bash
# 把 hk-provider-modalities.ts 里的 supported_inputs/outputs/modes
# 幂等 patch 到生产 provider_models.capabilities。**只更新 capabilities 字段**。
#
# 用法：
#   bash scripts/sync-modality-capacities-production.sh
#   bash scripts/sync-modality-capacities-production.sh --dry-run   # 仅打印 diff
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"
REMOTE_ENV="${DEPLOY_PATH}/.env"
DRY_RUN=0

log() { echo "[sync-modality] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,7p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

log "从 ${DEPLOY_HOST} 读取生产 Supabase 配置..."
ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" \
  "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY)=' '${REMOTE_ENV}'" \
  >"$TMP_ENV" || true

set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY"
fi

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || "$SUPABASE_URL" == *localhost* ]]; then
  echo "错误: 未拿到生产 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" >&2
  exit 1
fi

export MXM_SEED_PRODUCTION=1
log "SERVICE_ROLE 直写: ${SUPABASE_URL}"
cd "$ROOT"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY-RUN: 仅打印将要运行的命令"
  echo "  pnpm --filter @mxmai/mxmcgi run sync:modality-capacities"
  exit 0
fi

pnpm --filter @mxmai/mxmcgi run sync:modality-capacities

log "reload mxmcgi 缓存..."
ssh "$DEPLOY_HOST" "pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler"

log "完成。Admin → Provider 管理刷新确认。"
