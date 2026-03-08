#!/bin/bash

# 项目迁移脚本
# 用于复制 supermxmai 项目结构到新项目

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
  echo -e "${RED}❌ 错误: 请提供新项目名称${NC}"
  echo "用法: ./migrate-project.sh <新项目名称> [目标路径]"
  echo "示例: ./migrate-project.sh mynewproject ~/Desktop/codes/"
  exit 1
fi

NEW_PROJECT_NAME="$1"
TARGET_DIR="${2:-$(dirname "$(pwd)")}"
NEW_PROJECT_PATH="$TARGET_DIR/$NEW_PROJECT_NAME"
CURRENT_DIR="$(pwd)"

echo -e "${BLUE}🚀 开始迁移项目...${NC}"
echo -e "${YELLOW}源项目: $CURRENT_DIR${NC}"
echo -e "${YELLOW}目标项目: $NEW_PROJECT_PATH${NC}"
echo ""

# 检查目标目录是否已存在
if [ -d "$NEW_PROJECT_PATH" ]; then
  echo -e "${RED}❌ 错误: 目标目录已存在: $NEW_PROJECT_PATH${NC}"
  read -p "是否删除并重新创建? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
  rm -rf "$NEW_PROJECT_PATH"
fi

# 创建目标目录
mkdir -p "$NEW_PROJECT_PATH"

echo -e "${GREEN}📦 复制项目文件...${NC}"

# 需要迁移的目录（只迁移基础架构模块，不迁移业务模块）
MIGRATE_DIRS=(
  "gateway"
  "docs-generator"
  "mxmauth"
  "mxmdata"
  "mxmnotify"
  "moblie"
  "scripts"
  "web"
)

# 需要迁移的根目录配置文件
ROOT_FILES=(
  "package.json"
  "pnpm-workspace.yaml"
  "tsconfig.base.json"
  "tsconfig.json"
  "tsup.config.ts"
  "vitest.config.ts"
  "init-project.ts"
  "start-services.sh"
  ".gitignore"
)

# 需要排除的目录和文件（在复制时排除）
EXCLUDE_PATTERNS=(
  "node_modules"
  ".git"
  "dist"
  "build"
  ".next"
  ".expo"
  "ios/build"
  "android/build"
  "*.log"
  ".DS_Store"
  "coverage"
  ".env"
  ".env.local"
  ".env.*.local"
)

# 业务模块（明确排除）
BUSINESS_MODULES=(
  "mxmcgi"
  "mxmagent"
  "mxmpay"
  "mxmprompt"
  "mxmservice"
  "mxmcommunity"
)

echo -e "${BLUE}📋 将迁移以下模块:${NC}"
for dir in "${MIGRATE_DIRS[@]}"; do
  if [ -d "$CURRENT_DIR/$dir" ]; then
    echo -e "  ✅ $dir"
  else
    echo -e "  ⚠️  $dir (不存在，将跳过)"
  fi
done
echo ""

echo -e "${YELLOW}📋 将排除以下业务模块:${NC}"
for module in "${BUSINESS_MODULES[@]}"; do
  echo -e "  ❌ $module"
done
echo ""

# 复制根目录配置文件
echo -e "${GREEN}📄 复制根目录配置文件...${NC}"
for file in "${ROOT_FILES[@]}"; do
  if [ -f "$CURRENT_DIR/$file" ] || [ -d "$CURRENT_DIR/$file" ]; then
    cp -r "$CURRENT_DIR/$file" "$NEW_PROJECT_PATH/$file" 2>/dev/null || true
    echo -e "  ✅ $file"
  fi
done
echo ""

# 复制指定的目录
echo -e "${GREEN}📁 复制模块目录...${NC}"
for dir in "${MIGRATE_DIRS[@]}"; do
  if [ -d "$CURRENT_DIR/$dir" ]; then
    echo -e "  📦 复制 $dir..."
    
    # 构建排除参数
    EXCLUDE_ARGS=""
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
      EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$pattern"
    done
    
    # 使用 rsync 复制（如果可用）
    if command -v rsync &> /dev/null; then
      rsync -av --progress $EXCLUDE_ARGS "$CURRENT_DIR/$dir/" "$NEW_PROJECT_PATH/$dir/"
    else
      # 使用 find 和 cp 的组合
      find "$CURRENT_DIR/$dir" -type f \
        ! -path "*/node_modules/*" \
        ! -path "*/.git/*" \
        ! -path "*/dist/*" \
        ! -path "*/build/*" \
        ! -path "*/.next/*" \
        ! -path "*/.expo/*" \
        ! -path "*/ios/build/*" \
        ! -path "*/android/build/*" \
        ! -name "*.log" \
        ! -name ".DS_Store" \
        ! -name ".env" \
        ! -name ".env.local" \
        ! -name ".env.*.local" \
        -exec sh -c 'mkdir -p "$3/$(dirname "${1#$2/}")" && cp "$1" "$3/${1#$2/}"' _ {} "$CURRENT_DIR" "$NEW_PROJECT_PATH" \;
    fi
    echo -e "  ✅ $dir 复制完成"
  fi
