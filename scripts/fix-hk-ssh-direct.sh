#!/usr/bin/env bash
# 修复香港机 SSH：支持本地经 Clash/VPN 直连（不依赖杭州跳板）
#
# 用法 A — 阿里云 Workbench 在香港 ECS 上执行（推荐，仅需一次）:
#   bash scripts/fix-hk-ssh-direct.sh --print-remote | ssh 粘贴到 Workbench
#   或直接复制 --print-remote 输出
#
# 用法 B — 本地有香港 root 密码，经国内副机一次性写入（仅初始化）:
#   HK_SSH_PASS='...' bash scripts/fix-hk-ssh-direct.sh --via-cn-edge
#
# 用法 C — 验证本地直连（需 Clash TUN/全局 + 已执行过修复）:
#   bash scripts/fix-hk-ssh-direct.sh --verify
#
# 环境变量:
#   HK_HOST=mxm-hk   # 8.218.14.129:2222
#   BASTION_HOST=root@8.136.186.242   # 仅 --via-cn-edge 用，国内副机长期保留
#   SSH_PUBKEY_FILE=~/.ssh/id_ed25519.pub

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HK_HOST="${HK_HOST:-mxm-hk}"
HK_IP="${HK_IP:-8.218.14.129}"
HK_IP="${HK_HOST#*@}"
BASTION_HOST="${BASTION_HOST:-root@8.136.186.242}"
PUBKEY_FILE="${SSH_PUBKEY_FILE:-${HOME}/.ssh/id_ed25519.pub}"

MODE="${1:-}"

log() { echo "[fix-hk-ssh] $*"; }
die() { echo "[fix-hk-ssh] ERROR: $*" >&2; exit 1; }

read_pubkey() {
  if [[ -f "$PUBKEY_FILE" ]]; then
    cat "$PUBKEY_FILE"
  elif [[ -f "${HOME}/.ssh/id_rsa.pub" ]]; then
    cat "${HOME}/.ssh/id_rsa.pub"
  else
    die "未找到公钥，请设置 SSH_PUBKEY_FILE 或生成 ~/.ssh/id_ed25519"
  fi
}

remote_fix_body() {
  local pubkey="$1"
  cat <<REMOTE
set -euo pipefail
echo "[remote] 修复 SSH 直连 + ffmpeg ..."

mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qxF '${pubkey}' /root/.ssh/authorized_keys || echo '${pubkey}' >> /root/.ssh/authorized_keys

# fail2ban 常在 VPN/共享 IP 上于握手前封禁，表现为 kex_exchange_identification: Connection closed
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client unban --all 2>/dev/null || true
  mkdir -p /etc/fail2ban
  if [[ -f /etc/fail2ban/jail.local ]]; then
    grep -q '^[[:space:]]*enabled[[:space:]]*=[[:space:]]*false' /etc/fail2ban/jail.local 2>/dev/null || \
      sed -i '/^\[sshd\]/,/^\[/ s/^enabled = true/enabled = false/' /etc/fail2ban/jail.local 2>/dev/null || true
  fi
  cat > /etc/fail2ban/jail.d/mxm-ssh-lenient.conf <<'F2B'
[sshd]
enabled = false
F2B
  systemctl restart fail2ban 2>/dev/null || true
  echo "[remote] fail2ban sshd jail 已关闭"
fi

# 确保 sshd 允许密钥登录
if grep -q '^PermitRootLogin' /etc/ssh/sshd_config; then
  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
else
  echo 'PermitRootLogin prohibit-password' >> /etc/ssh/sshd_config
fi
if grep -q '^PubkeyAuthentication' /etc/ssh/sshd_config; then
  sed -i 's/^PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
fi
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || service ssh reload

# OpenSSH 10.x：共享 VPN 出口 IP 易被 PerSourcePenalties 罚掉，Clash 直连握手失败
cat >> /etc/ssh/sshd_config.d/60-mxm-kex-compat.conf <<'SSHD'
KexAlgorithms curve25519-sha256,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group-exchange-sha256
Ciphers chacha20-poly1305@openssh.com,aes128-ctr,aes256-ctr
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com
PerSourcePenalties no
SSHD
sshd -t 2>/dev/null && systemctl reload ssh 2>/dev/null || true

# 视频管线依赖
if ! command -v ffprobe >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ffmpeg
fi

echo "[remote] authorized_keys:"
wc -l /root/.ssh/authorized_keys
ffprobe -version 2>&1 | head -1 || echo "[remote] ffprobe 仍缺失"
echo "[remote] 完成。请在本地 Clash 开 TUN/全局后: ssh root@${HK_IP}"
REMOTE
}

