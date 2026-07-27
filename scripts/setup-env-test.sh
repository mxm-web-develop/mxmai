#!/usr/bin/env bash
# 从主服务器 /opt/supermxmai/.env 生成本地 .env.test（Supabase + MinIO + 存储 + JWT）
# 用法：pnpm setup:env:test
# 可选：DEPLOY_HOST=root@121.43.32.168 DEPLOY_SSH_PASS=... pnpm setup:env:test

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
REMOTE_ENV="${DEPLOY_PATH:-/opt/supermxmai}/.env"
OUT="${ROOT}/.env.test"
EXAMPLE="${ROOT}/.env.test.example"
MINIO_TUNNEL_PORT="${MINIO_TUNNEL_LOCAL_PORT:-19000}"

log() { echo "[setup:env:test] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  fi
}

if [[ ! -f "$EXAMPLE" ]]; then
  echo "缺少 $EXAMPLE" >&2
  exit 1
fi

log "从 ${DEPLOY_HOST}:${REMOTE_ENV} 拉取生产配置..."
TMP_REMOTE="$(mktemp)"
trap 'rm -f "$TMP_REMOTE"' EXIT

REMOTE_KEYS=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_DB_URL
  JWT_SECRET
  JWT_ACCESS_TOKEN_EXPIRES_IN
  JWT_REFRESH_TOKEN_EXPIRES_IN
  JWT_CLOCK_TOLERANCE_SECONDS
  ADMIN_TOKEN
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  MINIO_REGION
  CGI_STORAGE_BUCKET
  STORAGE_GENERATED_PROVIDER
  STORAGE_GENERATED_BUCKET
  STORAGE_GENERATED_ACCESS
  STORAGE_USER_UPLOAD_PROVIDER
  STORAGE_USER_UPLOAD_BUCKET
  STORAGE_USER_UPLOAD_ACCESS
  STORAGE_USER_UPLOAD_PUBLIC_URL
  STORAGE_SYSTEM_STATIC_PROVIDER
  STORAGE_SYSTEM_STATIC_BUCKET
  STORAGE_SYSTEM_STATIC_ACCESS
  STORAGE_SYSTEM_STATIC_PUBLIC_URL
  R2_BUCKET
  DEFAULT_PROVIDER
  REPLICATE_API_TOKEN
  MAXPLAN_API_KEY
  QHAI_API_KEY
  QHAI_BASE_URL
  JIEKOU_API_KEY
  JIEKOU_BASE_URL
  OPENROUTER_API_KEY
  OPENAI_API_KEY
  ATLASCLOUD_API_KEY
  BRAVE_API_KEY
)

PATTERN="$(IFS='|'; echo "${REMOTE_KEYS[*]}")"
ssh_cmd "grep -E '^(${PATTERN})=' '${REMOTE_ENV}' 2>/dev/null || true" >"$TMP_REMOTE"

if [[ ! -s "$TMP_REMOTE" ]]; then
  echo "未能从远端读取配置，请检查 SSH 与 ${REMOTE_ENV}" >&2
  exit 1
fi

# 规范化 service key 变量名
if grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$TMP_REMOTE" && ! grep -q '^SUPABASE_SERVICE_KEY=' "$TMP_REMOTE"; then
  sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=/SUPABASE_SERVICE_KEY=/p' "$TMP_REMOTE" >>"$TMP_REMOTE"
fi

log "写入 ${OUT} ..."
cp "$EXAMPLE" "$OUT"

python3 <<PY
from pathlib import Path
import re

root = Path("${ROOT}")
out = root / ".env.test"
remote = Path("${TMP_REMOTE}")
tunnel_port = "${MINIO_TUNNEL_PORT}"

remote_vars = {}
for line in remote.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    remote_vars[k.strip()] = v.strip()

text = out.read_text()

def set_var(name, value):
    global text
    pat = rf"^{re.escape(name)}=.*$"
    if re.search(pat, text, flags=re.M):
        text = re.sub(pat, f"{name}={value}", text, flags=re.M)
    else:
        text += f"\n{name}={value}\n"