done

echo -e "${GREEN}✅ 文件复制完成${NC}"
echo ""

# 进入新项目目录进行配置更新
echo -e "${BLUE}📝 在新项目中更新配置文件...${NC}"
cd "$NEW_PROJECT_PATH"

# 创建迁移配置模板（在新项目目录中）
if [ ! -f "migration-config.json" ]; then
  echo -e "${GREEN}📝 创建迁移配置模板...${NC}"
  cat > migration-config.json <<EOF
{
  "oldProjectName": "@mxmai",
  "newProjectName": "@${NEW_PROJECT_NAME}",
  "oldProjectDescription": "MXM AI Collection",
  "newProjectDescription": "${NEW_PROJECT_NAME} Project",
  "oldAuthor": "hanfeng_Zhang",
  "newAuthor": "YOUR_NAME",
  "replacements": {
    "@mxmai": "@${NEW_PROJECT_NAME}",
    "@mxmweb": "@${NEW_PROJECT_NAME}",
    "mxmai": "${NEW_PROJECT_NAME}",
    "mxmweb": "${NEW_PROJECT_NAME}",
    "MXM AI Collection": "${NEW_PROJECT_NAME} Project",
    "hanfeng_Zhang": "YOUR_NAME"
  },
  "services": {
    "mxmauth": "auth",
    "mxmnotify": "notify",
    "mxmdata": "data",
    "gateway": "gateway"
  }
}
EOF
  echo -e "${GREEN}✅ 迁移配置已创建: migration-config.json${NC}"
  echo -e "${YELLOW}⚠️  请编辑 migration-config.json 以自定义替换规则${NC}"
fi

# 更新 pnpm-workspace.yaml（只包含迁移的模块，仅在新项目中）
echo -e "${GREEN}📝 更新新项目的 pnpm-workspace.yaml...${NC}"
cat > pnpm-workspace.yaml <<EOF
packages:
  - mxmauth
  - mxmnotify
  - mxmdata
  - gateway
EOF
echo -e "${GREEN}✅ pnpm-workspace.yaml 已更新（仅在新项目中）${NC}"

# 更新 tsconfig.json（移除业务模块，只在新项目中）
if [ -f "tsconfig.json" ]; then
  echo -e "${GREEN}📝 更新新项目的 tsconfig.json...${NC}"
  cat > tsconfig.json <<'TSCONFIG_EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "baseUrl": "."
  },
  "include": [
    "mxmauth/src/**/*.ts",
    "mxmnotify/src/**/*.ts",
    "mxmdata/src/**/*.ts",
    "gateway/src/**/*.ts"
  ]
}
TSCONFIG_EOF
  echo -e "${GREEN}✅ tsconfig.json 已更新（仅在新项目中）${NC}"
fi
echo ""

echo -e "${GREEN}🎉 项目结构复制完成！${NC}"
echo -e "${BLUE}✅ 源项目 (supermxmai) 未被修改，所有更改仅在新项目中进行${NC}"
echo ""
echo -e "${BLUE}下一步操作:${NC}"
echo "1. 进入新项目目录: cd $NEW_PROJECT_PATH"
echo "2. 编辑 migration-config.json 配置替换规则"
echo "3. 运行替换脚本: tsx replace-project-names.ts"
echo "4. 更新根目录 package.json 中的 scripts（移除业务模块相关命令）"
echo "5. 安装依赖: pnpm install"
echo "6. 配置环境变量: 复制各服务的 .env.example 并修改"
echo "7. 初始化项目: pnpm init:project"
echo ""
echo -e "${YELLOW}📖 详细指南请查看: MIGRATION_GUIDE.md${NC}"
echo ""
echo -e "${YELLOW}⚠️  重要提示:${NC}"
echo "   - ✅ 源项目 supermxmai 保持原样，可继续开发"
echo "   - ✅ 所有配置更新仅在新项目中进行"
echo "   - ✅ mxmservice 模块未被使用，已自动排除"
