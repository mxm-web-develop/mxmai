#!/usr/bin/env bash
# 将 provider_models / provider_pricing 同步到生产 Supabase（香港主力）。
#
# 用法：
#   bash scripts/sync-provider-db-production.sh --pricing
#   bash scripts/sync-provider-db-production.sh --models
#   bash scripts/sync-provider-db-production.sh --models --pricing
#   bash scripts/sync-provider-db-production.sh --pricing --file ./rows.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"
REMOTE_ENV="${DEPLOY_PATH}/.env"
DO_MODELS=0
DO_PRICING=0
PRICING_FILE=""

log() { echo "[sync-provider-db] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --models) DO_MODELS=1; shift ;;
    --pricing) DO_PRICING=1; shift ;;
    --file) PRICING_FILE="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

if [[ "$DO_MODELS" -eq 0 && "$DO_PRICING" -eq 0 ]]; then
  echo "请指定 --models 和/或 --pricing" >&2
  exit 1
fi

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

log "从 ${DEPLOY_HOST} 读取生产 Supabase 配置..."
ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" \
  "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|SUPABASE_DB_URL)=' '${REMOTE_ENV}'" \
  >"$TMP_ENV" || true

set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY"
fi

HAS_SERVICE_KEY=0
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" && "$SUPABASE_URL" != *localhost* ]]; then
  HAS_SERVICE_KEY=1
fi

if [[ "$HAS_SERVICE_KEY" -eq 1 ]]; then
  export MXM_SEED_PRODUCTION=1
  log "SERVICE_ROLE 直写: ${SUPABASE_URL}"
  cd "$ROOT"
  if [[ "$DO_MODELS" -eq 1 ]]; then
    pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-models
    pnpm --filter @mxmai/mxmcgi run seed:provider-atlascloud-models
  fi
  if [[ "$DO_PRICING" -eq 1 ]]; then
    if [[ -n "$PRICING_FILE" ]]; then
      pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- --file "$PRICING_FILE"
    else
      pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-pricing
      pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
        --file mxmcgi/src/scripts/data/atlascloud-pricing.json
    fi
  fi
else
  log "无 SERVICE_ROLE_KEY → 港机 SUPABASE_DB_URL / pg 回退"

  if [[ "$DO_MODELS" -eq 1 ]]; then
    log "警告: 无 SERVICE_ROLE 时 models seed 常失败；优先在 Admin 写入物理模型，或补密钥后再跑 --models"
    ssh "$DEPLOY_HOST" "cd '${DEPLOY_PATH}' && set -a && source .env && set +a && \
      pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-models && \
      pnpm --filter @mxmai/mxmcgi run seed:provider-atlascloud-models" || {
      echo "models seed 失败。请配置 SUPABASE_SERVICE_ROLE_KEY 或用 Admin「物理模型」写入。" >&2
      exit 1
    }
  fi

  if [[ "$DO_PRICING" -eq 1 ]]; then
    if [[ -n "$PRICING_FILE" ]]; then
      remote_json="/tmp/mxm-provider-pricing-$$.json"
      scp -O "$PRICING_FILE" "${DEPLOY_HOST}:${remote_json}"
      scp -O "$ROOT/scripts/lib/upsert-pricing-via-pg.mjs" "${DEPLOY_HOST}:/tmp/upsert-pricing-via-pg.mjs"
      ssh "$DEPLOY_HOST" "node /tmp/upsert-pricing-via-pg.mjs '${remote_json}'"
    else
      node "$ROOT/scripts/lib/seed-maxplan-pricing-via-ssh.mjs"
      # atlascloud 定价走 JSON + pg 回退
      remote_json="/tmp/mxm-atlascloud-pricing-$$.json"
      scp -O "$ROOT/mxmcgi/src/scripts/data/atlascloud-pricing.json" "${DEPLOY_HOST}:${remote_json}"
      scp -O "$ROOT/scripts/lib/upsert-pricing-via-pg.mjs" "${DEPLOY_HOST}:/tmp/upsert-pricing-via-pg.mjs"
      ssh "$DEPLOY_HOST" "node /tmp/upsert-pricing-via-pg.mjs '${remote_json}'"
    fi
  fi
fi

log "reload mxmcgi 缓存..."
ssh "$DEPLOY_HOST" "pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler"

log "完成。Admin → Provider 管理刷新确认。"
