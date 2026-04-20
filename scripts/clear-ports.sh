#!/bin/bash

# 清理所有模块使用的端口
# 用于在启动 dev:all 之前清理可能被占用的端口

PORTS=(4001 4002 4003 4005 3000)
MODULES=("mxmauth" "mxmpay" "mxmcgi" "mxmnotify" "gateway")

echo "🔍 检查并清理端口..."

for i in "${!PORTS[@]}"; do
  PORT=${PORTS[$i]}
  MODULE=${MODULES[$i]}
  
  # 查找占用该端口的进程
  PID=$(lsof -ti:$PORT 2>/dev/null)
  
  if [ -n "$PID" ]; then
    echo "⚠️  端口 $PORT ($MODULE) 被进程 $PID 占用，正在清理..."
    kill -9 $PID 2>/dev/null
    sleep 0.5
    
    # 再次检查是否清理成功
    PID_CHECK=$(lsof -ti:$PORT 2>/dev/null)
    if [ -z "$PID_CHECK" ]; then
      echo "✅ 端口 $PORT ($MODULE) 已清理"
    else
      echo "❌ 端口 $PORT ($MODULE) 清理失败，进程 $PID_CHECK 仍在运行"
    fi
  else
    echo "✅ 端口 $PORT ($MODULE) 未被占用"
  fi
done

echo ""
echo "✨ 端口清理完成！"
echo ""

