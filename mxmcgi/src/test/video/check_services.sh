#!/bin/bash

# 服务状态检查脚本

echo "🔍 检查服务状态..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Gateway (端口 3000)
echo "1. 检查 Gateway (端口 3000)..."
if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ Gateway 正在运行${NC}"
    GATEWAY_STATUS=$(curl -s http://localhost:3000/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "   ${GREEN}✅ Gateway 健康检查通过${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Gateway 运行中但健康检查失败${NC}"
    fi
else
    echo -e "   ${RED}❌ Gateway 未运行${NC}"
    echo "   启动命令: pnpm --filter @mxmai/gateway dev"
fi
echo ""

# 检查 mxmcgi (端口 4003)
echo "2. 检查 mxmcgi (端口 4003)..."
if lsof -i :4003 > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ mxmcgi 正在运行${NC}"
    MXMCGI_STATUS=$(curl -s http://localhost:4003/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✅ mxmcgi 健康检查通过${NC}"
        echo "   响应: $MXMCGI_STATUS"
    else
        echo -e "   ${YELLOW}⚠️  mxmcgi 运行中但健康检查失败${NC}"
        echo "   可能原因: 服务崩溃或未正确启动"
    fi
else
    echo -e "   ${RED}❌ mxmcgi 未运行${NC}"
    echo "   启动命令: pnpm --filter @mxmai/mxmcgi dev"
    echo "   或: cd mxmcgi && npm run dev"
fi
echo ""

# 检查环境变量
echo "3. 检查环境变量..."
if [ -f "../.env" ] || [ -f "../../.env" ]; then
    echo -e "   ${GREEN}✅ .env 文件存在${NC}"
else
    echo -e "   ${YELLOW}⚠️  .env 文件未找到${NC}"
fi

# 检查 Gateway 到 mxmcgi 的连接
echo ""
echo "4. 测试 Gateway 到 mxmcgi 的连接..."
if lsof -i :3000 > /dev/null 2>&1 && lsof -i :4003 > /dev/null 2>&1; then
    TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4003/health 2>/dev/null)
    if [ "$TEST_RESPONSE" = "200" ]; then
        echo -e "   ${GREEN}✅ 连接正常${NC}"
    else
        echo -e "   ${RED}❌ 连接失败 (HTTP $TEST_RESPONSE)${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  无法测试（服务未运行）${NC}"
fi
echo ""

# 总结
echo "=========================================="
if lsof -i :3000 > /dev/null 2>&1 && lsof -i :4003 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 所有服务都在运行${NC}"
    echo ""
    echo "如果仍然遇到 502 错误，请："
    echo "1. 查看 mxmcgi 服务日志，查找错误信息"
    echo "2. 查看 Gateway 服务日志"
    echo "3. 确认请求体大小未超过限制（当前限制: 20MB）"
else
    echo -e "${RED}❌ 部分服务未运行${NC}"
    echo ""
    echo "启动所有服务："
    echo "  cd /Users/mxm_pro/Desktop/codes/mobile"
    echo "  pnpm dev:all"
    echo ""
    echo "或单独启动："
    echo "  pnpm dev:gateway  # Gateway (端口 3000)"
    echo "  pnpm dev:mxmcgi   # mxmcgi (端口 4003)"
fi
echo "=========================================="
