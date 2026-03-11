#!/usr/bin/env bash
# 等待 Gateway (localhost:3000) 就绪后再退出，供 dev:all-with-web 在启动前端前等待后端
# 最多等待 60 秒

MAX_WAIT=60
INTERVAL=2
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" 2>/dev/null | grep -q "200"; then
    echo "✅ Gateway 已就绪 (${ELAPSED}s)"
    exit 0
  fi
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "⚠️  等待 Gateway 超时 (${MAX_WAIT}s)，前端将照常启动，请稍后刷新页面"
exit 0
