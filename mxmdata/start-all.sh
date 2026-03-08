#!/bin/bash

# mxmdata 一键启动脚本
# 功能：
# 1. 启动所有 Docker 服务（MinIO, Redis, PostgreSQL, Supabase 等）
# 2. 等待服务就绪
# 3. 测试连接
# 4. 可选：初始化数据库

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 mxmdata 一键启动脚本${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  警告: .env 文件不存在${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}   提示: 可以复制 .env.example 创建 .env 文件${NC}"
        echo -e "${YELLOW}   cp .env.example .env${NC}"
    fi
    echo ""
    read -p "是否继续启动服务？(y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 步骤 1: 启动 Docker 服务
echo -e "${BLUE}📦 步骤 1: 启动 Docker 服务...${NC}"
echo ""

docker compose up -d

echo ""
echo -e "${GREEN}✅ Docker 服务已启动${NC}"
echo ""

# 步骤 2: 等待服务就绪
echo -e "${BLUE}⏳ 步骤 2: 等待服务就绪...${NC}"
echo ""

# 等待 PostgreSQL 就绪
echo -n "等待 PostgreSQL 就绪"
for i in {1..30}; do
    if docker exec mxmai-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e " ${RED}✗${NC}"
        echo -e "${RED}❌ PostgreSQL 启动超时${NC}"
        exit 1
    fi
done

# 等待 MinIO 就绪
echo -n "等待 MinIO 就绪"
for i in {1..30}; do
    if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e " ${YELLOW}⚠${NC}"
        echo -e "${YELLOW}⚠️  MinIO 可能未完全就绪，但继续执行${NC}"
    fi
done

# 等待 Redis 就绪
echo -n "等待 Redis 就绪"
for i in {1..30}; do
    if docker exec mxmai-redis redis-cli ping > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e " ${YELLOW}⚠${NC}"
        echo -e "${YELLOW}⚠️  Redis 可能未完全就绪，但继续执行${NC}"
    fi
done

# 等待 PostgREST 就绪
echo -n "等待 PostgREST 就绪"
for i in {1..30}; do
    if curl -sf http://localhost:3001 > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e " ${YELLOW}⚠${NC}"
        echo -e "${YELLOW}⚠️  PostgREST 可能未完全就绪，但继续执行${NC}"
    fi
done

echo ""

# 步骤 3: 显示服务状态
echo -e "${BLUE}📊 步骤 3: 服务状态${NC}"
echo ""
docker compose ps
echo ""

# 步骤 4: 测试连接
echo -e "${BLUE}🧪 步骤 4: 测试连接...${NC}"
echo ""

# 检查是否有 pnpm 和测试脚本
if command -v pnpm > /dev/null 2>&1 && [ -f "package.json" ]; then
    if pnpm test:connection > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 连接测试通过${NC}"
    else
        echo -e "${YELLOW}⚠️  连接测试失败，但服务可能仍在启动中${NC}"
        echo -e "${YELLOW}   可以稍后手动运行: pnpm test:connection${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  跳过连接测试（需要 pnpm 和测试脚本）${NC}"
fi

echo ""

# 步骤 5: 可选初始化数据库
echo -e "${BLUE}📋 步骤 5: 数据库初始化（可选）${NC}"
echo ""
echo "是否初始化数据库表结构？"
echo "  这将执行所有 SQL schema 文件"
echo ""
read -p "是否初始化？(y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "init-all-tables.sh" ]; then
        chmod +x init-all-tables.sh
        ./init-all-tables.sh
    else
        echo -e "${YELLOW}⚠️  init-all-tables.sh 不存在，跳过初始化${NC}"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 所有服务启动完成！${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📡 服务地址:${NC}"
echo "   - MinIO API:      http://localhost:9000"
echo "   - MinIO Console:  http://localhost:9001 (minioadmin/minioadmin)"
echo "   - Redis:          localhost:6379"
echo "   - PostgreSQL:     localhost:5432 (postgres/postgres)"
echo "   - PostgREST:      http://localhost:3001"
echo "   - GoTrue:         http://localhost:9999"
echo "   - Realtime:       http://localhost:4000"
echo "   - Supabase Studio: http://localhost:54323"
echo ""
echo -e "${BLUE}🔧 常用命令:${NC}"
echo "   pnpm docker:ps          # 查看服务状态"
echo "   pnpm docker:logs       # 查看日志"
echo "   pnpm docker:down       # 停止服务"
echo "   pnpm test:connection   # 测试连接"
echo "   pnpm minio:open        # 打开 MinIO Console"
echo "   pnpm supabase:open    # 打开 Supabase Studio"
echo ""
echo -e "${BLUE}📝 下一步:${NC}"
echo "   1. 如果未初始化数据库，运行: ./init-all-tables.sh"
echo "   2. 测试连接: pnpm test:connection"
echo "   3. 创建管理员账号: pnpm create:admin"
echo ""
