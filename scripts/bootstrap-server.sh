#!/usr/bin/env bash
# SuperMXMai 生产机基础环境（Supabase/R2 外置，无需 Docker MinIO）
# 用法：sudo bash bootstrap-server.sh

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

log() { echo "[bootstrap] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 运行: sudo bash $0" >&2
  exit 1
fi

log "系统更新..."
apt-get update -y
apt-get upgrade -y

log "基础工具..."
apt-get install -y \
  ca-certificates curl gnupg git unzip \
  build-essential python3 \
  ffmpeg \
  nginx redis-server docker.io docker-compose-v2 \
  ufw

systemctl enable docker
systemctl start docker

log "Node.js 22 (NodeSource)..."
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

log "pnpm..."
if ! command -v pnpm >/dev/null; then
  corepack enable
  corepack prepare pnpm@latest --activate
fi
pnpm -v

log "pm2..."
if ! command -v pm2 >/dev/null; then
  npm install -g pm2
fi
pm2 -v

log "Redis..."
systemctl enable redis-server
systemctl start redis-server
redis-cli ping || true

log "Nginx..."
systemctl enable nginx
systemctl start nginx

log "防火墙 (SSH + HTTP/S)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "部署目录..."
mkdir -p /opt/supermxmai
chown -R "${SUDO_USER:-root}:${SUDO_USER:-root}" /opt/supermxmai 2>/dev/null || true

log "完成。版本摘要:"
echo "  node $(node -v)"
echo "  pnpm $(pnpm -v)"
echo "  pm2 $(pm2 -v)"
echo "  redis $(redis-cli --version 2>/dev/null || echo ok)"
echo "  nginx $(nginx -v 2>&1)"
echo "  ffmpeg $(ffmpeg -version 2>&1 | head -1)"
echo "  ffprobe $(ffprobe -version 2>&1 | head -1)"
echo ""
echo "GSAP 渲染（Playwright Chromium，Ubuntu 26 需 platform override）:"
echo "  export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64"
echo "  cd /opt/supermxmai/mxmcgi && npx playwright install-deps chromium && npx playwright install chromium"
echo ""
echo "下一步:"
echo "  1. git clone 项目到 /opt/supermxmai"
echo "  2. 配置 /opt/supermxmai/.env"
echo "  3. pnpm install && pnpm build:mxmdata && pnpm build:gateway ... && pm2 启动"
