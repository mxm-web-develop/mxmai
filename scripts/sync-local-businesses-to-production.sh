#!/usr/bin/env bash
# 将本地 Supabase 业务配置全量同步到香港生产库
# 用法（项目根）: bash scripts/sync-local-businesses-to-production.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"
DRY_ARGS=()
for a in "$@"; do
  [[ "$a" == "--dry-run" ]] && DRY_ARGS=(--dry-run)
done

log() { echo "[sync-local-businesses] $*" ; }

ssh_cmd() {
  ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$DEPLOY_HOST" "$@"
}

OUT="$ROOT/tmp/local-businesses-sync.bundle.json"
mkdir -p "$ROOT/tmp"

log "1/3 从本地导出业务 bundle..."
cd "$ROOT/mxmcgi"
# 清掉可能残留的生产 URL
unset MXM_SEED_PRODUCTION || true
pnpm exec tsx src/scripts/export-local-businesses-bundle.ts "$OUT"
ITEMS=$(node -e "const b=require('$OUT'); console.log(b.items?.length||0)")
log "导出 items=$ITEMS -> $OUT"
if [[ "$ITEMS" -lt 1 ]]; then
  echo "本地无业务可同步" >&2
  exit 1
fi

log "2/3 读取生产 Supabase 配置..."
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
log "3/3 写入生产库 upsert..."
pnpm run apply:bundle -- "$OUT" ${DRY_ARGS[@]+"${DRY_ARGS[@]}"}

if [[ ${#DRY_ARGS[@]} -eq 0 ]]; then
  log "reload mxmcgi..."
  ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker 2>/dev/null || true"
fi

log "完成。Admin 刷新业务列表即可。bundle=$OUT"
