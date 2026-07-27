# SuperMXMai Claude Code 记忆

## 项目概述
- **名称**: SuperMXMai (MXM AI Collection)
- **类型**: 多模态 AI 内容生成与业务中台（pnpm monorepo）
- **技术栈**: TypeScript, Node ≥22, pnpm, Supabase (PostgreSQL), MinIO/R2 (S3), Redis
- **定位**: AI 内容生成 SaaS 平台，支持图文音视频创作、Smartflow 工作流、支付订阅

## 服务架构（5 个 HTTP 微服务 + mxmcgi worker）

| 服务 | 端口 | 说明 |
|------|------|------|
| gateway | 3000 | 统一入口，路由转发 + JWT 鉴权 |
| mxmauth | 4001 | 用户账户、认证、JWT 签发 |
| mxmpay | 4002 | 支付、钱包 |
| mxmcgi-api | 4003 | AI 生成、Task V2、Smartflow、Agent Chat |
| mxmcgi-worker | 4004 | 异步任务执行（`MXMCGI_ROLE=worker`） |
| mxmnotify | 4005 | 通知、SSE、WebSocket |

**已无独立 `mxmagent` 包**。见 `docs/adr/mxmagent-merged-into-mxmcgi.md`。

**重要**: mxmdata 不是 HTTP 服务，是被其他包作为 `workspace:*` 依赖引用的数据访问层库。修改 mxmdata 后必须 `pnpm build:mxmdata` 再构建其他包。

## 常用命令

```bash
pnpm dev:all              # 启动所有后端（mxmcgi api+worker 拆分）
pnpm dev:all-with-web     # 完整后端 + 前端
pnpm build:mxmdata        # 必须先构建数据层
pnpm init:project         # 初始化项目配置
```

## mxmcgi 核心结构

```
mxmcgi/src/
├── models/             # 模型注册与 Provider 实现
├── agents/             # Agent Chat
├── smartflow/          # Smartflow 工作流引擎
├── tasks/              # Task V2
├── core/
│   ├── providers/      # ProviderFactory、模型路由
│   ├── graph/          # 图像生成
│   └── writing/        # 文本写作
├── task/               # 异步任务执行
├── knowledge/          # 知识库
└── routes/             # Express 路由
```

## Smartflow 节点状态（7/7 已实现）

| 节点 | 状态 | 备注 |
|------|------|------|
| start | ✅ | |
| end | ✅ | |
| model | ✅ | text/image/embedding ✅, video/sound ❌ |
| condition | ✅ | 多 else 端口 |
| variable | ✅ | |
| loop | ✅ | Iteration + Loop |
| tools | ✅ | brave搜索/embedding/http ✅, Python/爬虫 ❌ |

## 代码规范
- TypeScript strict 模式
- ESLint + Prettier
- 分支命名: `feature/` `fix/` `refactor/`
- Commit: `type: description`
- **管线节点可复用**：平台 step 禁止按业务写死；差异落在 params / queryBuilder / nestedText。见 `docs/adr/pipeline-reusable-steps.md` 与 `.cursor/skills/mxmai_business_pipeline/SKILL.md` §0

## 已知约束
- 修改 mxmdata 后必须 rebuild
- Agent / Smartflow 在 mxmcgi（4003），非独立服务
- 环境变量统一在项目根 `.env`（见 `docs/ENV.md`）
