# 04 · Action Manifest

> Action Manifest 是 Agentic UI 的"心脏"——它把应用能力声明为机器可读的契约。本篇讲清楚字段设计、模式、坑。

## 最小可工作 Action

```ts
import { z } from 'zod'

export const ActionHello = {
  id: 'hello.greet',
  version: '1.0.0',
  name: '打个招呼',
  description: '向指定用户发送问候消息。',
  input: z.object({
    userId: z.string(),
    message: z.string().min(1).max(200),
  }),
  output: z.object({
    sent: z.literal(true),
    sentAt: z.string().datetime(),
  }),
  execute: async (args, ctx) => {
    return { sent: true, sentAt: new Date().toISOString() }
  },
}
```

这是**最低要求**。生产环境至少还要：风险等级、权限、HITL、幂等、审计。

## 完整字段参考

> 完整 JSON Schema / Zod Schema 见 [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)

### 必填字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `id` | `string` | 稳定 ID，建议 `<domain>.<entity>.<action>` 格式 |
| `version` | `semver` | 契约版本，升级时递增，**LLM 用版本做 capability 缓存** |
| `name` | `string` | 人类可读的名字（用户在 UI 看到） |
| `description` | `string` | LLM 看的"工具描述"——**模型用它判断何时调** |
| `input` | `ZodSchema` | 入参 schema（运行校验 + 给 LLM 当工具签名） |
| `output` | `ZodSchema` | 出参 schema（运行校验 + 文档化） |
| `execute` | `function` | 真实业务实现 |

### 强烈推荐字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `when_to_use` | `string` | **调用时机**——比 description 更具体的"什么时候用我" |
| `risk` | `enum` | `low` / `medium` / `high` / `critical` |
| `requiresApproval` | `boolean` | 是否需要 HITL（高风险必须 true） |
| `requiredPermission` | `string` | 所需权限标识符 |

### 写动作必须字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `idempotencyKey` | `(args) => string` | 幂等键生成器 |
| `sideEffects` | `object` | 声明副作用（写库 / 扣款 / 发消息） |
| `dryRun` | `boolean` | execute 是否支持 dry run（**强烈推荐**） |

### 可选字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `category` | `string` | 分类（用于 LLM 工具分组 / 工具选择提示） |
| `examples` | `array` | LLM 看的 few-shot 示例 |
| `tags` | `string[]` | 标签（用于检索 / 过滤） |
| `deprecated` | `string \| null` | 废弃说明 + 替代 action.id |
| `owner` | `string` | 负责人 / 团队 |
| `documentation` | `string` | 详细文档（LLM 选工具前可查） |
| `preview` | `object` | 预览配置（哪些字段要展示给用户确认） |

## 字段详解

### `id` - 稳定 ID

```ts
// ✅ 命名空间 + 实体 + 动作
'kb.node.create'
'kb.node.archive'
'feedback.export'
'runs.delete'

// ❌ 临时命名
'createNode'      // 太短，会撞
'do_the_thing'    // 没意义
'action_001'      // 数字 ID 不可读
```

**为什么这么命名**：
- 命名空间防冲突（多个产品共用）
- 实体名 + 动作名清晰
- LLM 在 system prompt 里能"按前缀分组"

### `description` vs `when_to_use`

这是**最容易写错**的一对字段。

```ts
{
  description: '删除一条 run 记录',                    // ← "工具是什么"
  when_to_use: '用户明确说"删除这条 run"时调用。'   // ← "什么时候用我"
}
```

**description 原则**：
- 1 句话讲清"它做什么"
- 用动词开头
- **不写触发条件**

**when_to_use 原则**：
- 写**用户的语言**（用户会怎么表达）
- 列**正例**和**反例**（可选）
- 写**与其他 action 的边界**（"和 X 不同的是..."）

#### 反例

```ts
{
  description: '当用户想要删除东西时调用',     // ❌ 太泛
  when_to_use: '删除 run 记录',                  // ❌ 和 description 重复
}
```

#### 正例

```ts
{
  description: '从监控台删除一条交互链路记录。',
  when_to_use: `
    调用的场景：
    - 用户说"删除这条 run"、"删掉刚才那次"
    - 用户说"清掉错误日志"
    - 不调用的场景：
    - 用户只说"看看这条 run" → 调 runs.view
    - 用户说"修改状态" → 调 runs.update
  `,
}
```

### `risk` 等级

```ts
type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

// low：只读、查、导出（无副作用）
// medium：本地写（更新个人偏好、收藏）
// high：写共享资源（删 run、改 KB 节点）
// critical：不可逆 / 影响他人 / 涉及钱
```

