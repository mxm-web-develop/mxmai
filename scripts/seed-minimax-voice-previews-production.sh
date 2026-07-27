#!/usr/bin/env bash
# 生成 MiniMax 系统音色试听 MP3，写入 mxmcgi/assets 并同步到生产服务器
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"

log() { echo "[seed-voice-previews] $*"; }

rsync_cmd() {
  local src="$1" dest="$2"
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e rsync -az -e "ssh -o StrictHostKeyChecking=accept-new" "$src" "$dest"
  else
    rsync -az -e "ssh -o StrictHostKeyChecking=accept-new" "$src" "$dest"
  fi
}

export VOICE_PREVIEW_ASSETS_ONLY=1
export VOICE_PREVIEW_DELAY_MS="${VOICE_PREVIEW_DELAY_MS:-3000}"

log "本地补跑缺失预览（已有 mp3 自动 skip，仅写 assets）…"
cd "$ROOT"
pnpm --filter @mxmai/mxmcgi run seed:minimax-voice-previews "$@"

log "同步 assets 到 ${DEPLOY_HOST}…"
rsync_cmd \
  "$ROOT/mxmcgi/assets/minimax-voice-previews/" \
  "${DEPLOY_HOST}:${DEPLOY_PATH:-/opt/supermxmai}/mxmcgi/assets/minimax-voice-previews/"
rsync_cmd \
  "$ROOT/mxmcgi/assets/minimax/" \
  "${DEPLOY_HOST}:${DEPLOY_PATH:-/opt/supermxmai}/mxmcgi/assets/minimax/" 2>/dev/null || true

log "完成。"
