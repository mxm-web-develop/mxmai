# SuperMXMai 项目介绍

## 项目名称

**SuperMXMai**（@mxmai / MXM AI Collection）—— 基于多模态 AI 的一站式内容生成与业务中台。

---

## 主要功能

- **用户与认证**：注册、登录、JWT 签发与刷新、个人资料、验证码
- **支付与钱包**：支付订单、多资产钱包、余额与流水、充值/扣减
- **AI 内容生成（mxmcgi）**：图文音视频多模态生成
  - **图像**：摄影/设计/绘画等场景（多模型与 Provider 路由）
  - **写作**：文章、歌词、脚本、大纲、简历、评论等
  - **音频**：语音合成（如 Minimax）
  - **视频**：视频生成与编排
- **知识库**：向量检索、嵌入、文档解析与知识增强
- **角色与 Prompt**：角色（Character）管理、Prompt 工程配置
- **任务系统**：异步生成任务、恢复、结果存储（MinIO）、事件推送
- **通知**：SSE、WebSocket、站内信、任务事件推送
- **Agent / Smartflow**：工作流与智能体（mxmcgi 内模块，无独立服务）

---

## 技术架构

| 层级       | 技术选型 |
|------------|----------|
|  monorepo  | pnpm workspace，TypeScript，ESM |
| 网关       | Gateway (Express)，端口 3000，统一入口 + JWT 鉴权 |
| 微服务     | mxmauth / mxmpay / mxmcgi（api+worker）/ mxmnotify |
| 数据层     | **mxmdata**（非 HTTP，被各包 workspace 引用）：Repository 模式，Supabase (PostgreSQL)、MinIO (S3)、Redis |
| 运行环境   | Node ≥22，pnpm ≥8 |

### 服务与端口

| 服务     | 端口 | 说明 |
|----------|------|------|
| gateway  | 3000 | 统一入口，路由转发 + JWT 鉴权 |
| mxmauth  | 4001 | 用户账户、认证、JWT 签发 |
| mxmpay   | 4002 | 支付、钱包 |
| mxmcgi-api   | 4003 | AI 内容生成、Task V2、Smartflow、Agent |
| mxmcgi-worker| 4004 | 异步任务执行（内网） |
| mxmnotify    | 4005 | 通知、SSE、WebSocket |

---

## 核心模块

### 1. Gateway

- 路径前缀 `/api/v1/`，按前缀转发到对应微服务
- 路由：`/account`、`/assets` → mxmauth；`/payment`、`/wallets` → mxmpay；`/generation`、`/cgi/*`、`/system`、`/knowledge`、`/characters`、`/agents`、`/smartflows` → mxmcgi；`/notifications`、`/tasks`、`/sse`、`/task-events` → mxmnotify

### 2. mxmcgi（AI 生成核心）

- **models**：全局模型注册表、`runByModelKey()` 统一调用、多 Provider（DeerAPI、Replicate、PPIO、Minimax、OpenAI、Anthropic、Google、Qwen、Volc 等）
- **core/providers**：ProviderFactory、逻辑模型名 → `{ provider, physicalModel }` 路由（可库表覆盖）
- **core/graph**：图像生成（photograph / design / painting 等场景与配置）
- **core/writing**：写作服务（文章、歌词、脚本、大纲等 wtconfigs + writing-task/service）
- **task**：TaskExecutor → TaskManager → DatabaseTaskStorage，结果存 MinIO，事件经 Outbox 推 mxmnotify
- **knowledge**：知识库、嵌入、检索与增强
- **prompts / characters**：Prompt 工程与角色管理

### 3. mxmdata（数据访问层）

- Repository 模式，`RepositoryFactory` 统一创建实例
- 适配器：Supabase（库表与 REST）、MinIO（对象存储）
- 提供 CGITask、KnowledgeBase、PromptTemplate、Storage 等抽象，各服务依赖 `mxmdata` 且需先 `pnpm build:mxmdata` 再使用

### 4. mxmauth / mxmpay / mxmnotify

- **mxmauth**：账号、登录态、JWT、验证码、资料
- **mxmpay**：支付渠道、订单、钱包与余额
- **mxmnotify**：实时通知、任务状态推送

---

## 快速上手

```bash
# 安装依赖
pnpm install

# 构建数据层（其他包依赖）
pnpm build:mxmdata

# 启动所有服务
pnpm dev:all

# 仅启动 mxmcgi
pnpm dev:mxmcgi
```

主配置集中在 `mxmdata/.env`（如 `SUPABASE_*`、`JWT_SECRET`、MinIO）。各服务可自建 `.env` 覆盖，但不建议改动核心配置。

---

*更多细节见仓库内 `CLAUDE.md`、各服务目录下的 README 及 `mxmdata/README.md`。*
