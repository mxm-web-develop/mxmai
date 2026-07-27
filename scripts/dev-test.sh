#!/usr/bin/env bash
# 本地 test 环境：MinIO SSH 隧道 + 全后端（MXM_ENV=test → .env.test）
# 用法：pnpm dev:test

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export MXM_ENV=test

if [[ ! -f "${ROOT}/.env.test" ]]; then
  echo "[dev:test] 缺少 .env.test，请先运行: pnpm setup:env:test" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[dev:test] 启动 MinIO SSH 隧道..."
TUNNEL_BACKGROUND=1 bash scripts/test-env-tunnel.sh
TUNNEL_PID="$(cat "${TMPDIR:-/tmp}/supermxmai-minio-tunnel.pid" 2>/dev/null || true)"

LOCAL_PORT="${MINIO_TUNNEL_LOCAL_PORT:-19000}"
if command -v nc >/dev/null; then
  for _ in $(seq 1 15); do
    if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done
fi

echo "[dev:test] MXM_ENV=test，加载 .env.test，启动全后端..."
MXM_ENV=test pnpm dev:all
