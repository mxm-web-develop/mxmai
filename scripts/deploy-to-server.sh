#!/usr/bin/env bash
# 本地构建 + 同步到生产 ECS + pm2 reload
#
# 用法（项目根目录）:
#   pnpm deploy:server                    # 全量：后端 + web
#   pnpm deploy:server -- --web-only      # 仅 web/dist
#   pnpm deploy:server -- --backend-only  # 仅后端 dist（含 mxmdata）
#   pnpm deploy:server -- --skip-build    # 跳过构建，只 rsync 已有 dist
#   pnpm deploy:server -- --install       # 同步 lock 后在服务器 pnpm install
#   pnpm deploy:server -- --with-setup    # 首次：bootstrap + nginx + .env + install
#   pnpm deploy:server -- --setup-only    # 仅初始化服务器环境
#
# 环境变量（可选）:
#   DEPLOY_HOST=root@121.43.32.168
#   DEPLOY_PATH=/opt/supermxmai
#   DEPLOY_SSH_PASS=...   # 可选，新机未配置密钥时用 sshpass

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"

DO_BUILD=true
DO_WEB=true
DO_BACKEND=true
DO_INSTALL=false
DO_SETUP=false
SETUP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --) ;;
    --skip-build) DO_BUILD=false ;;
    --web-only) DO_BACKEND=false ;;
    --backend-only) DO_WEB=false ;;
    --install) DO_INSTALL=true ;;
    --setup-only) SETUP_ONLY=true; DO_SETUP=true ;;
    --with-setup) DO_SETUP=true ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: ${arg}（可用 --web-only | --backend-only | --skip-build | --install | --with-setup | --setup-only）" >&2
      exit 1
      ;;
  esac
done

log() { echo "[deploy] $*"; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh \
      -o StrictHostKeyChecking=accept-new \
      -o PreferredAuthentications=password,publickey \
      "$DEPLOY_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  fi
}

scp_cmd() {
  local src="$1"
  local dest="$2"
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e scp \
      -o StrictHostKeyChecking=accept-new \
      -o PreferredAuthentications=password,publickey \
      "$src" "$dest"
  else
    scp -o StrictHostKeyChecking=accept-new "$src" "$dest"
  fi
}

rsync_dist() {
  local src="$1"
  local dest="$2"
  if [[ ! -d "$src" ]]; then
    echo "缺少构建产物: $src（请先 pnpm build:prod 或去掉 --skip-build）" >&2
    exit 1
  fi
  log "sync $src -> ${DEPLOY_HOST}:${dest}"
  # --delete-delay：先传完新文件再删旧 hash，避免 index.html 已指向新 bundle 而 assets 尚未落盘导致 404
  local rsync_flags=(-az --delete-delay)
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e rsync "${rsync_flags[@]}" \
      -e "ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,publickey" \
      "$src/" "${DEPLOY_HOST}:${dest}/"
  else
    rsync "${rsync_flags[@]}" "$src/" "${DEPLOY_HOST}:${dest}/"
  fi
}

