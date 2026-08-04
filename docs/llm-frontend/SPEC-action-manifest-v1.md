# SPEC · Action Manifest v1 完整规范

> 这是 Action Manifest v1 的**机器可读规范**。所有实现必须遵守。本规范是 `llm-frontend` 文档集的事实标准。

## 版本

```
spec_version: "1.0.0"
status: "stable"
last_updated: "2026-07-28"
```

## 概述

Action Manifest 是应用对外暴露的能力契约。它有两个消费者：

1. **LLM** —— 通过 `description` / `when_to_use` / `input_schema` 决定何时调用
2. **Runtime** —— 通过 `risk` / `requires_approval` / `execute` 执行 + 拦截

规范定义**字段、类型、约束、互操作性要求**。

## 顶层结构

```typescript
type ActionManifest = {
  // 必填：身份
  id: string                      // 反向 DNS 风格，<domain>.<entity>.<action>
  version: SemVer                 // semver 字符串
  name: string                    // 人类可读
  description: string             // 工具描述（给 LLM）
  when_to_use?: string            // 调用时机（推荐）
  category?: string               // 分类
  tags?: string[]                 // 标签

  // 必填：契约
  input: JSONSchema               // 入参 JSON Schema
  output: JSONSchema              // 出参 JSON Schema

  // 必填：策略
  risk: 'low' | 'medium' | 'high' | 'critical'
  requiresApproval: boolean
  requiredPermission?: string     // RBAC 权限标识

  // 写动作必须
  sideEffects?: SideEffects
  idempotencyKey?: string | ((args: any) => string)
  supportsDryRun: boolean         // 是否支持 dryRun（high/critical 必须 true）

  // 实现（**不能**对外暴露，只在内部 runtime 用）
  execute: (args: any, ctx: ActionContext) => Promise<any>

  // 生命周期
  deprecated?: {
    since: SemVer
    replacedBy?: string           // 替代 action.id
    reason?: string
  }

  // 元数据
  owner?: string                  // 负责团队/人
  documentation?: string          // 详细文档 URL
  examples?: Example[]            // few-shot 示例
}
```

## 字段定义

### `id` (string, required)

格式：`<domain>.<entity>.<action>`，全部小写，点号分隔。

**正则**：`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,5}$`

**示例**：
```
✅ 合法：
kb.node.create
runs.list
feedback.export
page.observe
page.execute
billing.refund.create

❌ 不合法：
createNode              // 没有命名空间
foo.bar.baz.qux.x.y.z   // 太深（>5 段）
Foo.Bar.Baz             // 大写
kb-node-create          // 用 - 不用 .
```

**互操作性要求**：
- 同一应用内**必须唯一**
- 跨应用时建议加前缀（如 `wa.kb.node.create`）避免冲突

### `version` (semver string, required)

格式：`MAJOR.MINOR.PATCH`

**升级规则**：
- **PATCH**：bug 修复，不改 schema（如修复 default 值）
- **MINOR**：增字段 + default（向后兼容）
- **MAJOR**：删字段 / 改字段类型 / 改必填

**LLM 缓存语义**：
- LLM 可以缓存 `id + version` 关联的 manifest
- MINOR 升级后建议在 LLM 上下文里**强制刷新**
- MAJOR 升级后必须**新 id** + 旧标 deprecated

### `name` (string, required)

人类可读的名字。**用户**（不是 LLM）会看到。

**约束**：
- 1-50 字符
- 中文 / 英文均可，建议主要语言

**示例**：
```
✅ "创建 KB 节点"
✅ "List run records"
❌ "kb_node_create_v2_alpha"  // 看起来像 id
❌ "📁 创建"                   // emoji 不必要
```

### `description` (string, required)

**给 LLM 看的工具描述**。1-2 句话讲清"它做什么"。

**原则**：
- 动词开头
- 不写触发条件（那在 `when_to_use`）
- 不写示例（那在 `examples`）

**示例**：
```
✅ "从监控台删除一条交互链路记录。"
✅ "按条件查询 run 列表。"
❌ "该操作分三步..."  // 不要写步骤
❌ "用于处理 run 数据"  // "处理"太泛
```

