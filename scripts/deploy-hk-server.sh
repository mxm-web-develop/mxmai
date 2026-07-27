#!/usr/bin/env bash
# 部署全栈到香港主力（~/.ssh/config 的 mxm-hk，8.218.14.129:2222）
#
# 用法（项目根目录）:
#   pnpm deploy:hk
#   pnpm deploy:hk -- --backend-only
#   pnpm deploy:hk -- --web-only
#   pnpm deploy:hk -- --skip-build
#
# 前置: ~/.ssh/config 含 Host mxm-hk（见 scripts/ssh-config-mxm-hk.example）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! ssh -G mxm-hk 2>/dev/null | grep -q '^hostname 8\.218\.14\.129'; then
  echo "[deploy:hk] 缺少 SSH 配置 Host mxm-hk，请执行:" >&2
  echo "  cat scripts/ssh-config-mxm-hk.example >> ~/.ssh/config" >&2
  exit 1
fi

export DEPLOY_HOST="${DEPLOY_HOST:-mxm-hk}"
export DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"

exec bash scripts/deploy-to-server.sh "$@"
