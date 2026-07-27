# MXM Agent Skill 安装

## 1. 获取 Skill 包

在 SuperMXMai Web **账号中心 → API Token**：

1. 创建 **个人访问凭证**（非「开放 API 客户端」）
2. 点击 **下载 Agent Skill**，得到 `mxm-agent-platform.zip`

## 2. 配置密钥

解压后编辑 `.env`（由 `.env.example` 复制）：

```bash
MXM_BASE_URL=https://你的-gateway-地址
MXM_API_KEY=mxm_创建时复制的一次性密钥
```

**切勿**把 Key 写进 `SKILL.md` 或提交 git。

## 3. 安装到 Cursor

```bash
mkdir -p ~/.cursor/skills/mxm-agent-platform
cp -R mxm-agent-platform/* ~/.cursor/skills/mxm-agent-platform/
```

Cursor 会自动发现 `SKILL.md`。重启 Cursor 或新开 Agent 会话后生效。

## 4. 安装到 OpenClaw

将解压目录放到 OpenClaw 的 skills 目录（以你本地 OpenClaw 配置为准），例如：

```bash
cp -R mxm-agent-platform ~/.openclaw/skills/mxm-agent-platform
```

在 OpenClaw workspace 的 `TOOLS.md` 中补充：

```markdown
### MXM 平台
- Skill: mxm-agent-platform
- Base URL: （与 .env 一致）
- 验证: `node ~/.openclaw/skills/mxm-agent-platform/scripts/mxm-catalog.mjs`
```

## 5. 验证

```bash
cd mxm-agent-platform
cp .env.example .env   # 若尚未配置
# 编辑 .env 填入 MXM_BASE_URL 与 MXM_API_KEY
node scripts/mxm-catalog.mjs
```

应输出 JSON catalog，含 `taskV2`、`smartflows`（不含第三方 `publishedSlugs`）。

## 6. 更新

平台新增业务后 **无需重装 Skill**；Agent 重新执行 catalog 即可。

Skill 模板源文件在 `.cursor/skills/mxm_agent_platform/`。维护后在本仓库根目录执行：

```bash
pnpm sync:agent-skill
```

会将模板同步到 `web/public/agent-skill/`（Web 下载 zip 与生产静态资源）。`pnpm build:web` / `pnpm build:prod` 也会自动同步。

若调用协议变更，从账号中心重新下载 Skill 包覆盖安装。