### `when_to_use` (string, optional but recommended)

**调用时机**。比 description 更具体的"什么时候用我"。

**推荐结构**：
```
调用的场景：
- 触发短语1
- 触发短语2

不调用：
- 应该用 X action 的场景
- 应该用 Y action 的场景
```

**示例**：
```
"调用的场景：
- 用户说'删除这条 run'、'删掉刚才那次'
- 用户说'清掉错误日志'

不调用：
- 用户只说'看看这条 run' → 调 runs.view
- 用户说'修改状态' → 调 runs.update"
```

### `category` (string, optional)

分类，用于工具分组 / 检索。建议用动词或名词短语。

**示例**：
```
"kb", "monitoring", "user-management", "billing", "page-control"
```

### `tags` (string[], optional)

标签数组，用于细粒度过滤 / 检索。

**示例**：
```
["read", "list", "paginated"]
["write", "destructive", "irreversible"]
["read", "export", "large-data"]
```

### `input` (JSONSchema, required)

入参 JSON Schema（[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core)）。

**约束**：
- 顶层必须是 `type: "object"`
- 每个字段必须有 `description`
- 字符串字段必须有 `maxLength`
- 数字字段必须有 `minimum` / `maximum`
- 数组字段必须有 `maxItems`
- 必填字段在 `required` 数组

**额外约束（Action Manifest 扩展）**：
- 字段不支持 `additionalProperties: true`（默认 false / 显式 false）
- 字符串不允许 `format: "regex"`（LLM 不可传正则）
- URL 字段必须 `format: "uri"` + pattern 限制 https