print_remote() {
  local pubkey
  pubkey="$(read_pubkey)"
  remote_fix_body "$pubkey"
}

via_cn_edge() {
  command -v sshpass >/dev/null || die "需要 sshpass: brew install sshpass"
  [[ -n "${HK_SSH_PASS:-}" ]] || die "请设置 HK_SSH_PASS（香港 root 密码，仅首次初始化）"

  local pubkey remote_script tmp
  pubkey="$(read_pubkey)"
  remote_script="$(mktemp)"
  remote_fix_body "$pubkey" > "$remote_script"

  log "经国内副机 ${BASTION_HOST} 一次性写入香港机（非日常跳板）..."
  scp -o StrictHostKeyChecking=accept-new "$remote_script" "${BASTION_HOST}:/tmp/fix-hk-ssh.sh"
  ssh -o StrictHostKeyChecking=accept-new "$BASTION_HOST" \
    "SSHPASS='$HK_SSH_PASS' sshpass -e ssh -o StrictHostKeyChecking=accept-new ${HK_HOST} 'bash -s'" < "$remote_script"
  rm -f "$remote_script"
  log "远程修复已执行"
}

verify_local() {
  log "检测本地 → ${HK_IP}（需 Clash TUN 或全局模式）..."
  if ! nc -zv -G 6 "$HK_IP" 22 2>&1 | grep -q succeeded; then
    die "TCP 22 不通：请开 Clash Verge TUN/全局，或添加规则代理 ${HK_IP}"
  fi
  log "TCP 22 通，尝试 SSH..."
  if ssh -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
    "$HK_HOST" 'echo SSH_DIRECT_OK; hostname; ffprobe -version 2>&1 | head -1'; then
    log "本地直连 SSH 成功"
  else
    die "SSH 仍失败。若 kex closed：请在 Workbench 执行: bash scripts/fix-hk-ssh-direct.sh --print-remote"
  fi
}

print_clash_hints() {
  cat <<'HINT'

── Clash Verge 设置（本地 SSH 必须走代理）──
1. 开启 TUN 模式（推荐），或系统代理 + 全局/Global
2. 规则模式下添加（替换为你的香港 IP）:
     IP-CIDR,8.218.14.129/32,PROXY
3. 终端验证出口 IP 已变:
     curl -4 ifconfig.me
4. 验证 SSH:
     nc -zv 8.218.14.129 2222
     ssh -p 2222 root@8.218.14.129

── 长期 ~/.ssh/config（修复后）──
Host mxm-hk
  HostName 8.218.14.129
  Port 2222
  User root
  IdentityFile ~/.ssh/id_ed25519

HINT
}

case "$MODE" in
  --print-remote)
    print_remote
    print_clash_hints
    ;;
  --via-cn-edge)
    via_cn_edge
    print_clash_hints
    ;;
  --verify)
    verify_local
    ;;
  -h|--help|"")
    sed -n '2,20p' "$0"
    echo ""
    echo "  --print-remote   输出 Workbench 一键脚本"
    echo "  --via-cn-edge    经国内副机一次性修复（需 HK_SSH_PASS）"
    echo "  --verify         验证本地 Clash 直连"
    print_clash_hints
    ;;
  *)
    die "未知参数: $MODE"
    ;;
esac
