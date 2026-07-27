#!/usr/bin/env bash
# 杭州主力机 → 香港 ECS 全量迁移（代码 + MinIO 对象 + 生产 .env）
#
# 用法（项目根目录）:
#   SOURCE_SSH_PASS='...' TARGET_SSH_PASS='...' bash scripts/migrate-hangzhou-to-hongkong.sh
#   ... --via-source          # 经杭州跳板连香港（本地无法直连香港时）
#   ... --skip-funasr         # 不同步 /root/.cache/modelscope
#   ... --verify-only
#
# 环境变量: SOURCE_HOST TARGET_HOST SOURCE_SSH_PASS TARGET_SSH_PASS DEPLOY_PATH

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOURCE_HOST="${SOURCE_HOST:-root@121.43.32.168}"
TARGET_HOST="${TARGET_HOST:-root@8.218.14.129}"
SOURCE_IP="${SOURCE_HOST#*@}"
TARGET_IP="${TARGET_HOST#*@}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"

SKIP_DATA=false
SKIP_FUNASR=false
VERIFY_ONLY=false
SKIP_BUILD=false
VIA_SOURCE=false
FORCE_DIRECT=false
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-/root/.cache/modelscope}"

for arg in "$@"; do
  case "$arg" in
    --skip-data) SKIP_DATA=true ;;
    --skip-funasr) SKIP_FUNASR=true ;;
    --verify-only) VERIFY_ONLY=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --via-source) VIA_SOURCE=true ;;
    --direct) FORCE_DIRECT=true ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

log() { echo "[migrate] $*"; }
die() { echo "[migrate] ERROR: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null || die "缺少命令: $1"
}

need_cmd sshpass ssh curl

if [[ -z "${SOURCE_SSH_PASS:-}" || -z "${TARGET_SSH_PASS:-}" ]]; then
  die "请设置 SOURCE_SSH_PASS 与 TARGET_SSH_PASS 环境变量（勿写入 git）"
fi

ssh_src() {
  SSHPASS="$SOURCE_SSH_PASS" sshpass -e ssh \
    -o StrictHostKeyChecking=accept-new \
    -o PreferredAuthentications=password,publickey \
    -o ConnectTimeout=20 \
    "$SOURCE_HOST" "$@"
}

_ssh_dst_direct() {
  SSHPASS="$TARGET_SSH_PASS" sshpass -e ssh \
    -o StrictHostKeyChecking=accept-new \
    -o PreferredAuthentications=password,publickey \
    -o ConnectTimeout=20 \
    "$TARGET_HOST" "$@"
}

ensure_source_sshpass() {
  ssh_src "command -v sshpass >/dev/null || (export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get install -y -qq sshpass)"
}

# 在杭州机上执行 ssh/scp 到香港
ssh_dst() {
  if [[ "$VIA_SOURCE" == true ]]; then
    ensure_source_sshpass
    local remote_cmd
    remote_cmd=$(printf '%q ' "$@")
    ssh_src "SSHPASS='$TARGET_SSH_PASS' sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 root@${TARGET_IP} ${remote_cmd}"
  else
    _ssh_dst_direct "$@"
  fi
}

scp_to_dst() {
  local src="$1"
  local dest="$2"
  if [[ "$VIA_SOURCE" == true ]]; then
    ensure_source_sshpass
    local base
    base="$(basename "$src")"
    ssh_src "mkdir -p /tmp/migrate-staging"
    SSHPASS="$SOURCE_SSH_PASS" sshpass -e scp \
      -o StrictHostKeyChecking=accept-new \
      "$src" "${SOURCE_HOST}:/tmp/migrate-staging/${base}"
    ssh_src "SSHPASS='$TARGET_SSH_PASS' sshpass -e scp -o StrictHostKeyChecking=accept-new /tmp/migrate-staging/${base} root@${TARGET_IP}:${dest}"
  else
    SSHPASS="$TARGET_SSH_PASS" sshpass -e scp \
      -o StrictHostKeyChecking=accept-new \
      "$src" "${TARGET_HOST}:${dest}"
  fi
}

