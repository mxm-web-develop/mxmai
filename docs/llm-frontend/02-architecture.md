# 02 · 6 层架构

> 一个面向 LLM 的前端架构应该有 6 层。少任何一层都会出现具体的"闯祸"场景。

## 总览

```
┌─────────────────────────────────────────────────────────────┐
│  6. Renderer         你的设计系统组件（render manifest）        │  ← LLM 不可见
├─────────────────────────────────────────────────────────────┤
│  5. State Sync       共享状态：LLM ↔ UI 双向同步               │  ← 可选
├─────────────────────────────────────────────────────────────┤
│  4. Runtime Guard    校验 / 授权 / 风险 / HITL / 审计          │  ← 安全底线
├─────────────────────────────────────────────────────────────┤
│  3. Data Contract    API 契约 / 类型 / 序列化                  │  ← LLM 看不见
├─────────────────────────────────────────────────────────────┤
│  2. Action Manifest  应用能做什么 + 怎么做                     │  ← LLM 看得到
├─────────────────────────────────────────────────────────────┤
│  1. Route Manifest   应用有哪些页面 / 功能域                   │  ← LLM 看得到
└─────────────────────────────────────────────────────────────┘
```

**LLM 看得到**的层是 1 + 2（用于决策）。**LLM 看不到**的层是 3 + 4 + 5 + 6（执行细节）。**LLM 操控**的层是 4（通过 schema / policy）。

## 6 层详解

### 第 1 层：Route Manifest（路由清单）

**职责**：告诉 LLM "应用由哪些功能域/页面组成，每个页面大概干什么"。

**最小例子**：
```ts
// src/manifest/routes.ts
export const ROUTES = {
  dashboard: {
    path: '/',
    title: '首页',
    summary: '显示关键指标、最近活动',
    actions: ['activity.list', 'metric.view'],
  },
  knowledge: {
    path: '/kb',
    title: '知识库',
    summary: '管理按域名组织的网站知识（节点、OpenAPI、skill）',
    actions: ['kb.node.create', 'kb.node.list', 'kb.node.archive'],
  },
  runs: {
    path: '/runs',
    title: '交互监控',
    summary: '查看插件上的每一次 observe/act 链路',
    actions: ['runs.list', 'runs.view', 'runs.delete'],
  },
} as const
```

**LLM 怎么用**：当用户说"我想看今天的运行记录"——LLM 看到 `/runs` 路由存在 + 摘要匹配 + 有 `runs.list` action，**就能决定跳过去**。

**设计原则**：
- **不暴露真实 URL 参数**（避免 LLM 拼 URL 绕过 guard）
- **summary 写给人看也写给 LLM 看**（双关）
- **加 changelog**：路由下架要带 `deprecated` 字段

### 第 2 层：Action Manifest（操作清单）— 核心

**职责**：告诉 LLM "应用能做什么动作，每个动作的入参、风险、副作用"。

**最小例子**：
```ts
// src/manifest/actions.ts
import { z } from 'zod'

export const ActionRegistry = {
  'runs.delete': {
    id: 'runs.delete',
    version: '1.0.0',
    name: '删除一条 run 记录',
    description: '从监控台删除一条交互链路记录。',
    when_to_use: '用户明确说"删除这条 run"、"删掉刚才那次"时调用。',
    input: z.object({
      runId: z.string().uuid(),
      reason: z.string().max(200).optional(),
    }),
    output: z.object({
      deleted: z.literal(true),
      archivedAt: z.string().datetime(),
    }),
    risk: 'high',
    requiresApproval: true,
    idempotencyKey: (args: any) => `runs.delete:${args.runId}`,
    execute: async (args, ctx) => { /* ... */ },
  },

  'runs.list': {
    id: 'runs.list',
    version: '1.0.0',
    name: '查询 run 记录',
    description: '按条件查询 run 列表。',
    when_to_use: '用户说"看看今天的 run"/"显示错误最多的几次"时调用。',
    input: z.object({
      dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      status: z.enum(['ok', 'error', 'unsure']).optional(),
      limit: z.number().min(1).max(100).default(20),
    }),
    output: z.object({
      items: z.array(z.object({ id: z.string(), status: z.string() })),
      total: z.number(),
    }),
    risk: 'low',
    requiresApproval: false,
    execute: async (args, ctx) => { /* ... */ },
  },
} as const
```

