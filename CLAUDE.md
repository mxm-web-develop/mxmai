# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (from repo root)
```bash
pnpm dev:all          # 启动所有服务（并发）
pnpm dev:mxmcgi       # 仅启动 mxmcgi
pnpm dev:mxmauth      # 仅启动 mxmauth
pnpm dev:gateway      # 仅启动 gateway
pnpm dev:mxmpay       # 仅启动 mxmpay
pnpm dev:mxmnotify    # 仅启动 mxmnotify
pnpm dev:mxmdata      # 启动 Docker（数据层）
```

### Build
```bash
pnpm build:mxmcgi     # 构建 mxmcgi
pnpm build:mxmdata    # 构建 mxmdata（其他包依赖它，必须先构建）
pnpm --filter @mxmai/mxmdata build  # 直接构建 mxmdata
```

### Tests
```bash
pnpm --filter @mxmai/mxmdata test        # 运行 mxmdata 测试
pnpm --filter @mxmai/mxmauth test        # 运行 mxmauth 测试
pnpm --filter @mxmai/mxmcgi run test:replicate-text  # 测试 replicate 文本
pnpm --filter @mxmai/mxmcgi run test:replicate-img   # 测试 replicate 图片
pnpm --filter @mxmai/mxmcgi run test:kb-recall       # 测试知识库召回
```

### Database / Migrations
```bash
pnpm --filter @mxmai/mxmdata run init:db              # 初始化数据库
pnpm --filter @mxmai/mxmdata run migrate:sensitive-words
pnpm --filter @mxmai/mxmdata run migrate:provider-balances
pnpm --filter @mxmai/mxmdata run reload-schema        # 重载 PostgREST schema
```

### Other
```bash
pnpm init:project              # 初始化项目配置
pnpm seed:prompt-config        # 写入初始 prompt 工程配置
pnpm --filter @mxmai/mxmcgi run init:system-kb  # 初始化系统知识库
```

## Architecture

### Monorepo & Service Ports
pnpm workspace，各服务端口：
| 服务 | 端口 | 说明 |
|------|------|------|
| gateway | 3000 | 统一入口，路由转发 + JWT 鉴权 |
| mxmauth | 4001 | 用户账户、认证、JWT 签发 |
| mxmpay | 4002 | 支付、钱包 |
| mxmcgi | 4003 | AI 内容生成（图/文/音/视频） |
| mxmagent | 4004 | Agent / Smartflow 工作流 |
| mxmnotify | 4005 | 通知、SSE 推送、WebSocket |

**mxmdata** 不是 HTTP 服务，是被其他包作为 `workspace:*` 依赖引用的数据访问层库。**修改 mxmdata 后必须重新构建**（`pnpm build:mxmdata`）才能让其他包读取到最新类型。

### mxmcgi 内部结构（核心服务）
```
mxmcgi/src/
├── models/             # 模型注册与 Provider 实现
│   ├── registry.ts     # 全局模型注册表
│   ├── run.ts          # 统一调用入口 runByModelKey()
│   ├── providers.ts    # 导出 providerFactory 单例
│   ├── deerapi/        # DeerAPI provider（主要 provider）
│   ├── replicate/      # Replicate provider
│   ├── ppio/           # PPIO provider
│   ├── minimax/        # Minimax provider
│   ├── openai/ anthropic/ google/ qwen/ volc/
│   └── {provider}/{modality}/  # 各 provider 按模态注册模型
├── core/
│   ├── providers/      # ProviderFactory、模型路由、类型定义
│   │   ├── types.ts           # ProviderType、GenerateParams、ModelProvider 等核心类型
│   │   ├── model-routing.ts   # 逻辑模型名 -> {provider, physicalModel} 路由表
│   │   └── index.ts           # ProviderFactory（延迟初始化单例）
│   ├── graph/          # 图片生成服务（photograph/design/painting）
│   ├── writing/        # 文本写作服务（articles/lyrics/scripts/outlines 等）
│   ├── usage/          # 用量统计
│   ├── billing/        # 计费服务
│   ├── balance/        # 余额管理
│   └── utils/          # data-store（MinIO 存储）、deerapi-client 等
├── task/               # 任务系统（异步任务管理、恢复、outbox）
├── knowledge/          # 知识库服务
├── characters/         # 角色（Character）管理
├── prompts/            # Prompt 工程配置读取
└── routes/             # Express 路由
```

### 模型路由机制
`mxmcgi/src/core/providers/model-routing.ts` 维护逻辑模型名到 `{provider, physicalModel}` 的映射（如 `writing-articles` -> `{deer, gemini-2-5-flash}`）。Admin 可通过 API 在运行时覆盖路由，覆盖写入数据库的 `model_routing_overrides` 表，服务启动时自动加载。

### 数据层（mxmdata）
采用 Repository 模式，`RepositoryFactory` 统一创建所有 Repository 实例。数据库为 Supabase（PostgreSQL），对象存储为 MinIO。所有服务在启动时必须调用 `RepositoryFactory.init()`。环境变量从 `mxmdata/.env` 集中读取（JWT_SECRET、SUPABASE_URL 等关键配置均在此文件）。

### 任务系统
异步生成任务（图片/视频/音频）由 `mxmcgi/src/task/` 管理：`TaskExecutor` -> `TaskManager` -> `DatabaseTaskStorage`（Supabase）。任务结果媒体文件存储到 MinIO。`TaskEventOutboxProcessor` 负责将任务事件可靠推送给 mxmnotify。服务启动时会自动恢复超时任务（`task-recovery.ts`）。

### 环境变量
- 主配置：`mxmdata/.env`（含 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`JWT_SECRET`、MinIO 配置）
- 各服务可在自己目录下放 `.env` 追加/覆盖，但不应覆盖 mxmdata/.env 中的核心配置
- `DEFAULT_PROVIDER` 控制默认 AI provider（可选值：`deer`/`deerapi`、`replicate`、`ppio`、`openai`、`google`、`anthropic`、`qwen`、`volc`、`minimax`）

### Gateway 路由规则
所有外部请求经 gateway（:3000）转发，路径前缀 `/api/v1/`：
- `/account`, `/assets` -> mxmauth
- `/payment`, `/wallets` -> mxmpay
- `/generation`, `/cgi/*`, `/system`, `/knowledge`, `/characters` -> mxmcgi
- `/agents`, `/smartflows` -> mxmagent
- `/notifications`, `/tasks`, `/sse`, `/task-events` -> mxmnotify
