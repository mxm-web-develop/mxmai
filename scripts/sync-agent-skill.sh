#!/usr/bin/env bash
# 将 Agent Skill 模板从 .cursor/skills 同步到 web/public（供下载 zip 与静态托管）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/.cursor/skills/mxm_agent_platform"
DEST="${ROOT}/web/public/agent-skill/mxm-agent-platform"

if [[ ! -d "$SRC" ]]; then
  echo "[sync-agent-skill] 源目录不存在: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST/scripts"
rsync -a --delete \
  --exclude '.DS_Store' \
  "$SRC/" "$DEST/"

echo "[sync-agent-skill] $SRC -> $DEST"
