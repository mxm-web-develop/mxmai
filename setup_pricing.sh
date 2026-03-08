#!/bin/bash

# DeerAPI图片生成定价设置脚本
# 使用方法: ./setup_pricing.sh

set -e

echo "🔧 DeerAPI图片生成定价设置脚本"
echo "========================================"

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查必要命令
for cmd in pnpm psql; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ 错误: 未找到 $cmd 命令"
        exit 1
    fi
done

echo "📋 步骤1: 运行迁移创建表"
echo "----------------------------------------"

# 运行迁移
echo "运行 provider-usage-pricing 迁移..."
pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing || {
    echo "⚠️  迁移可能已存在，继续..."
}

echo "运行 provider-balances 迁移..."
pnpm --filter @mxmai/mxmdata run migrate:provider-balances || {
    echo "⚠️  迁移可能已存在，继续..."
}

echo "✅ 迁移完成"

echo ""
echo "📋 步骤2: 检查数据库连接"
echo "----------------------------------------"

# 尝试连接数据库
DB_URL="postgres://postgres:postgres@localhost:5432/postgres"

if psql "$DB_URL" -c "SELECT 1" &> /dev/null; then
    echo "✅ 数据库连接成功"
else
    echo "❌ 数据库连接失败"
    echo ""
    echo "💡 请确保:"
    echo "1. PostgreSQL服务正在运行:"
    echo "   docker-compose -f mxmdata/docker-compose.yml up -d postgres"
    echo ""
    echo "2. 或者手动启动数据库服务"
    echo ""
    echo "3. 检查数据库连接信息:"
    echo "   默认: postgres://postgres:postgres@localhost:5432/postgres"
    exit 1
fi

echo ""
echo "📋 步骤3: 插入定价数据"
echo "----------------------------------------"

# 执行SQL文件
if [ -f "setup_pricing.sql" ]; then
    echo "执行 setup_pricing.sql..."
    psql "$DB_URL" -f setup_pricing.sql

    if [ $? -eq 0 ]; then
        echo "✅ 定价数据插入成功"
    else
        echo "❌ 定价数据插入失败"
        exit 1
    fi
else
    echo "❌ 未找到 setup_pricing.sql 文件"
    exit 1
fi

echo ""
echo "📋 步骤4: 验证配置"
echo "----------------------------------------"

# 验证数据
echo "验证定价配置..."
psql "$DB_URL" -c "
SELECT 'provider_pricing 记录数:' as table_name, COUNT(*) as count FROM provider_pricing WHERE provider = 'deer'
UNION ALL
SELECT 'provider_balances 记录数:' as table_name, COUNT(*) as count FROM provider_balances WHERE provider = 'deer';
"

echo ""
echo "📋 步骤5: 重启服务"
echo "----------------------------------------"

echo "💡 需要重启mxmcgi服务以加载新配置"
echo ""
echo "重启所有服务:"
echo "  pnpm dev:all"
echo ""
echo "或仅重启mxmcgi:"
echo "  pnpm dev:mxmcgi"
echo ""
echo "📋 步骤6: 测试图片生成"
echo "----------------------------------------"

echo "💡 配置完成后，请测试图片生成功能:"
echo "1. 通过Web界面发送图片生成请求"
echo "2. 检查任务状态"
echo "3. 查看mxmcgi服务日志确认无错误"

echo ""
echo "========================================"
echo "✅ 定价设置完成！"
echo ""
echo "📚 更多信息请查看:"
echo "   - PRICING_SETUP_GUIDE.md (详细指南)"
echo "   - diagnose_pricing.py (诊断工具)"
echo ""
echo "🔧 如果仍有问题，请检查:"
echo "   1. DeerAPI API密钥是否有效"
echo "   2. 服务日志中的错误信息"
echo "   3. 数据库连接和权限"