| 等级 | 典型 action | 是否 HITL | 是否 dryRun |
|------|-------------|-----------|-------------|
| `low` | `runs.list`, `kb.view` | 否 | 否 |
| `medium` | `kb.node.create`, `feedback.update` | 可选 | 推荐 |
| `high` | `runs.delete`, `kb.node.archive` | **必须** | **必须** |
| `critical` | `user.delete`, `billing.refund` | **必须 + 二次确认** | **必须** |

### `idempotencyKey`

让同一个 action + 同样的 args 多次调用，**只生效一次**。

```ts
{
  idempotencyKey: (args) => `runs.delete:${args.runId}`
}
```

**为什么重要**：
- LLM 可能在 plan 中**重复调同一个 action**（replan / 重试）
- 网络重试 / 客户端刷新可能**导致重复请求**
- 业务层**写动作必须可重入**

**实现参考**：
```ts
// runtime 内
if (def.idempotencyKey) {
  const key = def.idempotencyKey(args)
  const existing = await redis.get(`idem:${key}`)
  if (existing) return JSON.parse(existing)
  await redis.setex(`idem:${key}:inprogress`, 60, '1')  // 防并发
}

const result = await def.execute(args, ctx)

if (def.idempotencyKey) {
  await redis.setex(`idem:${def.idempotencyKey(args)}`, 3600, JSON.stringify(result))
}
```

### `sideEffects`

**显式声明副作用**，让 LLM / 审计 / 监控知道会发生什么。

```ts
sideEffects: {
  dataWrites: true,         // 写数据库
  externalMessages: false,  // 不发外部消息
  moneyMovement: false,     // 不涉及钱
  permissionChanges: false, // 不改权限
  irreversible: true,       // 不可逆
}
```

**为什么单独字段**：
- 审计系统用这个**自动标记高风险 action**
- LLM 可以**主动告知用户**："这次操作会改你的数据"
- 监控系统可以**单独告警**高副作用 action

### `dryRun` 模式

写动作的 execute 必须支持 dry run。

```ts
execute: async (args, ctx) => {
  if (ctx.dryRun) {
    // 只查，不改
    const run = await db.findUnique({ where: { id: args.runId } })
    if (!run) throw new ActionError('NOT_FOUND')
    return {
      preview: `将删除 run "${run.title}"（共 ${run.actions.length} 步）`,
      affectedRows: 1,
    }
  }
  // 真正删除
  await db.delete({ where: { id: args.runId } })
  return { deleted: true, archivedAt: new Date().toISOString() }
}
```

**关键**：dry run 模式下**禁止写任何东西**（包括日志、缓存、消息队列）。

### `examples`

LLM 看的 few-shot，能显著提高工具调用准确率。

```ts
examples: [
  {
    user: "把刚才那条错误 run 删掉",
    call: { runId: "abc-123" }
  },
  {
    user: "删除所有 7 月的错误记录",
    call: { dateRange: { from: "2026-07-01", to: "2026-07-31" }, status: "error" }
  }
]
```

**注意**：
- examples 是**给 LLM 看的**，不是给用户看的
- 用**真实业务场景**而不是 toy 数据
- 覆盖**正例 + 边界**（空参 / 多参 / 边界值）

## 模式：Action Manifest 写法

### 模式 A：Zod 优先（推荐）

```ts
import { z } from 'zod'

const InputSchema = z.object({
  host: z.string().min(1).max(253),
  path: z.string().startsWith('/').default('/'),
})

export const ActionCreateNode = {
  id: 'kb.node.create',
  version: '1.0.0',
  name: '创建 KB 节点',
  description: '在当前用户 KB 下创建一个新节点。',
  input: InputSchema,
  output: z.object({ nodeId: z.string().uuid() }),
  risk: 'medium',
  requiresApproval: true,
  execute: async (args, ctx) => {
    const validated = InputSchema.parse(args)  // 二次校验
    // ...
  },
}
```

**好处**：
- 单一来源（schema 同时用于校验 + 文档 + LLM 工具签名）
- 自动得到 JSON Schema（`zod-to-json-schema`）
- TypeScript 类型自动推导

### 模式 B：手写 schema（不推荐）

```ts
// ❌ 三处维护：Zod + JSON Schema + TypeScript
// 任何一处改了忘了其他两处，就出 bug
export const ActionFoo = {
  input: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name']
  } as const
}
```

### 模式 C：TypeBox 替代

```ts
import { Type, Static } from '@sinclair/typebox'
// 和 Zod 类似但性能更好，类型推导更准
// 适合超大型项目
```

## 模式：组织 Action

### 按域分文件
```
src/manifest/actions/
├── index.ts            # 聚合
├── kb.ts               # kb.* 域
├── runs.ts             # runs.* 域
├── feedback.ts         # feedback.* 域
└── _shared.ts          # 跨域的 schema
```

