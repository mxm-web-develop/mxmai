#!/bin/bash
# deploy.sh — SuperMXMai 一键部署脚本

set -e
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
DEPLOY_LOG="$PROJECT_ROOT/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

mkdir -p "$PROJECT_ROOT/logs"
exec > >(tee "$DEPLOY_LOG") 2>&1

SKIP_INFRA=false
SKIP_DB=false
SKIP_ACCOUNTS=false
SKIP_SERVICES=false
FORCE=false

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "  --skip-infra      跳过基础设施"
  echo "  --skip-db         跳过数据库初始化"
  echo "  --skip-accounts   跳过账户创建"
  echo "  --skip-services   跳过服务启动"
  echo "  --force           强制重新执行"
  echo "  --help            显示帮助"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-infra) SKIP_INFRA=true; shift ;;
    --skip-db) SKIP_DB=true; shift ;;
    --skip-accounts) SKIP_ACCOUNTS=true; shift ;;
    --skip-services) SKIP_SERVICES=true; shift ;;
    --force) FORCE=true; shift ;;
    --help) usage; exit 0 ;;
    *) error "未知参数: $1"; usage; exit 1 ;;
  esac
done

# ============================================================
# Phase 0: 环境检查
# ============================================================
phase0_check() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 0: 环境检查"
  echo "═══════════════════════════════════════════════"

  local errors=0

  if ! command -v node &>/dev/null; then
    error "Node.js 未安装"
    errors=$((errors + 1))
  else
    local node_version=$(node -v | sed 's/v//')
    local major=$(echo "$node_version" | cut -d. -f1)
    if [[ "$major" -lt 22 ]]; then
      error "Node.js 版本过低，需要 >=22，当前 $node_version"
      errors=$((errors + 1))
    else
      info "Node.js v$node_version ✓"
    fi
  fi

  if ! command -v pnpm &>/dev/null; then
    error "pnpm 未安装"
    errors=$((errors + 1))
  else
    info "pnpm $(pnpm -v) ✓"
  fi

  if ! command -v docker &>/dev/null; then
    error "Docker 未安装"
    errors=$((errors + 1))
  else
    info "Docker $(docker --version | awk '{print $4}') ✓"
  fi

  if docker compose version &>/dev/null; then
    info "Docker Compose ✓"
  elif docker-compose --version &>/dev/null; then
    info "Docker Compose ✓"
  else
    error "Docker Compose 未安装"
    errors=$((errors + 1))
  fi

  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
      warn ".env 不存在，复制 .env.example 为 .env"
      cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    else
      error ".env 文件不存在"
      errors=$((errors + 1))
    fi
  else
    info ".env 文件存在 ✓"
  fi

  if [[ $errors -gt 0 ]]; then
    error "环境检查失败 ($errors 个错误)"
    exit 1
  fi

  info "环境检查通过 ✓"
}

# ============================================================
# Phase 1: 基础设施
# ============================================================
phase1_infra() {
  if [[ "$SKIP_INFRA" == true ]]; then
    warn "跳过基础设施 (--skip-infra)"
    return
  fi

  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 1: 启动基础设施"
  echo "═══════════════════════════════════════════════"

  cd "$PROJECT_ROOT"

  if docker ps --format '{{.Names}}' | grep -q 'supabase-supabase-db-1'; then
    info "Supabase 已在运行，跳过"
  else
    info "启动 Supabase..."
    docker compose up -d supabase-db supabase-postgres-rest
    info "等待数据库就绪..."
    sleep 10
    local retries=30
    while ! docker exec supabase-supabase-db-1 pg_isready -U postgres -d postgres &>/dev/null && [[ $retries -gt 0 ]]; do
      sleep 1
      retries=$((retries - 1))
    done
    if [[ $retries -eq 0 ]]; then
      error "Supabase 数据库启动超时"
      exit 1
    fi
    info "Supabase 就绪 ✓"
  fi

  if docker ps --format '{{.Names}}' | grep -q 'minio'; then
    info "MinIO 已在运行，跳过"
  else
    info "启动 MinIO..."
    docker compose up -d minio
    info "MinIO 启动 ✓"
  fi

  info "基础设施就绪 ✓"
}