**关键字段**（详见 [04-action-manifest.md](./04-action-manifest.md)）：
- `id` - 稳定 ID（路由 + 动作复合）
- `description` / `when_to_use` - **双 description**（一个给 LLM 看"什么时候用我"，一个给用户看）
- `input` / `output` - Zod schema（运行时校验 + 给 LLM 当工具描述）
- `risk` - `low` / `medium` / `high` / `critical`
- `requiresApproval` - 是否需要 HITL
- `idempotencyKey` - 幂等键生成函数
- `execute` - **真实业务实现**（LLM 永远不直接调这个）

**为什么 `when_to_use` 单独一个字段**：`description` 给模型做"工具选择"，`when_to_use` 给模型做"时机判断"。两者不同 —— 一个按钮的 `description` 是"提交表单"，`when_to_use` 是"用户已经填完必填项且表单校验通过时"。

### 第 3 层：Data Contract（数据契约）

**职责**：定义所有 Action 之间共享的数据结构。前端类型 + 后端 schema + 序列化规则，**三处必须一致**。

**最小例子**：
```ts
// src/manifest/contracts.ts
import { z } from 'zod'

// 1. 业务实体
export const Run = z.object({
  id: z.string().uuid(),
  status: z.enum(['ok', 'error', 'unsure']),
  startedAt: z.string().datetime(),
  duration: z.number().int().min(0),
  actions: z.array(z.string()),  // 引用 Action.id
  ownerId: z.string(),
})

export const KnowledgeNode = z.object({
  id: z.string().uuid(),
  host: z.string(),
  path: z.string(),
  scope: z.enum(['system', 'user']),
  ownerId: z.string().optional(),
  tags: z.array(z.string()),
})

// 2. 分页 / 列表
export const Page = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().min(0),
  cursor: z.string().optional(),
})

// 3. 错误
export const ActionError = z.object({
  code: z.enum([
    'NOT_FOUND', 'VALIDATION', 'FORBIDDEN',
    'CONFLICT', 'RATE_LIMIT', 'INTERNAL'
  ]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
})
```

**为什么单独一层**：
- Action 之间要能**互相引用**（`runs.view` 返回 `Run`，`runs.delete` 用 `Run.id`）
- LLM 输出的"参数"也要经过这层校验（不能直接信任）
- **跨服务**时这层契约就是 API 边界

**反模式**：
```ts
// ❌ 用 any 串全场
const run: any = await api.get('/runs/123')

// ✅ 一处定义，全场复用
const run = Run.parse(await api.get('/runs/123'))
```

### 第 4 层：Runtime Guard（运行时守卫）

**职责**：所有 Action 执行前的拦截层。**这是安全底线**。

**最小例子**：
```ts
// src/manifest/runtime.ts
export async function executeAction(name, args, ctx) {
  const def = ActionRegistry[name]
  if (!def) throw new ActionError('NOT_FOUND', `Unknown action: ${name}`)

  // 1. 校验
  def.input.parse(args)  // Zod 失败 → 抛 VALIDATION

  // 2. 授权
  if (def.requiredPermission) {
    if (!ctx.user.permissions.includes(def.requiredPermission)) {
      throw new ActionError('FORBIDDEN', `Missing permission: ${def.requiredPermission}`)
    }
  }

  // 3. 风险评估 + 准备
  if (def.requiresApproval || def.risk === 'high' || def.risk === 'critical') {
    const proposal = await def.execute(args, { ...ctx, dryRun: true })
    const approved = await ctx.requestApproval({
      action: name,
      args,
      preview: proposal,
      risk: def.risk,
    })
    if (!approved) throw new ActionError('FORBIDDEN', 'User declined')
  }

  // 4. 幂等
  if (def.idempotencyKey) {
    const key = def.idempotencyKey(args)
    const cached = await ctx.idempotency.get(key)
    if (cached) return cached
    // 标记正在执行
    await ctx.idempotency.setInProgress(key)
  }

  // 5. 真实执行
  try {
    const result = await def.execute(args, ctx)

    // 6. 审计
    await ctx.audit.log({
      action: name,
      args,
      result,
      user: ctx.user.id,
      traceId: ctx.traceId,
      timestamp: new Date().toISOString(),
    })

    // 7. 缓存幂等结果
    if (def.idempotencyKey) {
      await ctx.idempotency.set(def.idempotencyKey(args), result)
    }

    return result
  } catch (err) {
    await ctx.audit.logError({ action: name, args, error: err, user: ctx.user.id })
    throw err
  }
}
```