rsync_via_tar() {
  local label="$1"
  local src_path="$2"
  local dst_path="$3"
  log "同步 ${label}: ${SOURCE_IP}:${src_path} → ${TARGET_IP}:${dst_path}"
  if [[ "$VIA_SOURCE" == true ]]; then
    ensure_source_sshpass
    ssh_src "tar -C / -cf - ${src_path#/} | \
      SSHPASS='$TARGET_SSH_PASS' sshpass -e ssh -o StrictHostKeyChecking=accept-new root@${TARGET_IP} \
      'mkdir -p $(dirname "$dst_path") && tar -C / -xf -'"
  else
    ssh_src "tar -C / -cf - ${src_path#/}" | _ssh_dst_direct "mkdir -p $(dirname "$dst_path") && tar -C / -xf -"
  fi
}

curl_target() {
  local url="$1"
  if [[ "$VIA_SOURCE" == true ]]; then
    ssh_src "curl -fsS --connect-timeout 15 '${url}'" 2>/dev/null || true
  else
    curl -fsS --connect-timeout 15 "$url" 2>/dev/null || true
  fi
}

curl_target_code() {
  local url="$1"
  if [[ "$VIA_SOURCE" == true ]]; then
    ssh_src "curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 15 '${url}'" 2>/dev/null || echo 000
  else
    curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 15 "$url" 2>/dev/null || echo 000
  fi
}

ensure_source_to_target_ssh() {
  local pubkey
  pubkey="$(ssh_src "cat /root/.ssh/id_ed25519.pub 2>/dev/null || cat /root/.ssh/id_rsa.pub 2>/dev/null || (ssh-keygen -t ed25519 -N '' -f /root/.ssh/id_ed25519 -q && cat /root/.ssh/id_ed25519.pub)")"
  ssh_dst "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && \
    grep -qxF '${pubkey}' /root/.ssh/authorized_keys || echo '${pubkey}' >> /root/.ssh/authorized_keys"
  ssh_src "ssh-keyscan -H ${TARGET_IP} >> ~/.ssh/known_hosts 2>/dev/null || true"
}

sync_funasr_modelscope_cache() {
  log "同步 FunASR ModelScope 缓存 ${SOURCE_IP} → ${TARGET_IP} ..."
  ssh_src "test -d '${MODELSCOPE_CACHE}'" || {
    log "源机无 ${MODELSCOPE_CACHE}，跳过（视频 ASR 首次将在线下载模型，易超时）"
    return 0
  }
  local src_size model_count
  src_size="$(ssh_src "du -sh '${MODELSCOPE_CACHE}' 2>/dev/null | awk '{print \$1}'")"
  model_count="$(ssh_src "find '${MODELSCOPE_CACHE}' -name 'model.pt' 2>/dev/null | wc -l")"
  log "源机缓存 ${src_size}，model.pt × ${model_count// /}"

  if ssh_src "ssh -o BatchMode=yes -o ConnectTimeout=15 root@${TARGET_IP} 'echo ok'" >/dev/null 2>&1; then
    log "杭州直连香港 rsync（推荐）..."
    ssh_src "mkdir -p /root/.cache && rsync -az --delete '${MODELSCOPE_CACHE}/' root@${TARGET_IP}:'${MODELSCOPE_CACHE}/'"
  else
    ensure_source_to_target_ssh
    log "经杭州 sshpass 管道同步 ModelScope 缓存..."
    ssh_src "tar -C /root/.cache -cf - modelscope | \
      SSHPASS='${TARGET_SSH_PASS}' sshpass -e ssh -o StrictHostKeyChecking=accept-new root@${TARGET_IP} \
      'mkdir -p /root/.cache && rm -rf ${MODELSCOPE_CACHE} && tar -C /root/.cache -xf -'"
  fi

  local dst_count dst_size
  dst_count="$(ssh_dst "find '${MODELSCOPE_CACHE}' -name 'model.pt' 2>/dev/null | wc -l")"
  dst_size="$(ssh_dst "du -sh '${MODELSCOPE_CACHE}' 2>/dev/null | awk '{print \$1}'")"
  log "香港缓存 ${dst_size}，model.pt × ${dst_count// /}"
  if [[ "${dst_count// /}" -lt 3 ]]; then
    log "WARN: ModelScope 缓存可能不完整（期望 ≥3 个 model.pt），视频 ASR 仍可能超时"
  fi
}