if [[ "$DO_SETUP" == true ]]; then
  log "初始化主力服务器 ${DEPLOY_HOST}..."
  scp_cmd "$ROOT/scripts/bootstrap-server.sh" "${DEPLOY_HOST}:/tmp/bootstrap-server.sh"
  ssh_cmd "bash /tmp/bootstrap-server.sh"

  ssh_cmd "mkdir -p ${DEPLOY_PATH}/scripts/nginx"
  scp_cmd "$ROOT/scripts/nginx/supermxmai.conf" "${DEPLOY_HOST}:${DEPLOY_PATH}/scripts/nginx/supermxmai.conf"
  ssh_cmd "sed 's/YOUR_DOMAIN/_/g' ${DEPLOY_PATH}/scripts/nginx/supermxmai.conf > /etc/nginx/sites-available/supermxmai.conf && ln -sf /etc/nginx/sites-available/supermxmai.conf /etc/nginx/sites-enabled/supermxmai.conf && rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true && nginx -t && systemctl reload nginx"

  ssh_cmd "mkdir -p ${DEPLOY_PATH}"
  if ssh_cmd "test -f ${DEPLOY_PATH}/.env"; then
    log "服务器已有 .env，跳过覆盖（避免冲掉 Supabase Cloud 等生产配置）"
  else
    if [[ ! -f "$ROOT/.env" ]]; then
      echo "缺少 $ROOT/.env，无法同步生产环境变量" >&2
      exit 1
    fi
    log "首次同步本地 .env → 请确认 SUPABASE_URL 等为 Cloud 配置，勿用 localhost"
    scp_cmd "$ROOT/.env" "${DEPLOY_HOST}:${DEPLOY_PATH}/.env"
  fi
  MAIN_IP="${DEPLOY_HOST#*@}"
  ssh_cmd "cd ${DEPLOY_PATH} && \
    if grep -q '^PUBLIC_GATEWAY_ORIGIN=' .env; then \
      sed -i 's|^PUBLIC_GATEWAY_ORIGIN=.*|PUBLIC_GATEWAY_ORIGIN=http://${MAIN_IP}|' .env; \
    else \
      echo 'PUBLIC_GATEWAY_ORIGIN=http://${MAIN_IP}' >> .env; \
    fi && \
    if grep -q '^CORS_ORIGIN=' .env; then \
      sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=http://${MAIN_IP},http://8.136.186.242,http://localhost:3000|' .env; \
    else \
      echo 'CORS_ORIGIN=http://${MAIN_IP},http://8.136.186.242,http://localhost:3000' >> .env; \
    fi"
  scp_cmd "$ROOT/package.json" "${DEPLOY_HOST}:${DEPLOY_PATH}/package.json"
  scp_cmd "$ROOT/pnpm-lock.yaml" "${DEPLOY_HOST}:${DEPLOY_PATH}/pnpm-lock.yaml"
  scp_cmd "$ROOT/pnpm-workspace.yaml" "${DEPLOY_HOST}:${DEPLOY_PATH}/pnpm-workspace.yaml"

  for pkg in mxmdata gateway mxmauth mxmpay mxmcgi mxmnotify; do
    scp_cmd "$ROOT/$pkg/package.json" "${DEPLOY_HOST}:${DEPLOY_PATH}/$pkg/package.json"
  done
  ssh_cmd "mkdir -p ${DEPLOY_PATH}/{mxmdata,gateway,mxmauth,mxmpay,mxmcgi,mxmnotify,web,scripts}/dist"

  log "服务器 pnpm install（首次较慢）..."
  ssh_cmd "cd ${DEPLOY_PATH} && pnpm install -r --no-frozen-lockfile && pnpm approve-builds bcrypt esbuild sharp 2>/dev/null || true"

  PUBKEY="$(cat "${HOME}/.ssh/id_ed25519.pub" 2>/dev/null || true)"
  if [[ -n "$PUBKEY" ]]; then
    ssh_cmd "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && grep -qxF '$PUBKEY' /root/.ssh/authorized_keys || echo '$PUBKEY' >> /root/.ssh/authorized_keys"
    log "已写入本机 SSH 公钥，后续可免密部署"
  fi
fi

if [[ "$SETUP_ONLY" == true ]]; then
  log "setup-only 完成"
  exit 0
fi

if [[ "$DO_BUILD" == true ]]; then
  if [[ "$DO_WEB" == true && "$DO_BACKEND" == true ]]; then
    log "本地构建（mxmdata + 6 后端 + web）..."
    bash scripts/build-prod.sh
  elif [[ "$DO_WEB" == true ]]; then
    log "本地构建 web..."
    bash scripts/sync-agent-skill.sh
    pnpm --filter web exec vite build
  else
    log "本地构建后端..."
    pnpm --filter @mxmai/mxmdata run build:dist
    pnpm build:gateway
    pnpm build:mxmauth
    pnpm build:mxmpay
    pnpm build:mxmcgi
    pnpm build:mxmnotify
  fi
fi