**7 步**是经过实践检验的：
1. **校验**：Zod schema，避免 LLM 幻觉
2. **授权**：RBAC / ABAC
3. **风险评估 + 准备**：高风险先 dry run 出预览
4. **幂等检查**：避免重复执行
5. **真实执行**：业务逻辑
6. **审计日志**：每一步都记
7. **结果缓存**：写入幂等存储

**为什么 `dryRun` 必须在 execute 里实现**：业务执行函数必须知道"我现在是预览还是真做"。比如 `runs.delete` 在 dryRun 时**只查不删**，返回"将要删除什么"，让用户确认。

详见 [06-security-policy.md](./06-security-policy.md)。

### 第 5 层：State Sync（状态同步）

**职责**：LLM 的"思考上下文"和 UI 的"显示状态"双向同步。

**场景**：
- LLM 在多轮 plan 中，**记住上一步选了哪些行**
- UI 的 loading / 选中 / 折叠状态**要能喂回 LLM**
- 实时操作（AI 自动填表）时，**UI 状态 = LLM 状态**

**最小例子**：
```ts
// src/manifest/state.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export const useSharedState = create(
  immer((set) => ({
    selectedRows: new Set<string>(),
    isLoading: false,
    lastAction: null as { name: string; status: string } | null,

    select: (id: string) => set((s) => { s.selectedRows.add(id) }),
    unselect: (id: string) => set((s) => { s.selectedRows.delete(id) }),
    setLoading: (loading: boolean) => set((s) => { s.isLoading = loading }),
    recordAction: (name: string, status: string) => set((s) => {
      s.lastAction = { name, status }
    }),
  }))
)

// LLM 怎么读到状态：
export function stateContext() {
  const { selectedRows, lastAction } = useSharedState.getState()
  return {
    selectedIds: [...selectedRows],
    lastAction,
  }
}
```

**关键约束**：
- **不要把 LLM 不可见的状态塞进去**（如内部 ref、临时 setTimeout 句柄）
- **每次 plan 前 snapshot 一次**作为 LLM 的 system context
- **状态变更触发 UI 重新渲染**（走标准 React/Vue 响应式）

### 第 6 层：Renderer（渲染器）

**职责**：把 Action 的 result manifest 渲染为真实 UI 组件。

**最小例子**：
```ts
// src/manifest/renderer.tsx
import { Card, Text, DataTable, Alert, Button, Stack } from '@/components'
import { z } from 'zod'

const ResultManifest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('card'), title: z.string(), children: z.array(z.lazy(() => ResultManifest)) }),
  z.object({ type: z.literal('table'), columns: z.array(z.string()), rows: z.array(z.record(z.unknown())) }),
  z.object({ type: z.literal('alert'), variant: z.enum(['info','success','warning','error']), message: z.string() }),
  z.object({ type: z.literal('confirm'), title: z.string(), description: z.string(), onConfirm: z.string() }),
])

export function ResultRenderer({ manifest }: { manifest: unknown }) {
  const m = ResultManifest.parse(manifest)  // 校验

  switch (m.type) {
    case 'text':    return <Text>{m.content}</Text>
    case 'card':    return <Card title={m.title}><Stack>{m.children.map((c, i) => <ResultRenderer key={i} manifest={c} />)}</Stack></Card>
    case 'table':   return <DataTable columns={m.columns} rows={m.rows} />
    case 'alert':   return <Alert variant={m.variant}>{m.message}</Alert>
    case 'confirm': return <ConfirmCard title={m.title} description={m.description} actionName={m.onConfirm} />
  }
}
```