verify_remote() {
  log "验收 ${TARGET_IP} ..."
  local health code_root code_minio
  health="$(curl_target "http://${TARGET_IP}/health")"
  code_root="$(curl_target_code "http://${TARGET_IP}/")"
  code_minio="$(ssh_dst "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/minio/health/live 2>/dev/null || echo 000")"

  echo "  /health     => ${health:-FAILED}"
  echo "  /           => HTTP ${code_root}"
  echo "  minio local => HTTP ${code_minio}"

  ssh_dst "pm2 list; echo '---'; df -h / /opt/minio/data 2>/dev/null; du -sh ${DEPLOY_PATH} /opt/minio/data 2>/dev/null || true"
  ssh_dst "command -v ffprobe >/dev/null && ffprobe -version 2>&1 | head -1 || echo '  ffprobe => MISSING (video pipeline 需要 apt install ffmpeg)'"
  ssh_dst "test -d '${MODELSCOPE_CACHE}' && du -sh '${MODELSCOPE_CACHE}' && find '${MODELSCOPE_CACHE}' -name 'model.pt' 2>/dev/null | wc -l | xargs -I{} echo '  model.pt count => {}' || echo '  FunASR modelscope cache => MISSING (视频 ASR 将在线下载，易 600s 超时)'"

  [[ -n "$health" ]] || die "Gateway /health 不可达"
  [[ "$code_root" == "200" ]] || die "Web 首页 HTTP ${code_root}"
  [[ "$code_minio" == "200" ]] || die "MinIO 健康检查失败 HTTP ${code_minio}"
  log "验收通过"
}

detect_route() {
  if [[ "$FORCE_DIRECT" == true ]]; then
    VIA_SOURCE=false
    return
  fi
  if [[ "$VIA_SOURCE" == true ]]; then
    return
  fi
  if _ssh_dst_direct "echo direct_ok" >/dev/null 2>&1; then
    log "直连香港 SSH 可用"
    VIA_SOURCE=false
  else
    log "本地无法直连香港，改用杭州跳板 (--via-source)"
    VIA_SOURCE=true
  fi
}

if [[ "$VERIFY_ONLY" == true ]]; then
  detect_route
  verify_remote
  exit 0
fi

log "检查 SSH 连通性..."
ssh_src "echo source_ok" >/dev/null || die "无法 SSH 杭州 ${SOURCE_IP}:22"
detect_route
ssh_dst "echo target_ok" >/dev/null || die "无法 SSH 香港 ${TARGET_IP}:22"

# ── 1. 初始化香港基础环境 ─────────────────────────────────────
log "香港机 bootstrap（Node/pnpm/pm2/nginx/redis/docker）..."
scp_to_dst "$ROOT/scripts/bootstrap-server.sh" "/tmp/bootstrap-server.sh"
ssh_dst "bash /tmp/bootstrap-server.sh"

ssh_dst "mkdir -p ${DEPLOY_PATH}/scripts/nginx /opt/minio/data /etc/default"
scp_to_dst "$ROOT/scripts/nginx/supermxmai.conf" "${DEPLOY_PATH}/scripts/nginx/supermxmai.conf"
ssh_dst "sed -e 's/YOUR_DOMAIN/_/' -e 's/121\\.43\\.32\\.168/${TARGET_IP}/g' -e 's/8\\.210\\.129\\.25/${TARGET_IP}/g' \
  ${DEPLOY_PATH}/scripts/nginx/supermxmai.conf \
  > /etc/nginx/sites-available/supermxmai.conf && \
  ln -sf /etc/nginx/sites-available/supermxmai.conf /etc/nginx/sites-enabled/supermxmai.conf && \
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true && nginx -t && systemctl reload nginx"

# ── 2. 同步 MinIO 凭证与数据 ───────────────────────────────────
log "同步 MinIO 凭证 /etc/default/minio ..."
ssh_src "test -f /etc/default/minio" || die "杭州缺少 /etc/default/minio"
ssh_src "cat /etc/default/minio" | ssh_dst "cat > /etc/default/minio && chmod 600 /etc/default/minio"

if [[ "$SKIP_DATA" != true ]]; then
  rsync_via_tar "MinIO 数据" "/opt/minio/data" "/opt/minio/data"
fi

log "安装并启动香港 MinIO Docker..."
scp_to_dst "$ROOT/scripts/install-minio-docker.sh" "/tmp/install-minio-docker.sh"
ssh_dst "command -v docker >/dev/null || (export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get install -y -qq docker.io docker-compose-v2 && systemctl enable docker && systemctl start docker)"
ssh_dst "bash /tmp/install-minio-docker.sh"

# ── 3. 同步应用目录 ───────────────────────────────────────────
if [[ "$SKIP_DATA" != true ]]; then
  log "同步应用目录 ${DEPLOY_PATH}（约 2～3GB）..."
  rsync_via_tar "应用" "$DEPLOY_PATH" "$DEPLOY_PATH"
