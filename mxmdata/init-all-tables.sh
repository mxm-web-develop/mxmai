#!/bin/bash

# 数据库完整初始化脚本
# 用法：./init-all-tables.sh [数据库连接字符串]
#
# 示例：
#   ./init-all-tables.sh
#   ./init-all-tables.sh "postgresql://user:password@host:5432/database"

set -e

# 默认数据库连接（如果未提供参数）
DB_URL="${1:-postgresql://postgres:postgres@localhost:5432/postgres}"

echo "🚀 开始初始化数据库..."
echo "📡 数据库：$DB_URL"
echo ""

# 检查 psql 是否可用（本地或 Docker）
USE_DOCKER=false
if ! command -v psql &> /dev/null; then
    # 尝试使用 Docker 容器中的 psql
    if command -v docker &> /dev/null; then
        # 优先查找精确的容器名 mxmai-postgres（PostgreSQL 数据库容器）
        if docker ps --filter "name=^mxmai-postgres$" --format "{{.Names}}" | grep -q "^mxmai-postgres$"; then
            POSTGRES_CONTAINER="mxmai-postgres"
            echo "ℹ️  使用 Docker 容器执行：$POSTGRES_CONTAINER"
            USE_DOCKER=true
        else
            echo "❌ 错误：未找到 psql 命令，且没有运行中的 PostgreSQL 容器"
            echo ""
            echo "解决方案："
            echo "   1. 安装 PostgreSQL 客户端："
            echo "      macOS: brew install postgresql"
            echo "      Ubuntu: sudo apt-get install postgresql-client"
            echo ""
            echo "   2. 或启动 PostgreSQL 容器后重试："
            echo "      cd mxmdata && docker compose up -d postgres"
            echo ""
            echo "   3. 或使用 Supabase Dashboard 手动执行 SQL 文件"
            exit 1
        fi
    else
        echo "❌ 错误：未找到 psql 命令，且未安装 Docker"
        echo "   请安装 PostgreSQL 客户端或 Docker"
        exit 1
    fi
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_DIR="$SCRIPT_DIR/src/database/schemas"

# 检查 schema 目录是否存在
if [ ! -d "$SCHEMA_DIR" ]; then
    echo "❌ 错误：Schema 目录不存在：$SCHEMA_DIR"
    exit 1
fi

# SQL 文件列表（按执行顺序）
SQL_FILES=(
    "supabase-init.sql"
    "mxmauth.sql"
    "mxmpay.sql"
    "mxmcgi.sql"
    "mxmnotify.sql"
    "mxmprompt.sql"
    "knowledge_base.sql"
    "mxmagent_final_safe.sql"
)

# 提示启用 pgvector 扩展
echo "⚠️  重要提示："
echo "   1. 如果使用 Supabase 云服务，请先在 Dashboard 的 Extensions 页面启用 'vector' 扩展"
echo "   2. 如果使用本地 PostgreSQL，请确保使用支持 pgvector 的镜像"
echo ""
read -p "是否已启用 pgvector 扩展？(y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️  请先启用 pgvector 扩展，然后重新运行此脚本"
    exit 1
fi

# 执行每个 SQL 文件
SUCCESS_COUNT=0
FAILED_FILES=()

for sql_file in "${SQL_FILES[@]}"; do
    file_path="$SCHEMA_DIR/$sql_file"
    
    if [ ! -f "$file_path" ]; then
        echo "⚠️  警告：文件不存在，跳过：$sql_file"
        continue
    fi
    
    echo "📄 执行：$sql_file"
    
    if [ "$USE_DOCKER" = true ]; then
        # 通过 Docker 容器执行
        # 提取数据库连接信息（默认值）
        DB_NAME="postgres"
        DB_USER="postgres"
        
        # 尝试从 DB_URL 解析（如果提供）
        if [[ "$DB_URL" == *"://"* ]]; then
            DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p' || echo "postgres")
            DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p' || echo "postgres")
        fi
        
        # 读取文件内容并通过 docker exec 执行
        if docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$file_path" > /dev/null 2>&1; then
            echo "✅ 完成：$sql_file"
            ((SUCCESS_COUNT++))
        else
            echo "❌ 错误：执行 $sql_file 失败"
            echo "   提示：可以查看详细错误：docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME < $file_path"
            FAILED_FILES+=("$sql_file")
        fi
    else
        # 使用本地 psql
        if psql "$DB_URL" -f "$file_path" > /dev/null 2>&1; then
            echo "✅ 完成：$sql_file"
            ((SUCCESS_COUNT++))
        else
            echo "❌ 错误：执行 $sql_file 失败"
            FAILED_FILES+=("$sql_file")
        fi
    fi
    echo ""
done

# 输出总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 初始化总结："
echo "   ✅ 成功：$SUCCESS_COUNT 个文件"
echo "   ❌ 失败：${#FAILED_FILES[@]} 个文件"

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
    echo ""
    echo "失败的文件："
    for file in "${FAILED_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo "💡 提示：请检查错误信息，可能需要："
    echo "   1. 检查数据库连接是否正确"
    echo "   2. 检查是否已启用 pgvector 扩展"
    echo "   3. 检查执行顺序是否正确"
    exit 1
else
    echo ""
    echo "🎉 数据库初始化完成！"
    echo ""
    echo "📋 下一步："
    echo "   1. 验证表是否已创建："
    echo "      psql \"$DB_URL\" -c \"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;\""
    echo ""
    echo "   2. 验证扩展是否已启用："
    echo "      psql \"$DB_URL\" -c \"SELECT * FROM pg_extension WHERE extname = 'vector';\""
fi

