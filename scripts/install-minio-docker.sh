#!/usr/bin/env bash
# 主力机 MinIO（Docker，不下载二进制）
# 用法：sudo bash install-minio-docker.sh

set -euo pipefail

log() { echo "[minio-docker] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 运行" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_SRC="${SCRIPT_DIR}/docker/minio-compose.yml"
COMPOSE_DST="/opt/minio/docker-compose.yml"
ENV_FILE="/etc/default/minio"

# 停掉可能存在的二进制 systemd 安装
if systemctl is-active minio &>/dev/null; then
  systemctl stop minio || true
  systemctl disable minio || true
fi

COMPOSE="docker compose"
MINIO_IMAGE="${MINIO_IMAGE:-docker.m.daocloud.io/minio/minio:latest}"
MC_IMAGE="${MC_IMAGE:-docker.m.daocloud.io/minio/mc:latest}"

configure_docker_mirror() {
  if [[ -f /etc/docker/daemon.json ]]; then
    return
  fi
  log "配置 Docker 镜像加速..."
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run"
  ]
}
JSON
  systemctl restart docker
  sleep 2
}

if ! command -v docker &>/dev/null; then
  log "安装 Docker（Ubuntu docker.io，国内镜像源友好）..."
  apt-get update -qq
  apt-get install -y -qq docker.io
  systemctl enable docker
  systemctl start docker
fi

docker --version
configure_docker_mirror
if ! docker compose version &>/dev/null; then
  if command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
  else
    apt-get install -y -qq docker-compose-v2 2>/dev/null || true
  fi
fi
$COMPOSE version

mkdir -p /opt/minio/data
chmod 755 /opt/minio /opt/minio/data

if [[ -f "$ENV_FILE" ]] && grep -q '^MINIO_ROOT_USER=' "$ENV_FILE"; then
  log "沿用已有凭证 $ENV_FILE"
else
  MINIO_ROOT_USER="mxmminio"
  MINIO_ROOT_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)"
  cat > "$ENV_FILE" <<EOF
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 MinIO 凭证 → $ENV_FILE"
fi

# shellcheck disable=SC1091
source "$ENV_FILE"

mkdir -p /opt/minio
sed "s|image: minio/minio:latest|image: ${MINIO_IMAGE}|g" "$COMPOSE_SRC" > "$COMPOSE_DST"

log "拉取镜像并启动 MinIO 容器 (${MINIO_IMAGE})..."
docker pull "$MINIO_IMAGE"
$COMPOSE -f "$COMPOSE_DST" up -d

for i in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://127.0.0.1:9000/minio/health/live" 2>/dev/null; then
    log "MinIO 就绪 (Docker, 127.0.0.1:9000)"
    echo "MINIO_ACCESS_KEY=${MINIO_ROOT_USER}"
    echo "MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD}"
    docker ps --filter name=minio --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

    log "创建存储桶 aigc / user-assets / system-assets..."
    docker pull "$MC_IMAGE" 2>/dev/null || true
    docker run --rm --network host --entrypoint /bin/sh "$MC_IMAGE" -c "
      mc alias set local http://127.0.0.1:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}'
      for b in aigc user-assets system-assets; do
        mc mb --ignore-existing \"local/\$b\" || true
      done
      mc ls local
    "
    exit 0
  fi
  sleep 1
done

docker logs minio --tail 30 2>&1 || true
echo "MinIO 启动超时" >&2
exit 1
