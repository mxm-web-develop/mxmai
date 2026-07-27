#!/usr/bin/env bash
# 国内 H5 服务器一次性初始化（Node 22 + pnpm + pm2 + nginx）
# 在目标机 root 执行，或由 deploy-h5-china.sh 通过 ssh 调用

set -euo pipefail

log() { echo "[h5-china-setup] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 执行" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 22 ]]; then
  log "安装 Node.js 22..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
log "node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  log "安装 pnpm..."
  corepack enable
  corepack prepare pnpm@10.33.3 --activate
fi
log "pnpm $(pnpm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  log "安装 pm2..."
  npm install -g pm2
fi

if ! command -v nginx >/dev/null 2>&1; then
  log "安装 nginx..."
  apt-get install -y -qq nginx
fi

mkdir -p /opt/eshop-agentic-h5
log "部署目录: /opt/eshop-agentic-h5"

log "初始化完成"