**示例**：
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "runId": {
      "type": "string",
      "format": "uuid",
      "description": "目标 run 的 UUID"
    },
    "reason": {
      "type": "string",
      "maxLength": 200,
      "description": "删除原因（可选，会进入审计日志）"
    }
  },
  "required": ["runId"]
}
```

### `output` (JSONSchema, required)

出参 JSON Schema。

**约束**：同 input，但**通常不需要 maxLength**（业务结果可能大）。

**示例**：
```json
{
  "type": "object",
  "properties": {
    "deleted": { "type": "boolean", "const": true },
    "archivedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["deleted", "archivedAt"]
}
```

### `risk` (enum, required)

四个等级之一。

| 值 | 含义 | HITL | dryRun |
|----|------|------|--------|
| `low` | 只读 / 无副作用 | 否 | 否 |
| `medium` | 写私人数据 | 软 | 推荐 |
| `high` | 写共享资源 / 删数据 | **是** | **是** |
| `critical` | 不可逆 / 影响他人 / 涉及钱 | **是 + 二次确认** | **是** |

**判定规则**：
- 任何 `delete` 类操作：**至少 `high`**
- 发外部消息：`high`
- 改权限 / 角色：`critical`
- 涉及钱：`critical`

### `requiresApproval` (boolean, required)

是否需要 HITL。

- `risk = high` 或 `critical` 时**必须为 true**
- 其他等级可自由选择

### `requiredPermission` (string, optional)

所需权限标识符，格式：`<resource>.<action>`。

**示例**：
```
"runs.read", "runs.delete", "kb.write", "user.manage"
```

**如果设置**：
- runtime 会在 `ctx.user.permissions` 里检查
- 不在则抛 `ActionError('FORBIDDEN')`

### `sideEffects` (object, optional)

显式声明副作用。**所有 high/critical action 必须声明**。

```typescript
type SideEffects = {
  dataWrites?: boolean            // 写数据库
  externalMessages?: boolean      // 发外部消息（邮件、IM）
  moneyMovement?: boolean         // 涉及钱
  permissionChanges?: boolean     // 改权限
  irreversible?: boolean          // 不可逆
}
```

**默认值**：`{}`（无副作用）。**强烈建议显式声明**。

### `idempotencyKey` (string | function, optional for write actions)

幂等键。**所有写动作强烈建议提供**。

可以是：
- 字符串：固定前缀 + args 字段插值
- 函数：根据 args 计算

**示例**：
```typescript
// 函数形式
idempotencyKey: (args) => `runs.delete:${args.runId}`

// 字符串形式（仅当 key 完全由 args 决定时）
idempotencyKey: "runs.delete:{args.runId}"
```

**Runtime 行为**：
- 同一 key 重复调用 → 返回缓存结果
- key 应**包含所有影响结果的字段**

### `supportsDryRun` (boolean, required)

是否支持 dry run。

- `risk = high` 或 `critical` 时**必须为 true**
- 业务 execute 函数必须检查 `ctx.dryRun` 并在 dryRun 模式下**不写任何东西**

**Runtime 行为**：
- high/critical action 执行前，runtime 会先调 `execute(args, { ...ctx, dryRun: true })`
- 用返回的预览让用户确认
- 用户确认后再真做

### `execute` (function, required)

业务实现。**不在 manifest 公开**（只用于 runtime）。

**签名**：
```typescript
type Execute = (
  args: ValidatedInput,
  ctx: ActionContext
) => Promise<ValidatedOutput>
```

**约束**：
- args 已经是 schema 校验过的
- ctx 包含 user / token / dryRun / traceId
- 必须**不抛非预期异常**——业务异常用 `ActionError` 包
- dryRun 模式下**禁止**任何写操作

### `deprecated` (object, optional)

废弃声明。

```typescript
type Deprecated = {
  since: SemVer                  // 何时废弃
  replacedBy?: string            // 替代 action.id
  reason?: string                // 废弃原因
}
```

**LLM 行为**：
- LLM 看到 deprecated action 应**改用 replacedBy**
- runtime 可以选择**禁用**或**警告** deprecated action

### `owner` (string, optional)

负责团队 / 联系人。用于工单路由。

**示例**：`"team:monitoring"`, `"user:alice"`

### `documentation` (string, optional)

详细文档 URL。

**示例**：`"https://wiki.company.com/webassist/runs-delete"`

### `examples` (array, optional)

LLM 看的 few-shot 示例。

```typescript
type Example = {
  user: string                    // 用户输入
  call: Record<string, unknown>   // 应该调什么参数
  result?: any                    // 可选：预期结果
}
```

**原则**：
- 真实业务场景，不用 toy 数据
- 覆盖**正例 + 边界**
- 3-5 个为宜，不要太多

**示例**：
```json
[
  {
    "user": "把刚才那条错误 run 删掉",
    "call": { "runId": "abc-123" }
  },
  {
    "user": "删除所有 7 月的错误记录",
    "call": {
      "dateRange": { "from": "2026-07-01", "to": "2026-07-31" },
      "status": "error"
    }
  },
  {
    "user": "为什么我删不掉？",
    "call": null  // null 表示：不要调本 action，去调 runs.view
  }
]
```

## ActionContext（runtime 传给 execute 的上下文）

```typescript
type ActionContext = {
  user: {
    id: string
    permissions: string[]
  }
  token: string
  dryRun: boolean
  traceId: string                // 单次 LLM 会话唯一 ID

  // 可选：用于高级场景
  idempotency?: {
    get: (key: string) => Promise<unknown | null>
    set: (key: string, value: unknown) => Promise<void>
    setInProgress: (key: string) => Promise<void>
  }
  audit?: {
    log: (entry: AuditEntry) => Promise<void>
    logError: (entry: AuditErrorEntry) => Promise<void>
  }
  requestApproval?: (req: ApprovalRequest) => Promise<boolean>
}
```

## 错误类型

```typescript
class ActionError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' | 'RATE_LIMIT' | 'INTERNAL',
    message: string,
    public details?: Record<string, unknown>,
  )
}
```

| code | 含义 | HTTP 类比 |
|------|------|----------|
| `NOT_FOUND` | action 不存在 / 资源不存在 | 404 |
| `VALIDATION` | input 校验失败 | 400 |
| `FORBIDDEN` | 权限不足 / HITL 拒绝 | 403 |
| `CONFLICT` | 业务冲突（如已存在） | 409 |
| `RATE_LIMIT` | 超过速率限制 | 429 |
| `INTERNAL` | 服务器内部错误 | 500 |

## 完整 JSON Schema（meta-validation）

下面是用 JSON Schema 描述 Action Manifest 本身的元规范——**可以用它来校验 manifest 文件**：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://llm-frontend.dev/specs/action-manifest-v1.json",
  "title": "ActionManifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "version", "name", "description", "input", "output", "risk", "requiresApproval", "supportsDryRun"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){1,5}$"
    },
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "when_to_use": {
      "type": "string",
      "maxLength": 2000
    },
    "category": {
      "type": "string",
      "maxLength": 50
    },
    "tags": {
      "type": "array",
      "items": { "type": "string", "maxLength": 30 },
      "maxItems": 20,
      "uniqueItems": true
    },
    "input": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "const": "object" }
      }
    },
    "output": {
      "type": "object",
      "required": ["type"]
    },
    "risk": {
      "enum": ["low", "medium", "high", "critical"]
    },
    "requiresApproval": { "type": "boolean" },
    "requiredPermission": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"
    },
    "sideEffects": {
      "type": "object",
      "properties": {
        "dataWrites": { "type": "boolean" },
        "externalMessages": { "type": "boolean" },
        "moneyMovement": { "type": "boolean" },
        "permissionChanges": { "type": "boolean" },
        "irreversible": { "type": "boolean" }
      }
    },
    "idempotencyKey": {
      "oneOf": [
        { "type": "string" },
        { "type": "object" }  // function (不可序列化，但 schema 校验不深入)
      ]
    },
    "supportsDryRun": { "type": "boolean" },
    "deprecated": {
      "type": "object",
      "properties": {
        "since": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
        "replacedBy": { "type": "string" },
        "reason": { "type": "string", "maxLength": 500 }
      }
    },
    "owner": { "type": "string", "maxLength": 100 },
    "documentation": { "type": "string", "format": "uri" },
    "examples": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["user", "call"],
        "properties": {
          "user": { "type": "string" },
          "call": { "type": ["object", "null"] },
          "result": {}
        }
      },
      "maxItems": 10
    }
  }
}
```

