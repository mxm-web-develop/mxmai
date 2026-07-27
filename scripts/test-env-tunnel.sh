#!/usr/bin/env bash
# MinIO SSH 隧道：本机 ${MINIO_TUNNEL_LOCAL_PORT:-19000} → 主服务器 127.0.0.1:9000
# 用法：
#   pnpm tunnel:test              # 前台（Ctrl+C 关闭）
#   TUNNEL_BACKGROUND=1 pnpm tunnel:test   # 后台（dev:test 内部使用）

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
LOCAL_PORT="${MINIO_TUNNEL_LOCAL_PORT:-19000}"
REMOTE_PORT="${MINIO_TUNNEL_REMOTE_PORT:-9000}"
PID_FILE="${TMPDIR:-/tmp}/supermxmai-minio-tunnel.pid"

log() { echo "[tunnel:test] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$@"
  fi
}

tunnel_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if command -v lsof >/dev/null; then
    lsof -i ":${LOCAL_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1
    return $?
  fi
  return 1
}

start_tunnel() {
  log "建立隧道 localhost:${LOCAL_PORT} → ${DEPLOY_HOST}:127.0.0.1:${REMOTE_PORT}"
  ssh_cmd -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
    "$DEPLOY_HOST"
}

if tunnel_running; then
  log "隧道已在运行（端口 ${LOCAL_PORT}）"
  exit 0
fi

if [[ "${TUNNEL_BACKGROUND:-}" == "1" ]]; then
  start_tunnel &
  echo $! >"$PID_FILE"
  sleep 0.8
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "隧道启动失败，请检查 SSH 与 ${DEPLOY_HOST}" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  log "后台隧道 PID=$(cat "$PID_FILE")"
  exit 0
fi

trap 'rm -f "$PID_FILE"' EXIT
start_tunnel