if [[ "$DO_BACKEND" == true ]]; then
  ssh_cmd "mkdir -p ${DEPLOY_PATH}/{mxmdata,gateway,mxmauth,mxmpay,mxmcgi,mxmnotify,web,scripts}/dist"
  for pkg in mxmdata gateway mxmauth mxmpay mxmcgi mxmnotify; do
    if [[ -f "$ROOT/$pkg/package.json" ]]; then
      scp_cmd "$ROOT/$pkg/package.json" "${DEPLOY_HOST}:${DEPLOY_PATH}/$pkg/package.json"
    fi
  done
  rsync_dist "$ROOT/mxmdata/dist" "$DEPLOY_PATH/mxmdata/dist"
  rsync_dist "$ROOT/gateway/dist" "$DEPLOY_PATH/gateway/dist"
  rsync_dist "$ROOT/mxmauth/dist" "$DEPLOY_PATH/mxmauth/dist"
  rsync_dist "$ROOT/mxmpay/dist" "$DEPLOY_PATH/mxmpay/dist"
  rsync_dist "$ROOT/mxmcgi/dist" "$DEPLOY_PATH/mxmcgi/dist"
  if [[ -d "$ROOT/mxmcgi/assets" ]]; then
    rsync_dist "$ROOT/mxmcgi/assets" "$DEPLOY_PATH/mxmcgi/assets"
  fi
  if [[ -d "$ROOT/mxmcgi/scripts" ]]; then
    rsync_dist "$ROOT/mxmcgi/scripts" "$DEPLOY_PATH/mxmcgi/scripts"
  fi
  # PPTX 编译微服务（FastAPI + build_pptx_from_ir.py），供 ecosystem pptx-compiler / renderPptx 使用
  if [[ -d "$ROOT/mxmcgi/tools/pptx-compiler" ]]; then
    ssh_cmd "mkdir -p ${DEPLOY_PATH}/mxmcgi/tools"
    rsync_dist "$ROOT/mxmcgi/tools/pptx-compiler" "$DEPLOY_PATH/mxmcgi/tools/pptx-compiler"
    if [[ -f "$ROOT/mxmcgi/tools/pptx-compiler/requirements.txt" ]]; then
      log "准备 pptx-compiler venv 并安装依赖..."
      ssh_cmd "set -euo pipefail; VENV=${DEPLOY_PATH}/.venv-pptx-compiler; if [[ ! -x \"\$VENV/bin/python\" ]]; then python3 -m venv \"\$VENV\"; fi; \"\$VENV/bin/pip\" install -q -r ${DEPLOY_PATH}/mxmcgi/tools/pptx-compiler/requirements.txt"
    fi
  fi
  if [[ -f "$ROOT/mxmcgi/requirements-asr.txt" ]]; then
    scp_cmd "$ROOT/mxmcgi/requirements-asr.txt" "${DEPLOY_HOST}:${DEPLOY_PATH}/mxmcgi/requirements-asr.txt"
  fi
  rsync_dist "$ROOT/mxmnotify/dist" "$DEPLOY_PATH/mxmnotify/dist"
  if [[ -d "$ROOT/shared/gsap-storyboard" ]]; then
    ssh_cmd "mkdir -p ${DEPLOY_PATH}/shared/gsap-storyboard"
    rsync_dist "$ROOT/shared/gsap-storyboard" "$DEPLOY_PATH/shared/gsap-storyboard"
  fi
  if [[ -d "$ROOT/artifacts/gsap-playground/_shared" ]]; then
    ssh_cmd "mkdir -p ${DEPLOY_PATH}/artifacts/gsap-playground/_shared"
    rsync_dist "$ROOT/artifacts/gsap-playground/_shared" "$DEPLOY_PATH/artifacts/gsap-playground/_shared"
  fi
  if [[ -d "$ROOT/scripts/lib" ]]; then
    ssh_cmd "mkdir -p ${DEPLOY_PATH}/scripts/lib"
    rsync_dist "$ROOT/scripts/lib" "$DEPLOY_PATH/scripts/lib"
  fi
  ssh_cmd "mkdir -p ${DEPLOY_PATH}/scripts"
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e rsync -az \
      -e "ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,publickey" \
      "$ROOT/scripts/ecosystem.config.cjs" "${DEPLOY_HOST}:${DEPLOY_PATH}/scripts/ecosystem.config.cjs"
  else
    rsync -az "$ROOT/scripts/ecosystem.config.cjs" "${DEPLOY_HOST}:${DEPLOY_PATH}/scripts/ecosystem.config.cjs"
  fi
fi

if [[ "$DO_WEB" == true ]]; then
  rsync_dist "$ROOT/web/dist" "$DEPLOY_PATH/web/dist"
fi

if [[ "$DO_INSTALL" == true ]]; then
  log "同步 package.json / pnpm-lock.yaml 并在服务器 install..."
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e rsync -az \
      -e "ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,publickey" \
      "$ROOT/package.json" "$ROOT/pnpm-lock.yaml" "$ROOT/pnpm-workspace.yaml" \
      "${DEPLOY_HOST}:${DEPLOY_PATH}/"
  else
    rsync -az "$ROOT/package.json" "$ROOT/pnpm-lock.yaml" "$ROOT/pnpm-workspace.yaml" \
      "${DEPLOY_HOST}:${DEPLOY_PATH}/"
  fi
  ssh_cmd "cd ${DEPLOY_PATH} && pnpm install --frozen-lockfile"
fi

if [[ "$DO_BACKEND" == true ]]; then
  log "pm2 reload..."
  ssh_cmd "cd ${DEPLOY_PATH} && pm2 delete all 2>/dev/null || true; pm2 start scripts/ecosystem.config.cjs && pm2 save && pm2 startup systemd -u root --hp /root 2>/dev/null || true"
fi

if [[ "$DO_WEB" == true && "$DO_BACKEND" == false ]]; then
  log "web 静态已更新（Nginx 直接读 web/dist，无需 pm2 reload）"
fi

log "完成。验收: curl -sS http://${DEPLOY_HOST#*@}/health"
