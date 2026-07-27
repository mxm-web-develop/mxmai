# SuperMXMai Claude Code 记忆

## 项目概述
- **名称**: SuperMXMai (MXM AI Collection)
- **类型**: 多模态 AI 内容生成与业务中台（pnpm monorepo）
- **技术栈**: TypeScript, Node ≥22, pnpm, Supabase (PostgreSQL), MinIO (S3), Redis
- **定位**: AI 内容生成 SaaS 平台，支持图文音视频创作、Smartflow 工作流、支付订阅

## 服务架构（5 个 HTTP 微服务 + mxmcgi worker）

| 服务 | 端口 | 说明 |
|------|------|------|
| gateway | 3000 | 统一入口，路由转发 + JWT 鉴权 |
| mxmauth | 4001 | 用户账户、认证、JWT 签发 |
| mxmpay | 4002 | 支付、钱包 |
| mxmcgi-api | 4003 | AI 生成、Task V2、Smartflow、Agent Chat |
| mxmcgi-worker | 4004 | 异步任务执行（`MXMCGI_ROLE=worker`，内网） |
| mxmnotify | 4005 | 通知、SSE、WebSocket |

**已无独立 `mxmagent` 包**（Agent/Smartflow 在 mxmcgi 内）。见 `docs/adr/mxmagent-merged-into-mxmcgi.md`。

**重要**: mxmdata 不是 HTTP 服务，是被其他包作为 `workspace:*` 依赖引用的数据访问层库。修改 mxmdata 后必须 `pnpm build:mxmdata` 再构建其他包。

## 常用命令

```bash
pnpm dev:all              # 启动所有后端（mxmcgi api+worker 拆分）
pnpm dev:all-with-web     # 完整后端（含 mxmcgi 拆分）+ 前端
pnpm dev:mxmcgi           # 单进程 all 模式（快速调试）
pnpm dev:mxmcgi:split     # 仅 mxmcgi api + worker
pnpm build:mxmdata        # 必须先构建数据层
pnpm init:project         # 初始化项目配置
```

## mxmcgi 核心结构

```
mxmcgi/src/
├── models/             # 模型注册与 Provider 实现（DeerAPI/Replicate/Minimax/OpenAI等）
├── core/
│   ├── providers/      # ProviderFactory、模型路由、类型定义
│   ├── graph/          # 图像生成（photograph/design/painting）
│   ├── writing/        # 文本写作（articles/lyrics/scripts等）
│   ├── usage/          # 用量统计
│   ├── billing/        # 计费服务
│   └── utils/          # data-store（MinIO）、deerapi-client
├── task/               # 异步任务（TaskExecutor → TaskManager → DatabaseTaskStorage）
├── knowledge/          # 知识库（向量检索）
├── characters/         # 角色管理
└── routes/             # Express 路由
```

**Graph 提示词（V2）**：`generateGraphPrompt` 仅支持（1）Admin 配置 `promptTextTaskKey` 走 text/format，或（2）Task V2 传入 `useConfiguredPrompt` 且使用模板已渲染的 `prompt`。不再存在 v1 硬编码拼装路径。

**Task V2 多份生成**：异步 scope 表单自动含 `parallel_count`（1～99）；`>1` 时父任务 `task-v2-batch-parent` + 子任务，计费按子任务次数。`text` scope 不支持。

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

**待解决**: video/sound 模型节点、Python 执行器、爬虫节点、test/run 模式区分

## 最新进展（2026-04-21 by Hermes）

- 建立了 Hermes Agent 双记忆系统（CLAUDE.md + WORKFLOW.md）
- 项目完整扫描完成，建立了项目知识文档
- 所有角色（Developer/Expert/Designer/PM）均可参与

## 代码规范
- TypeScript strict 模式
- ESLint + Prettier
- 分支命名: `feature/` `fix/` `refactor/`
- Commit: `type: description`
- **用户 UI**：禁止暴露 schema/管道内部设计（`style=其他`、`writing_folder_id` 等）；知识卡引用必须用推荐 + `@` 联想，见 `.cursor/rules/ui-no-internal-leak.mdc`
- **管线节点可复用**：平台 step 禁止按业务写死；差异落在 params / queryBuilder / nestedText。见 `docs/adr/pipeline-reusable-steps.md` 与 `.cursor/skills/mxmai_business_pipeline/SKILL.md` §0

## 已知约束
- 修改 mxmdata 后必须 rebuild
- Agent / Smartflow / Agent Chat 均在 mxmcgi（4003），无独立 mxmagent 服务
- Agent Chat 502：检查 gateway（3000）与 mxmcgi-api（4003）；任务不执行则检查 mxmcgi-worker（4004）
- 环境变量统一在项目根 `.env`（见 `docs/ENV.md`，`loadMonorepoEnv()` 加载）
- **mxmcgi api+worker 拆分**：建议在 `mxmcgi/.env` 配置 `REDIS_ENABLED=true` + `REDIS_HOST`/`REDIS_PORT`（见 `mxmcgi/.env.example`），供 Agent 订阅任务完成事件；未配置则 Agent 回退 DB 轮询

## 长任务运行规范（Harness Engineering）

当执行跨越多个会话的长时间任务时，遵循以下模式避免"一次性做太多"或"过早宣布胜利"：

### 结构化任务文件

对于大型功能，使用 `task.json` 结构化任务清单：

```json
{
  "tasks": [
    {
      "id": "feature-login",
      "description": "用户登录功能",
      "steps": ["实现 API 路由", "实现前端表单", "集成测试"],
      "passes": false,
      "priority": 1
    }
  ]
}
```

### 进度跟踪文件

使用 `progress.txt` 记录每次会话的增量：

```
=== 2026-04-27 ===
[feature-login] 完成 API 路由实现
[feature-login] 开始前端表单
```

### 双 Agent 模式

对于超大任务（>2小时），考虑_initializer + _coder 双 Agent 模式：
- **Initializer**: 首次会话，建立项目基础、feature list、init.sh
- **Coder**: 后续会话，每次只实现一个功能，提交 git，更新进度

### 关键原则

1. **一次只做一个功能** - 避免 one-shotting
2. **每个功能必须有验收步骤** - 不能只写代码不测试
3. **Git 提交在功能测试通过后** - 保持代码可回滚
4. **进度文件更新** - 让下一个会话快速同步状态
5. **端到端测试** - 对于 Web 功能使用 Playwright 验证