## Zod Schema（TypeScript / runtime 校验用）

```typescript
import { z } from 'zod'

// 基础类型
const SemVerSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const ActionIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,5}$/)
const PermissionSchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)

// Side Effects
const SideEffectsSchema = z.object({
  dataWrites: z.boolean().optional(),
  externalMessages: z.boolean().optional(),
  moneyMovement: z.boolean().optional(),
  permissionChanges: z.boolean().optional(),
  irreversible: z.boolean().optional(),
}).strict()

// Deprecated
const DeprecatedSchema = z.object({
  since: SemVerSchema,
  replacedBy: ActionIdSchema.optional(),
  reason: z.string().max(500).optional(),
}).strict()

// Example
const ExampleSchema = z.object({
  user: z.string(),
  call: z.record(z.unknown()).nullable(),
  result: z.unknown().optional(),
}).strict()

// ActionManifest 主体（不含 execute）
export const ActionManifestSchema = z.object({
  id: ActionIdSchema,
  version: SemVerSchema,
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  when_to_use: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),

  input: z.object({ type: z.literal('object') }).passthrough(),
  output: z.object({ type: z.literal('object') }).passthrough(),

  risk: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
  requiredPermission: PermissionSchema.optional(),

  sideEffects: SideEffectsSchema.optional(),
  idempotencyKey: z.union([z.string(), z.function()]).optional(),
  supportsDryRun: z.boolean(),

  deprecated: DeprecatedSchema.optional(),

  owner: z.string().max(100).optional(),
  documentation: z.string().url().optional(),
  examples: z.array(ExampleSchema).max(10).optional(),

  // execute 在 schema 里是 function，TypeScript 特有
  execute: z.function(),
}).strict()

// 强制规则：high/critical 必须 requiresApproval=true + supportsDryRun=true
export function validateActionManifest(m: z.infer<typeof ActionManifestSchema>) {
  ActionManifestSchema.parse(m)

  if (m.risk === 'high' || m.risk === 'critical') {
    if (!m.requiresApproval) {
      throw new Error(`${m.id}: high/critical risk must have requiresApproval=true`)
    }
    if (!m.supportsDryRun) {
      throw new Error(`${m.id}: high/critical risk must have supportsDryRun=true`)
    }
  }
}
```

