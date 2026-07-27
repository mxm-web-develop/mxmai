#!/usr/bin/env bash
# 生产库：剔除 audio/music 任务 output_data.metadata.raw，修复按 id 查询 statement timeout
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"

log() { echo "[strip-tts-raw] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  fi
}

log "在生产机执行 SQL 清理 metadata.raw ..."
ssh_cmd "bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/supermxmai
set -a
# shellcheck disable=SC1091
source .env
set +a
DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "缺少 DATABASE_URL / SUPABASE_DB_URL" >&2
  exit 1
fi
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE cgi_tasks
SET
  output_data = jsonb_set(
    output_data,
    '{metadata}',
    (output_data->'metadata') - 'raw',
    true
  ),
  updated_at = NOW()
WHERE task_type IN ('audio', 'music')
  AND output_data IS NOT NULL
  AND output_data->'metadata' ? 'raw'
  AND storage_info IS NOT NULL;

SELECT id, task_type, pg_column_size(output_data) AS bytes
FROM cgi_tasks
WHERE id = '51002f84b15180d22b322';
SQL
REMOTE

log "完成。请刷新 Audio 任务页面验证播放。"
