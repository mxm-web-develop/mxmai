#!/bin/bash

# 启动所有服务的脚本

echo "🚀 启动服务..."
echo ""

# 检查必要的环境变量
if [ ! -f "mxmdata/.env" ]; then
  echo "⚠️  警告: mxmdata/.env 不存在，请先配置"
fi

if [ ! -f "mxmauth/.env" ]; then
  echo "⚠️  警告: mxmauth/.env 不存在，请先配置"
fi

if [ ! -f "gateway/.env" ]; then
  echo "⚠️  警告: gateway/.env 不存在，请先配置"
fi

echo "📦 启动服务..."
echo ""

# 启动 mxmdata (如果需要，这里只是检查)
echo "✅ mxmdata 已就绪（数据层，无需启动服务）"
echo ""

# 启动 mxmauth
echo "🔐 启动 mxmauth (端口 4001)..."
pnpm --filter @mxmai/mxmauth dev &
MXMAUTH_PID=$!
echo "   PID: $MXMAUTH_PID"
sleep 2
echo ""

# 启动 gateway
echo "🌐 启动 gateway (端口 3000)..."
pnpm --filter @mxmai/gateway dev &
GATEWAY_PID=$!
echo "   PID: $GATEWAY_PID"
sleep 2
echo ""

echo "✅ 服务启动完成！"
echo ""
echo "📡 服务地址:"
echo "   - Gateway: http://localhost:3000"
echo "   - mxmauth: http://localhost:4001"
echo ""
echo "🧪 测试命令:"
echo "   curl http://localhost:3000/health"
echo "   curl http://localhost:3000/api/v1/account/health"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待中断信号
trap "echo ''; echo '🛑 停止服务...'; kill $MXMAUTH_PID $GATEWAY_PID 2>/dev/null; exit" INT TERM

# 保持脚本运行
wait