def remove_var(name):
    global text
    pat = rf"^{re.escape(name)}=.*\n?"
    text = re.sub(pat, "", text, flags=re.M)

for k, v in remote_vars.items():
    if k == "SUPABASE_SERVICE_ROLE_KEY":
        continue
    set_var(k, v)

# 远端未配置 service key 时删除模板占位符，避免 SupabaseClient 优先用无效 key
if "SUPABASE_SERVICE_KEY" not in remote_vars and "SUPABASE_SERVICE_ROLE_KEY" not in remote_vars:
    remove_var("SUPABASE_SERVICE_KEY")
elif "SUPABASE_SERVICE_ROLE_KEY" in remote_vars and "SUPABASE_SERVICE_KEY" not in remote_vars:
    set_var("SUPABASE_SERVICE_KEY", remote_vars["SUPABASE_SERVICE_ROLE_KEY"])

# 删除仍为 .env.test.example 占位符、且远端未提供的项
PLACEHOLDER_PREFIXES = ("your-", "sync-from-main-server")
OPTIONAL_REMOTE_KEYS = (
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_DB_URL",
    "REPLICATE_API_TOKEN",
    "MAXPLAN_API_KEY",
)
for name in OPTIONAL_REMOTE_KEYS:
    if name in remote_vars:
        continue
    m = re.search(rf"^{re.escape(name)}=(.*)$", text, flags=re.M)
    if m and any(m.group(1).startswith(p) for p in PLACEHOLDER_PREFIXES):
        remove_var(name)

# 本地 MinIO 经 SSH 隧道
set_var("MINIO_ENDPOINT", "127.0.0.1")
set_var("MINIO_PORT", tunnel_port)
set_var("MINIO_USE_SSL", "false")

# 本地 Gateway / Redis
set_var("PUBLIC_GATEWAY_ORIGIN", "http://localhost:3000")
set_var("PUBLIC_GATEWAY_ABSOLUTE_URLS", "0")
set_var("REDIS_ENABLED", "true")
set_var("REDIS_HOST", "localhost")
set_var("REDIS_PORT", "6379")

for name, val in [
    ("GATEWAY_PORT", "3000"),
    ("MXMAUTH_PORT", "4001"),
    ("MXMPAY_PORT", "4002"),
    ("MXMCGI_PORT", "4003"),
    ("WORKER_PORT", "4004"),
    ("SCHEDULER_PORT", "4006"),
    ("MXMNOTIFY_PORT", "4005"),
    ("MXMAUTH_URL", "http://localhost:4001"),
    ("MXMPAY_URL", "http://localhost:4002"),
    ("MXMCGI_URL", "http://localhost:4003"),
    ("MXMNOTIFY_URL", "http://localhost:4005"),
    ("CORS_ORIGIN", "http://localhost:3000,http://localhost:3100,http://localhost:5173,http://localhost:5174,http://localhost:5200"),
    ("MXMCGI_ROLE", "all"),
    ("CAPTCHA_ENABLE", "false"),
]:
    set_var(name, val)

# 存储走 proxy，由本地 Gateway 鉴权代理
for access in ("STORAGE_GENERATED_ACCESS", "STORAGE_USER_UPLOAD_ACCESS", "STORAGE_SYSTEM_STATIC_ACCESS"):
    if access not in remote_vars:
        set_var(access, "proxy")

header = (
    "# 由 pnpm setup:env:test 自动生成 — 连接主服务器 Supabase + MinIO\n"
    f"# 远端: ${DEPLOY_HOST} | MinIO 隧道端口: {tunnel_port}\n"
    "# 警告：操作的是生产数据，请谨慎测试\n"
)
if not text.startswith("# 由 pnpm setup:env:test"):
    text = header + text

out.write_text(text)
print(f"ok: {out}")
PY

log "完成。"
log "  1. 确保本机 Redis 已启动（brew services start redis 或 redis-server）"
log "  2. 启动 test 后端：pnpm dev:test"
log "  3. 可选覆盖：创建 .env.test.local（已 gitignore）"