**关键约束**：
- **白名单组件**：renderer 只能 render 你注册过的组件
- **递归校验**：children 也是 manifest，递归 parse
- **可访问性兜底**：所有 render 输出必须经过可访问性检测

详见 [07-rendering-system.md](./07-rendering-system.md)。

## 层的依赖关系

```
1 Route ─────────┐
                 ├──→ LLM system prompt（LLM 决策依据）
2 Action ────────┘

3 Data ──────────┐
                 ├──→ 3 引用 + 4 校验
4 Runtime ───────┘
                 │
5 State ←────────┘ 双向同步

6 Renderer ←──── 2 输出的 result manifest
```

- 1 + 2 **只读**（LLM 用，不写）
- 3 + 4 + 5 + 6 **读写**（runtime 用）
- 3 是 2 的"内部依赖"，不直接给 LLM 看
- 6 只用 2 输出的 manifest，**不直接调 2**

## 最小启动清单

如果只能选 3 层，**按 ROI 排序**：

1. **第 2 层（Action Manifest）**——你立刻能"声明能力"和"暴露给 LLM"
2. **第 4 层（Runtime Guard）**——你立刻能"防止 LLM 闯祸"
3. **第 6 层（Renderer）**——你立刻能"用自己组件渲染 LLM 输出"

1 + 3 + 5 是**锦上添花**，等第 2 层用顺了再加。

## 反模式 vs 正模式

### ❌ 反模式 A：LLM 直接拼 SQL/URL
```ts
const userInput = await llm("查 user_123 的订单")
const sql = `SELECT * FROM orders WHERE user_id = '${userInput.userId}'`
db.query(sql)  // 灾难
```

### ✅ 正模式 A：LLM 选 action，runtime 验证
```ts
const decision = await llmWithTools([ActionManifest], userInput)
// LLM 决定调 orders.list，输出 { userId: "user_123", days: 7 }
const result = await runtime.executeAction(decision.name, decision.args, ctx)
```

### ❌ 反模式 B：自由文本回复
```ts
const reply = await llm("用户问订单状态")
return { message: reply }  // 前端要写一堆 if-else 解析
```

### ✅ 正模式 B：manifest 化输出
```ts
const decision = await llmWithStructuredOutput([
  textCardSchema, tableSchema, confirmSchema, alertSchema
], userInput)
// 前端直接 <ResultRenderer manifest={decision} />
```

### ❌ 反模式 C：让 LLM 写 React 组件
让 LLM 直接输出 React JSX / HTML 字符串再注入 DOM —— 警告：这种写法会导致 XSS、破坏设计系统、不可访问性、不可审计。**生产环境绝对禁止**。

### ✅ 正模式 C：LLM 选预制组件
```ts
const decision = await llmWithStructuredOutput(componentManifest, userInput)
return <ResultRenderer manifest={decision} />  // 永远用你的组件
```

## 下一步

- 想深入 Action Manifest 的字段设计 → [04-action-manifest.md](./04-action-manifest.md)
- 想直接上手代码 → [05-react-vue-impl.md](./05-react-vue-impl.md)
- 想了解安全策略细节 → [06-security-policy.md](./06-security-policy.md)
- 想用现成框架 → [08-tooling-ecosystem.md](./08-tooling-ecosystem.md)

---

### 参考

- CopilotKit AG-UI Protocol (2026)
- Mozilla AAF Capability Manifest
- Microsoft Declarative Agent Manifest 1.8
- UIR-X: A Semantic Frontend IR (2026)
- AICF Capability Manifest Specification