# ============================================================
# Phase 2: 数据库初始化
# ============================================================
phase2_database() {
  if [[ "$SKIP_DB" == true ]]; then
    warn "跳过数据库初始化 (--skip-db)"
    return
  fi

  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 2: 数据库初始化"
  echo "═══════════════════════════════════════════════"

  cd "$PROJECT_ROOT"
  set -a && source "$PROJECT_ROOT/.env" && set +a

  if [[ ! -d "mxmdata/dist" ]] || [[ "$FORCE" == true ]]; then
    info "构建 mxmdata..."
    pnpm build:mxmdata
  fi

  info "执行数据库 schema..."
  pnpm --filter @mxmai/mxmdata run init:db

  local migrations=(
    "migrate:provider-models"
    "migrate:provider-balances"
    "migrate:provider-pricing"
    "migrate:provider-api-keys"
  )

  for migration in "${migrations[@]}"; do
    info "执行迁移: $migration"
    pnpm --filter @mxmai/mxmdata run "$migration" 2>/dev/null || warn "迁移 $migration 无需执行或已存在"
  done

  if [[ -f "$PROJECT_ROOT/setup_pricing.sql" ]]; then
    info "应用定价配置..."
    local db_url="${SUPABASE_DB_URL}"
    local password="${db_url##*:@*/}"
    local clean_url="${db_url%%:*}://${db_url##*:@}"
    PGPASSWORD="$password" psql "$clean_url" -f "$PROJECT_ROOT/setup_pricing.sql" 2>/dev/null || warn "定价 SQL 执行失败，跳过"
  fi

  info "数据库初始化完成 ✓"
}

# ============================================================
# Phase 3: 账户初始化
# ============================================================
phase3_accounts() {
  if [[ "$SKIP_ACCOUNTS" == true ]]; then
    warn "跳过账户创建 (--skip-accounts)"
    return
  fi

  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 3: 创建系统账户"
  echo "═══════════════════════════════════════════════"

  cd "$PROJECT_ROOT"
  set -a && source "$PROJECT_ROOT/.env" && set +a

  if [[ -n "${ADMIN_EMAIL:-}" ]] && [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    info "创建管理员账户..."
    pnpm --filter @mxmai/mxmdata run create:admin
  else
    warn "未配置 ADMIN_EMAIL 和 ADMIN_PASSWORD，跳过管理员创建"
    info "可后续执行: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=xxx pnpm --filter @mxmai/mxmdata run create:admin"
  fi

  info "初始化 Prompt 模板..."
  pnpm --filter @mxmai/mxmcgi run seed:prompt-config 2>/dev/null || warn "Prompt 模板已存在"

  info "账户初始化完成 ✓"
}

# ============================================================
# Phase 4: 服务启动
# ============================================================
phase4_services() {
  if [[ "$SKIP_SERVICES" == true ]]; then
    warn "跳过服务启动 (--skip-services)"
    return
  fi

  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 4: 启动服务"
  echo "═══════════════════════════════════════════════"

  cd "$PROJECT_ROOT"
  bash scripts/clear-ports.sh 2>/dev/null || true

  info "启动后端服务..."
  pnpm dev:all &

  sleep 5

  local services=("mxmauth:4001" "gateway:3000")
  for svc in "${services[@]}"; do
    local name="${svc%%:*}"
    local port="${svc##*:}"
    if lsof -i :"$port" -sTCP:LISTEN -P -n &>/dev/null; then
      info "$name (端口 $port) 就绪 ✓"
    else
      warn "$name (端口 $port) 未启动"
    fi
  done

  info "服务启动完成 ✓"
}

# ============================================================
# Phase 5: 健康检查
# ============================================================
phase5_health() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  Phase 5: 健康检查"
  echo "═══════════════════════════════════════════════"

  local failed=0

  check_endpoint() {
    local name=$1
    local url=$2
    if curl -sf "$url" &>/dev/null; then
      info "$name: OK ✓"
    else
      error "$name: FAIL ✗"
      failed=$((failed + 1))
    fi
  }

  check_endpoint "Gateway" "http://localhost:3000/health"
  check_endpoint "mxmauth" "http://localhost:4001/health"

  if [[ $failed -eq 0 ]]; then
    info ""
    info "🎉 部署成功！"
  else
    error "⚠️  $failed 个检查失败，详见日志: $DEPLOY_LOG"
  fi
}

# ============================================================
# 主流程
# ============================================================
main() {
  echo ""
  echo "╔═══════════════════════════════════════════════╗"
  echo "║     SuperMXMai 部署脚本 v1.0                ║"
  echo "╚═══════════════════════════════════════════════╝"
  echo ""

  phase0_check
  phase1_infra
  phase2_database
  phase3_accounts
  phase4_services
  phase5_health

  info "完整日志: $DEPLOY_LOG"
}

main "$@"