## 互操作性测试

要声称"实现 v1 规范"，必须通过以下测试：

### 1. 元规范校验
- [ ] 所有 manifest 通过 `ActionManifestSchema.parse`
- [ ] 所有 high/critical manifest 满足强约束

### 2. 行为测试
- [ ] dryRun 调用**不写**任何东西
- [ ] 重复 idempotencyKey 调用返回缓存
- [ ] 权限不足抛 `FORBIDDEN`
- [ ] 校验失败抛 `VALIDATION` 并附 Zod error details

### 3. LLM 工具描述测试
- [ ] 所有 action 的 `input` 能用 `zod-to-json-schema` 转成 LLM 工具签名
- [ ] description 长度 ≤ 500 字符
- [ ] when_to_use 包含**正例和反例**

### 4. 文档测试
- [ ] 暴露 `GET /.well-known/ai-manifest.json` 端点
- [ ] 返回的 manifest **不包含 execute 函数**
- [ ] 包含所有 active actions

## 附录 A：完整示例

```typescript
import { z } from 'zod'

const InputSchema = z.object({
  runId: z.string().uuid().describe('目标 run 的 UUID'),
  reason: z.string().max(200).optional().describe('删除原因（可选）'),
}).strict()

const OutputSchema = z.object({
  deleted: z.literal(true),
  archivedAt: z.string().datetime(),
}).strict()

export const ActionRunsDelete = {
  id: 'runs.delete',
  version: '1.0.0',
  name: '删除一条 run 记录',

  description: '从监控台删除一条交互链路记录。',
  when_to_use: `
    调用的场景：
    - 用户说"删除这条 run"、"删掉刚才那次"
    - 用户说"清掉错误日志"

    不调用：
    - 用户只说"看看这条 run" → 调 runs.view
    - 用户说"修改状态" → 调 runs.update
  `,

  category: 'monitoring',
  tags: ['runs', 'write', 'destructive'],

  input: InputSchema,
  output: OutputSchema,

  risk: 'high',
  requiresApproval: true,
  requiredPermission: 'runs.delete',

  sideEffects: {
    dataWrites: true,
    irreversible: true,
  },
  idempotencyKey: (args) => `runs.delete:${args.runId}`,
  supportsDryRun: true,

  owner: 'team:monitoring',
  documentation: 'https://wiki.company.com/webassist/runs-delete',

  examples: [
    {
      user: '把刚才那条错误 run 删掉',
      call: { runId: 'abc-123-def' },
    },
    {
      user: '删除所有 7 月的错误记录',
      call: { runId: 'batch-error-july' },  // 实际由 plan 拆
    },
  ],

  async execute(args, ctx) {
    if (ctx.dryRun) {
      const run = await fetchRun(args.runId, ctx)
      return {
        preview: `将删除 run "${run.title}"（${run.actions.length} 步）`,
        affectedRunId: args.runId,
      }
    }

    const result = await api.delete(`/runs/${args.runId}`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
      body: { reason: args.reason },
    })

    return {
      deleted: true as const,
      archivedAt: new Date().toISOString(),
    }
  },
}
```

## 附录 B：演进规则

v1 之后的变更：

### v1.0 → v1.1（提案）
- 加 `streaming: boolean` 字段（声明是否支持流式输出）
- 加 `output: z.discriminatedUnion` 支持
- `when_to_use` 改名为 `whenToUse`（兼容期支持两种）

### v2.0（远期）
- 改 `id` 格式（增加版本段）
- 强制所有写 action 必须有 `idempotencyKey`
- 引入 `subscription` 字段（付费功能用）

---

## 规范变更流程

对本规范的修改必须：

1. 在 [README.md](./README.md) 留 issue
2. 维护者达成共识（≥2 个 implementer 同意）
3. 在 CHANGELOG 中记录
4. 新版本号：MINOR 兼容 / MAJOR 破坏

## 许可

本文档以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布。

## 反馈

- GitHub: `webassist/llm-frontend`
- Email: `llm-frontend@webassist.dev`
