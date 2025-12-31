#!/bin/bash

# mxmpay 数据库设置脚本

set -e

echo "🔧 mxmpay 数据库设置脚本"
echo "================================"

# 1. 检查 Docker 容器
echo ""
echo "1️⃣  检查 PostgreSQL 容器..."
POSTGRES_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "mxmai-postgres|postgres" | head -1)

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo "❌ 未找到运行中的 PostgreSQL 容器"
    echo "   请先启动 Docker Compose: cd mxmdata && docker-compose up -d"
    exit 1
fi

echo "✅ 找到 PostgreSQL 容器: $POSTGRES_CONTAINER"

# 2. 执行 SQL
echo ""
echo "2️⃣  执行数据库表结构 SQL..."
SQL_FILE="../mxmdata/src/database/schemas/mxmpay.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ SQL 文件不存在: $SQL_FILE"
    exit 1
fi

if docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d postgres < "$SQL_FILE" 2>&1 | grep -v "already exists" | grep -v "CREATE TABLE" | grep -v "CREATE INDEX" | grep -v "CREATE TRIGGER" | grep -E "(ERROR|error|Error)"; then
    echo "⚠️  SQL 执行过程中可能有错误，请检查输出"
else
    echo "✅ 数据库表结构创建成功"
fi

# 3. 检查 .env 配置
echo ""
echo "3️⃣  检查 mxmpay/.env 配置..."

if [ ! -f ".env" ]; then
    echo "⚠️  mxmpay/.env 不存在，正在从 env.example 创建..."
    cp env.example .env
    echo "✅ 已创建 .env 文件，请编辑并填入正确的 Supabase 配置"
    echo ""
    echo "需要配置的变量："
    echo "  - SUPABASE_URL (通常是 http://localhost:3001 或 http://localhost:8000)"
    echo "  - SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_KEY (可选)"
    echo ""
    echo "可以从 Supabase Studio 获取这些值："
    echo "  http://localhost:54323 → Settings → API"
else
    echo "✅ mxmpay/.env 已存在"
    
    # 检查是否配置了 Supabase
    if grep -q "SUPABASE_URL" .env && grep -q "SUPABASE_ANON_KEY" .env; then
        SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$SUPABASE_URL" ] && [ "$SUPABASE_URL" != "你的_ANON_KEY" ]; then
            echo "✅ Supabase 配置已存在"
        else
            echo "⚠️  Supabase 配置存在但未填写，请编辑 .env 文件"
        fi
    else
        echo "⚠️  .env 中缺少 Supabase 配置，请添加："
        echo "   SUPABASE_URL=http://localhost:3001"
        echo "   SUPABASE_ANON_KEY=你的_ANON_KEY"
        echo "   SUPABASE_SERVICE_KEY=你的_SERVICE_KEY"
    fi
fi

echo ""
echo "================================"
echo "✅ 设置完成！"
echo ""
echo "下一步："
echo "1. 如果 .env 中 Supabase 配置未填写，请编辑 mxmpay/.env"
echo "2. 启动服务测试: pnpm dev:mxmpay"
echo ""

