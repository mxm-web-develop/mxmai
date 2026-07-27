#!/usr/bin/env bash
# 等待 Gateway + mxmcgi-worker 就绪后再退出，供 dev:all-with-web 在启动前端前等待后端
# 最多等待 60 秒

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000/health}"
WORKER_PORT="${WORKER_PORT:-4004}"
WORKER_URL="${WORKER_URL:-http://localhost:${WORKER_PORT}/health}"

MAX_WAIT=60
INTERVAL=2
ELAPSED=0

check_health() {
  curl -s -o /dev/null -w "%{http_code}" "$1" 2>/dev/null | grep -q "200"
}

while [ $ELAPSED -lt $MAX_WAIT ]; do
  gateway_ready=false
  worker_ready=false

  if check_health "$GATEWAY_URL"; then
    gateway_ready=true
  fi
  if check_health "$WORKER_URL"; then
    worker_ready=true
  fi

  if $gateway_ready && $worker_ready; then
    echo "✅ Gateway 已就绪 (${ELAPSED}s)"
    echo "✅ mxmcgi-worker 已就绪 (${ELAPSED}s, ${WORKER_URL})"
    echo "🌐 SuperMX Web 将启动于 http://localhost:${WEB_DEV_PORT:-5200}"
    exit 0
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "⚠️  等待后端超时 (${MAX_WAIT}s)，前端将照常启动，请稍后刷新页面"
if ! check_health "$GATEWAY_URL"; then
  echo "   - Gateway 未就绪: ${GATEWAY_URL}"
fi
if ! check_health "$WORKER_URL"; then
  echo "   - mxmcgi-worker 未就绪: ${WORKER_URL}"
fi
exit 0
