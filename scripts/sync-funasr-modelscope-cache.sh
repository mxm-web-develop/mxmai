#!/usr/bin/env bash
# 同步 FunASR ModelScope 模型缓存（杭州 → 香港，或任意 SOURCE → TARGET）
#
# 用法（项目根目录）:
#   bash scripts/sync-funasr-modelscope-cache.sh
#   SOURCE_HOST=root@121.43.32.168 TARGET_HOST=root@8.210.129.25 \
#     TARGET_SSH_PASS='...' bash scripts/sync-funasr-modelscope-cache.sh
#
# 优先杭州直连香港 rsync（快）；无密钥时用 sshpass；最后才经本机 tar 管道（慢）。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOURCE_HOST="${SOURCE_HOST:-root@121.43.32.168}"
TARGET_HOST="${TARGET_HOST:-root@8.218.14.129}"
SOURCE_IP="${SOURCE_HOST#*@}"
TARGET_IP="${TARGET_HOST#*@}"
CACHE_PATH="${MODELSCOPE_CACHE:-/root/.cache/modelscope}"

log() { echo "[funasr-cache] $*"; }
die() { echo "[funasr-cache] ERROR: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null || die "缺少命令: $1"
}

need_cmd ssh

ssh_src() {
  if [[ -n "${SOURCE_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$SOURCE_SSH_PASS" sshpass -e ssh \
      -o StrictHostKeyChecking=accept-new \
      -o PreferredAuthentications=password,publickey \
      -o ConnectTimeout=20 \
      "$SOURCE_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SOURCE_HOST" "$@"
  fi
}

ssh_dst() {
  if [[ -n "${TARGET_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$TARGET_SSH_PASS" sshpass -e ssh \
      -o StrictHostKeyChecking=accept-new \
      -o PreferredAuthentications=password,publickey \
      -o ConnectTimeout=20 \
      "$TARGET_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$TARGET_HOST" "$@"
  fi
}

cache_summary() {
  local host="$1"
  local runner="$2"
  $runner "test -d '${CACHE_PATH}'" || { echo "  ${host}: (missing)"; return 1; }
  $runner "du -sh '${CACHE_PATH}' 2>/dev/null; find '${CACHE_PATH}' -name 'model.pt' 2>/dev/null | wc -l"
}

verify_cache_complete() {
  local runner="$1"
  local count
  count="$($runner "find '${CACHE_PATH}' -name 'model.pt' 2>/dev/null | wc -l")"
  [[ "${count// /}" -ge 3 ]] || die "ModelScope 缓存不完整（model.pt 仅 ${count} 个，期望 ≥3）"
}

ensure_hz_to_hk_key() {
  local pubkey
  pubkey="$(ssh_src "cat /root/.ssh/id_ed25519.pub 2>/dev/null || cat /root/.ssh/id_rsa.pub 2>/dev/null || (ssh-keygen -t ed25519 -N '' -f /root/.ssh/id_ed25519 -q && cat /root/.ssh/id_ed25519.pub)")"
  ssh_dst "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && \
    grep -qxF '${pubkey}' /root/.ssh/authorized_keys || echo '${pubkey}' >> /root/.ssh/authorized_keys"
  ssh_src "ssh-keyscan -H ${TARGET_IP} >> ~/.ssh/known_hosts 2>/dev/null || true"
}

sync_direct_rsync() {
  log "杭州直连香港 rsync（推荐，约 1～3 分钟）..."
  ensure_hz_to_hk_key
  ssh_src "mkdir -p /root/.cache && rsync -az --delete '${CACHE_PATH}/' root@${TARGET_IP}:'${CACHE_PATH}/'"
}

sync_via_sshpass() {
  [[ -n "${TARGET_SSH_PASS:-}" ]] || return 1
  need_cmd sshpass
  log "经杭州 sshpass 管道同步..."
  ssh_src "test -d '${CACHE_PATH}'" || die "源机缺少 ${CACHE_PATH}"
  ssh_src "tar -C /root/.cache -cf - modelscope | \
    SSHPASS='${TARGET_SSH_PASS}' sshpass -e ssh -o StrictHostKeyChecking=accept-new root@${TARGET_IP} \
    'mkdir -p /root/.cache && rm -rf ${CACHE_PATH} && tar -C /root/.cache -xf -'"
}

sync_via_local_pipe() {
  log "经本机 tar 管道同步（最慢，约 10～20 分钟，不推荐）..."
  ssh_src "test -d '${CACHE_PATH}'" || die "源机缺少 ${CACHE_PATH}"
  ssh_src "tar -C /root/.cache -cf - modelscope" | \
    ssh_dst "mkdir -p /root/.cache && rm -rf '${CACHE_PATH}' && tar -C /root/.cache -xf -"
}

log "源机 ${SOURCE_IP} 缓存:"
cache_summary "$SOURCE_IP" ssh_src || die "源机无 FunASR 模型缓存，请先在源机跑通一次 ASR"

log "目标机 ${TARGET_IP} 同步前:"
cache_summary "$TARGET_IP" ssh_dst || true

if ssh_src "ssh -o BatchMode=yes -o ConnectTimeout=10 root@${TARGET_IP} 'echo ok'" >/dev/null 2>&1; then
  sync_direct_rsync
elif sync_via_sshpass; then
  :
else
  sync_via_local_pipe
fi

log "目标机 ${TARGET_IP} 同步后:"
cache_summary "$TARGET_IP" ssh_dst
verify_cache_complete ssh_dst

log "完成。可验收: ssh ${TARGET_HOST} 'du -sh ${CACHE_PATH}; find ${CACHE_PATH} -name model.pt'"