### 注册表
```ts
// src/manifest/actions/index.ts
import { kbActions } from './kb'
import { runsActions } from './runs'
import { feedbackActions } from './feedback'

export const ActionRegistry = {
  ...kbActions,
  ...runsActions,
  ...feedbackActions,
} as const

export type ActionId = keyof typeof ActionRegistry
```

### 自动生成 OpenAI / Anthropic tools
```ts
import { zodToJsonSchema } from 'zod-to-json-schema'

export function toOpenAITools() {
  return Object.values(ActionRegistry).map((action) => ({
    type: 'function' as const,
    function: {
      name: action.id,
      description: action.description,
      parameters: zodToJsonSchema(action.input),
    },
  }))
}

export function toAnthropicTools() {
  return Object.values(ActionRegistry).map((action) => ({
    name: action.id,
    description: `${action.description}\n\n调用时机: ${action.when_to_use || '无特殊条件'}`,
    input_schema: zodToJsonSchema(action.input),
  }))
}
```

## 反模式

### ❌ 反模式 1：description 写得像用户文档
```ts
// ❌ LLM 看不懂"步骤"
description: '该操作分三步：第一步...'
```

### ❌ 反模式 2：input 用 z.any()
```ts
input: z.any()  // ❌ LLM 没有任何约束，会瞎传
```

### ❌ 反模式 3：execute 里直接 fetch 外部 API
```ts
execute: async (args, ctx) => {
  const r = await fetch('https://api.example.com/...')  // ❌ 不可重试
  return r.json()
}
```

### ❌ 反模式 4：忘记 version 字段
```ts
// ❌ schema 改了但 version 没变，LLM 缓存的是旧契约
{ id: 'foo', input: z.object({ newField: z.string() }) }
```

### ❌ 反模式 5：id 包含版本号
```ts
// ❌ 改 schema 要改 id，违反稳定 ID 原则
{ id: 'foo.v2' }
```

## 升级与废弃

```ts
// 旧版标 deprecated
{
  id: 'kb.node.create',
  version: '1.0.0',
  deprecated: '1.1.0',  // 用 kb.node.create v1.1.0 替代
}

// 新版开新 id（同 id 也行，但要 bump version）
{
  id: 'kb.node.create',
  version: '1.1.0',
  input: z.object({
    host: z.string(),
    path: z.string().default('/'),
    tags: z.array(z.string()).default([]),  // 新字段有 default，向后兼容
  }),
}
```

**规则**：
- 增字段 + 给 default → 同 id + bump version（向后兼容）
- 改字段类型 / 删字段 → 新 id + 旧标 deprecated
- 重大重构 → 新 id + 旧 deprecated + 写迁移期

## LLM 工具描述的优化技巧

### 1. 起手明确动作动词
```ts
description: '从监控台删除一条交互链路记录。'   // ✅ 明确动作
description: '处理 run 数据'                    // ❌ "处理"太泛
```

### 2. 显式声明 NOT
```ts
when_to_use: `
  调用的场景：
  - 用户说"删除这条 run"
  
  不调用：
  - 用户说"修改 run 状态" → 用 runs.update
  - 用户说"查看 run 详情" → 用 runs.view
`
```

### 3. 描述依赖关系
```ts
description: '删除一条 run 记录。前提：run.status = "error" 且当前用户是 owner。'
```

### 4. 给定范围提示
```ts
when_to_use: '用户说"今天"/"昨天"/"上周"等明确时间时。模糊时间用 runs.list + 二次筛选。'
```

## 测试

Action Manifest 必须有**单元测试**：

```ts
import { describe, it, expect } from 'vitest'
import { ActionCreateNode } from './kb'

describe('ActionCreateNode', () => {
  it('validates input schema', () => {
    expect(() => ActionCreateNode.input.parse({ host: '' })).toThrow()
    expect(() => ActionCreateNode.input.parse({ host: 'example.com' })).not.toThrow()
  })

  it('refuses high-risk action without approval', async () => {
    await expect(
      runtime.execute('kb.node.create', { host: 'evil.com' }, { user: { permissions: [] } })
    ).rejects.toThrow(/FORBIDDEN|FORBIDDEN|VALIDATION/i)
  })

  it('dryRun does not write', async () => {
    const before = await db.countNodes()
    await ActionCreateNode.execute({ host: 'test.com' }, { dryRun: true })
    const after = await db.countNodes()
    expect(after).toBe(before)
  })
})
```

## 下一步

- 想直接看代码实现 → [05-react-vue-impl.md](./05-react-vue-impl.md)
- 想了解风险 / 权限 / HITL 怎么实现 → [06-security-policy.md](./06-security-policy.md)
- 想看完整 JSON Schema / Zod 规范 → [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)

---

### 参考

- Mozilla AAF Capability Manifest (2026)
- Microsoft Declarative Agent Manifest 1.8
- AICF (AI Capability Framework) Specification
- LangGraph Tool Node Schema
