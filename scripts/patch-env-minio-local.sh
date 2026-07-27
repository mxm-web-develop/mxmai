#!/usr/bin/env bash
# 将 /opt/supermxmai/.env 三块存储切到本地 MinIO（保留 Supabase Cloud）
# 用法：MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=... bash patch-env-minio-local.sh [env_file]

set -euo pipefail

ENV_FILE="${1:-/opt/supermxmai/.env}"
GATEWAY_ORIGIN="${PUBLIC_GATEWAY_ORIGIN:-http://121.43.32.168}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${MINIO_ACCESS_KEY:-}" || -z "${MINIO_SECRET_KEY:-}" ]]; then
  if [[ -f /etc/default/minio ]]; then
    # shellcheck disable=SC1091
    source /etc/default/minio
    MINIO_ACCESS_KEY="${MINIO_ROOT_USER:-}"
    MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD:-}"
  fi
fi

if [[ -z "${MINIO_ACCESS_KEY:-}" || -z "${MINIO_SECRET_KEY:-}" ]]; then
  echo "请设置 MINIO_ACCESS_KEY / MINIO_SECRET_KEY 或先安装 MinIO" >&2
  exit 1
fi

python3 <<PY
from pathlib import Path
import re

path = Path("${ENV_FILE}")
text = path.read_text()

def set_var(name, value):
    global text
    pat = rf"^{re.escape(name)}=.*$"
    if re.search(pat, text, flags=re.M):
        text = re.sub(pat, f"{name}={value}", text, flags=re.M)
    else:
        text += f"\n{name}={value}\n"

set_var("MINIO_ENDPOINT", "127.0.0.1")
set_var("MINIO_PORT", "9000")
set_var("MINIO_USE_SSL", "false")
set_var("MINIO_ACCESS_KEY", "${MINIO_ACCESS_KEY}")
set_var("MINIO_SECRET_KEY", "${MINIO_SECRET_KEY}")
set_var("MINIO_REGION", "us-east-1")

for domain, access in [
    ("STORAGE_GENERATED_PROVIDER", "minio"),
    ("STORAGE_GENERATED_BUCKET", "aigc"),
    ("STORAGE_GENERATED_ACCESS", "proxy"),
    ("STORAGE_USER_UPLOAD_PROVIDER", "minio"),
    ("STORAGE_USER_UPLOAD_BUCKET", "user-assets"),
    ("STORAGE_USER_UPLOAD_ACCESS", "public"),
    ("STORAGE_SYSTEM_STATIC_PROVIDER", "minio"),
    ("STORAGE_SYSTEM_STATIC_BUCKET", "system-assets"),
    ("STORAGE_SYSTEM_STATIC_ACCESS", "public"),
    ("CGI_STORAGE_BUCKET", "aigc"),
    ("R2_BUCKET", "user-assets"),
]:
    set_var(domain, access)

set_var("PUBLIC_GATEWAY_ORIGIN", "${GATEWAY_ORIGIN}")
set_var("PUBLIC_GATEWAY_ABSOLUTE_URLS", "1")

path.write_text(text)
print(f"patched {path}")
PY
