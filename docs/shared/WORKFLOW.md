# SuperMXMai — Hermes Agent 工作流记忆

## 项目路径
`/Users/mxm_pro/Desktop/codes/supermxmai/`

## 项目背景
SuperMXMai 是一个多模态 AI 内容生成 SaaS 平台（pnpm monorepo），包含 6 个微服务。OpenClaw 在此项目上有大量历史工作记录和记忆文件。本文件记录 Hermes Agent 对此项目的理解和待处理事项。

## OpenClaw 历史记忆文件
OpenClaw 在项目中留下了大量文档，位于以下位置：
- `/Users/mxm_pro/Desktop/codes/supermxmai/memory/` — 每日笔记（2026-03 至 2026-04）
- `/Users/mxm_pro/Desktop/codes/supermxmai/docs/` — 深度分析文档（MXMCGI_SUMMARY、SMARTFLOW_BUSINESS_NODE_REDESIGN 等）
- `/Users/mxm_pro/Desktop/codes/supermxmai/.openclaw/workspace/` — OpenClaw 工作区
- `/Users/mxm_pro/Desktop/codes/supermxmai/MXM*.md` — 各模块设计文档（MXMAGENT、MXMCGI、MXMDATA 等）

## 关键待处理项（来自 OpenClaw memory/）

### Smartflow 相关
1. **Model 节点 video/sound** — 后端未实现（2026-04-09 记录）
2. **test/run 模式区分** — 参数已接收但无实际区分（无实时反馈）
3. **Python 代码执行器** — tools 节点中不可用
4. **爬虫节点** — tools 节点中不可用
5. **generation_steps / media_assets 表** — 未创建

### 项目整体
- 版本升级准备（3月份已完成项目分析）
- 确认 pipeline 是 Task v2 的单任务前后处理机制，不是多任务工作流

## Hermes Agent 参与方式

### 双记忆系统
- **CLAUDE.md** — Claude Code 读取的上下文（项目结构、命令、节点状态）
- **WORKFLOW.md** — Hermes Agent 工作流记忆（本文档）
- 每次完成项目工作后，同步更新两处记忆

### 角色分配建议
- **Developer**: Smartflow 后端完善（video/sound 节点、Python 执行器）
- **Expert**: 技术调研、竞品分析、文档撰写
- **Designer**: 前端 UI 优化（节点着色、test/run 区分）
- **PM**: 需求梳理、产品规划

## 项目技术栈
- **Runtime**: Node.js ≥22, pnpm ≥8
- **Monorepo**: pnpm workspace + tsup
- **Database**: Supabase (PostgreSQL) via PostgREST
- **Storage**: MinIO (S3-compatible)
- **Cache**: Redis
- **框架**: Express (gateway/services), React (web)

## 快速启动
```bash
cd /Users/mxm_pro/Desktop/codes/supermxmai
pnpm install
pnpm build:mxmdata
pnpm dev:all
# Agent / Smartflow 随 mxmcgi-api 启动，无独立 mxmagent 包
```

## 环境配置
- 核心配置: `mxmdata/.env`（SUPABASE_URL、SUPABASE_ANON_KEY、JWT_SECRET、MinIO）
- 各服务可在自目录建 `.env` 覆盖，但不建议覆盖核心配置

---

*创建时间: 2026-04-21 by Hermes Agent*
*最后更新: 2026-04-21*
