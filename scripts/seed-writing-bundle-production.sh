#!/usr/bin/env bash
# 向生产 Supabase 导入「现行」Writing 业务（行业日报 + 话题写作可选 + 演示文稿）
# 用法: bash scripts/seed-writing-bundle-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"

log() { echo "[seed-writing-bundle] $*" ; }

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

# 空串占位，阻止本地 dotenv 注入 service key（否则会 Invalid API key）
export SUPABASE_SERVICE_KEY=
export SUPABASE_SERVICE_ROLE_KEY=

if [[ -z "${SUPABASE_URL:-}" ]] || [[ "$SUPABASE_URL" == *localhost* ]]; then
  echo "生产 SUPABASE_URL 无效: ${SUPABASE_URL:-空}" >&2
  exit 1
fi

export MXM_SEED_PRODUCTION=1
cd "$ROOT/mxmcgi"

# 先删角度探索，再写入现行 writing
log "删除生产库 writing/group/seek（角度探索）..."
MXM_ALLOW_REMOTE_WIPE=1 pnpm exec tsx src/scripts/delete-writing-group-seek.ts

BUNDLES=(
  src/tasks/examples/writing-generator-industry-daily.business.json
  src/tasks/examples/writing-generator-topic-article.business.json
  src/tasks/examples/writing-group-deck.business.json
)

for b in "${BUNDLES[@]}"; do
  log "写入生产库: $b"
  pnpm run apply:bundle -- "$b"
done

log "reload mxmcgi..."
ssh_cmd "cd '${DEPLOY_PATH:-/opt/supermxmai}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler 2>/dev/null || pm2 reload mxmcgi-api mxmcgi-worker"

log "完成。Admin 写作新建应见：话题写作、行业日报、演示文稿（方案）"
