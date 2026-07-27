#!/usr/bin/env bash
# 生产构建：后端 6 服务 + web 静态（不含 moblie / eshop-agentic-h5）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[build-prod] mxmdata..."
pnpm --filter @mxmai/mxmdata run build:dist

echo "[build-prod] backend services..."
pnpm build:gateway
pnpm build:mxmauth
pnpm build:mxmpay
pnpm build:mxmcgi
pnpm build:mxmnotify

echo "[build-prod] sync agent skill..."
bash scripts/sync-agent-skill.sh

# GSAP video playground 已移除；若残留 public/gsap-shared 可忽略
if [[ -d artifacts/gsap-playground/_shared ]]; then
  echo "[build-prod] sync gsap-shared static assets..."
  mkdir -p web/public/gsap-shared
  rsync -a --delete artifacts/gsap-playground/_shared/ web/public/gsap-shared/
fi

echo "[build-prod] web..."
pnpm --filter web exec vite build

echo "[build-prod] done."