else
  log "跳过全量目录，改为本地构建部署..."
  [[ "$SKIP_BUILD" == true ]] || bash scripts/build-prod.sh
  if [[ "$VIA_SOURCE" == true ]]; then
    die "--skip-data 模式下经跳板部署请改用全量同步，或在本机直连香港后 deploy:server"
  fi
  DEPLOY_HOST="$TARGET_HOST" DEPLOY_SSH_PASS="$TARGET_SSH_PASS" \
    bash scripts/deploy-to-server.sh -- --skip-build
  ssh_src "cat ${DEPLOY_PATH}/.env" | ssh_dst "cat > ${DEPLOY_PATH}/.env"
fi

if [[ "$SKIP_FUNASR" != true ]]; then
  sync_funasr_modelscope_cache
fi

# 同步 patch 脚本（全量 tar 已含则跳过）
scp_to_dst "$ROOT/scripts/patch-env-minio-local.sh" "${DEPLOY_PATH}/scripts/patch-env-minio-local.sh"

# ── 4. 修补 .env ───────────────────────────────────────────────
log "更新 PUBLIC_GATEWAY_ORIGIN / CORS / MinIO ..."
ssh_dst "cd ${DEPLOY_PATH} && \
  if grep -q '^PUBLIC_GATEWAY_ORIGIN=' .env; then \
    sed -i 's|^PUBLIC_GATEWAY_ORIGIN=.*|PUBLIC_GATEWAY_ORIGIN=http://${TARGET_IP}|' .env; \
  else echo 'PUBLIC_GATEWAY_ORIGIN=http://${TARGET_IP}' >> .env; fi && \
  if grep -q '^CORS_ORIGIN=' .env; then \
    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=http://${TARGET_IP},http://8.136.186.242,http://121.43.32.168,http://localhost:3000,http://localhost:5173|' .env; \
  else echo 'CORS_ORIGIN=http://${TARGET_IP},http://8.136.186.242,http://121.43.32.168,http://localhost:3000,http://localhost:5173' >> .env; fi && \
  if grep -q '^MINIO_ENDPOINT=' .env; then sed -i 's|^MINIO_ENDPOINT=.*|MINIO_ENDPOINT=127.0.0.1|' .env; fi && \
  if grep -q '^REDIS_HOST=' .env; then sed -i 's|^REDIS_HOST=.*|REDIS_HOST=localhost|' .env; fi && \
  grep -q '^REDIS_ENABLED=' .env || echo 'REDIS_ENABLED=true' >> .env"

ssh_dst "source /etc/default/minio && \
  MINIO_ACCESS_KEY=\${MINIO_ROOT_USER} MINIO_SECRET_KEY=\${MINIO_ROOT_PASSWORD} \
  PUBLIC_GATEWAY_ORIGIN=http://${TARGET_IP} \
  bash ${DEPLOY_PATH}/scripts/patch-env-minio-local.sh ${DEPLOY_PATH}/.env"

# ── 5. pm2 启动 ─────────────────────────────────────────────────
log "启动 pm2 服务..."
scp_to_dst "$ROOT/scripts/ecosystem.config.cjs" "${DEPLOY_PATH}/scripts/ecosystem.config.cjs"
ssh_dst "cd ${DEPLOY_PATH} && pm2 delete all 2>/dev/null || true; \
  pm2 start scripts/ecosystem.config.cjs && pm2 save && \
  pm2 startup systemd -u root --hp /root 2>/dev/null || true"

PUBKEY="$(cat "${HOME}/.ssh/id_ed25519.pub" 2>/dev/null || cat "${HOME}/.ssh/id_rsa.pub" 2>/dev/null || true)"
if [[ -n "$PUBKEY" ]]; then
  ssh_dst "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && \
    grep -qxF '$PUBKEY' /root/.ssh/authorized_keys || echo '$PUBKEY' >> /root/.ssh/authorized_keys"
fi

sleep 8
verify_remote

cat <<EOF

════════════════════════════════════════════════════════════
迁移完成（杭州 → 香港）

  Gateway:   http://${TARGET_IP}/health
  Admin Web: http://${TARGET_IP}/
  路由模式:  $([[ "$VIA_SOURCE" == true ]] && echo '经杭州跳板' || echo '直连')

后续: 更新 DNS / H5 反代 → 观察 24h → 下线杭州机
安全: 请轮换 root 密码
════════════════════════════════════════════════════════════
EOF
