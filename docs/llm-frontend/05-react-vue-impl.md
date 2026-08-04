# 05 · React / Vue 落地实现

> 本篇给出 React 和 Vue 的最小可工作实现，包含：Action Manifest 注册、Runtime 守卫、Renderer、用 LLM 跑通最小回路。

## 项目结构（React 示例）

```
src/
├── manifest/
│   ├── actions/
│   │   ├── index.ts
│   │   ├── kb.ts
│   │   └── runs.ts
│   ├── contracts.ts
│   ├── runtime.ts
│   ├── renderer.tsx
│   ├── llm-adapter.ts
│   └── routes.ts
├── components/                 # 你的设计系统
│   ├── Card.tsx
│   ├── DataTable.tsx
│   ├── Alert.tsx
│   └── ...
├── pages/
└── App.tsx
```

## 第 1 步：定义 Action Manifest

```ts
// src/manifest/actions/runs.ts
import { z } from 'zod'

export const ActionRunsList = {
  id: 'runs.list',
  version: '1.0.0',
  name: '查询 run 记录',
  description: '按条件查询 run 列表，返回按时间倒序的 run 摘要。',
  when_to_use: '用户说"看看今天的 run"、"显示错误最多的几次"、"最近 10 条"时调用。',
  category: 'monitoring',
  tags: ['runs', 'read'],

  input: z.object({
    dateRange: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).optional(),
    status: z.enum(['ok', 'error', 'unsure']).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),

  output: z.object({
    items: z.array(z.object({
      id: z.string().uuid(),
      startedAt: z.string().datetime(),
      status: z.enum(['ok', 'error', 'unsure']),
      actionCount: z.number().int().min(0),
    })),
    total: z.number().int().min(0),
  }),

  risk: 'low' as const,
  requiresApproval: false,
  requiredPermission: 'runs.read',
  sideEffects: { dataWrites: false },

  execute: async (args, ctx) => {
    const params = new URLSearchParams()
    if (args.dateRange) {
      params.set('from', args.dateRange.from)
      params.set('to', args.dateRange.to)
    }
    if (args.status) params.set('status', args.status)
    params.set('limit', String(args.limit))

    const r = await fetch(`/api/runs?${params}`, {
      headers: { 'Authorization': `Bearer ${ctx.token}` }
    })
    if (!r.ok) throw new Error(`runs.list failed: ${r.status}`)
    return await r.json()
  },
}

export const ActionRunsDelete = {
  id: 'runs.delete',
  version: '1.0.0',
  name: '删除一条 run 记录',
  description: '从监控台删除一条交互链路记录。',
  when_to_use: '用户明确说"删除这条 run"、"删掉刚才那次"时调用。',
  category: 'monitoring',
  tags: ['runs', 'write', 'destructive'],

  input: z.object({
    runId: z.string().uuid(),
    reason: z.string().max(200).optional(),
  }),

  output: z.object({
    deleted: z.literal(true),
    archivedAt: z.string().datetime(),
  }),

  risk: 'high' as const,
  requiresApproval: true,
  requiredPermission: 'runs.delete',
  idempotencyKey: (args: any) => `runs.delete:${args.runId}`,
  sideEffects: {
    dataWrites: true,
    irreversible: true,
  },

  execute: async (args, ctx) => {
    // dry run: 只查，不删
    if (ctx.dryRun) {
      const r = await fetch(`/api/runs/${args.runId}`, {
        headers: { 'Authorization': `Bearer ${ctx.token}` }
      })
      const run = await r.json()
      return {
        preview: `将删除 run "${run.title || run.id}"（共 ${run.actions?.length || 0} 步）`,
        affectedRunId: args.runId,
      }
    }

    const r = await fetch(`/api/runs/${args.runId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: args.reason }),
    })
    if (!r.ok) throw new Error(`runs.delete failed: ${r.status}`)
    return { deleted: true, archivedAt: new Date().toISOString() } as const
  },
}
```

## 第 2 步：Runtime 守卫

```ts
// src/manifest/runtime.ts
import { ActionRegistry } from './actions'

export class ActionError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

export type ActionContext = {
  user: { id: string; permissions: string[] }
  token: string
  dryRun?: boolean
  traceId: string
  idempotency: {
    get: (key: string) => Promise<unknown | null>
    set: (key: string, value: unknown) => Promise<void>
    setInProgress: (key: string) => Promise<void>
  }
  audit: {
    log: (entry: AuditEntry) => Promise<void>
    logError: (entry: AuditErrorEntry) => Promise<void>
  }
  requestApproval: (req: ApprovalRequest) => Promise<boolean>
}

export type ApprovalRequest = {
  action: string
  args: Record<string, unknown>
  preview: unknown
  risk: 'low' | 'medium' | 'high' | 'critical'
}

export type AuditEntry = {
  action: string
  args: Record<string, unknown>
  result: unknown
  user: string
  traceId: string
  timestamp: string
}

export type AuditErrorEntry = {
  action: string
  args: Record<string, unknown>
  error: unknown
  user: string
  traceId: string
}

export async function executeAction<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  ctx: ActionContext,
): Promise<T> {
  const def = ActionRegistry[name as keyof typeof ActionRegistry]
  if (!def) throw new ActionError('NOT_FOUND', `Unknown action: ${name}`)

  // 1. 校验
  const validated = def.input.parse(args)  // Zod throws on error

  // 2. 授权
  if (def.requiredPermission && !ctx.user.permissions.includes(def.requiredPermission)) {
    throw new ActionError('FORBIDDEN', `Missing permission: ${def.requiredPermission}`)
  }

  // 3. 风险 + 准备
  if (def.requiresApproval || def.risk === 'high' || def.risk === 'critical') {
    const proposal = await def.execute(validated, { ...ctx, dryRun: true })
    const approved = await ctx.requestApproval({
      action: name,
      args: validated,
      preview: proposal,
      risk: def.risk,
    })
    if (!approved) throw new ActionError('FORBIDDEN', 'User declined')
  }

  // 4. 幂等
  if (def.idempotencyKey) {
    const key = def.idempotencyKey(validated)
    const cached = await ctx.idempotency.get(key)
    if (cached !== null) return cached as T
    await ctx.idempotency.setInProgress(key)
  }

  // 5. 真实执行
  try {
    const result = await def.execute(validated, ctx)

    // 6. 审计
    await ctx.audit.log({
      action: name,
      args: validated,
      result,
      user: ctx.user.id,
      traceId: ctx.traceId,
      timestamp: new Date().toISOString(),
    })

    // 7. 缓存幂等
    if (def.idempotencyKey) {
      await ctx.idempotency.set(def.idempotencyKey(validated), result)
    }

    return result as T
  } catch (err) {
    await ctx.audit.logError({
      action: name,
      args: validated,
      error: err,
      user: ctx.user.id,
      traceId: ctx.traceId,
    })
    throw err
  }
}
```

## 第 3 步：LLM 适配器

```ts
// src/manifest/llm-adapter.ts
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ActionRegistry } from './actions'

export function toOpenAITools() {
  return Object.values(ActionRegistry).map((action) => ({
    type: 'function' as const,
    function: {
      name: action.id,
      description: [
        action.description,
        action.when_to_use ? `\n调用时机: ${action.when_to_use}` : '',
        action.examples ? `\n示例: ${JSON.stringify(action.examples)}` : '',
      ].filter(Boolean).join('\n'),
      parameters: zodToJsonSchema(action.input),
    },
  }))
}

export function toAnthropicTools() {
  return Object.values(ActionRegistry).map((action) => ({
    name: action.id,
    description: [
      action.description,
      action.when_to_use ? `\n调用时机: ${action.when_to_use}` : '',
    ].filter(Boolean).join('\n'),
    input_schema: zodToJsonSchema(action.input),
  }))
}

// LLM 调用辅助
export async function callLLMWithActions(
  userMessage: string,
  conversation: any[],
  options: { provider: 'openai' | 'anthropic'; apiKey: string; model: string },
) {
  const tools = options.provider === 'openai' ? toOpenAITools() : toAnthropicTools()

  if (options.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: conversation.concat([{ role: 'user', content: userMessage }]),
        tools,
        tool_choice: 'auto',
      }),
    })
    return await r.json()
  }
  // ... anthropic 同理
}
```

## 第 4 步：Renderer

```tsx
// src/manifest/renderer.tsx
import { z } from 'zod'
import { Card, Text, Alert, Button, Stack, DataTable } from '@/components'

// 递归 manifest schema
const ResultManifest: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), content: z.string() }),
    z.object({
      type: z.literal('card'),
      title: z.string(),
      children: z.array(ResultManifest),
    }),
    z.object({
      type: z.literal('table'),
      columns: z.array(z.string()),
      rows: z.array(z.record(z.unknown())),
    }),
    z.object({
      type: z.literal('alert'),
      variant: z.enum(['info', 'success', 'warning', 'error']),
      message: z.string(),
    }),
    z.object({
      type: z.literal('confirm'),
      title: z.string(),
      description: z.string(),
      actionName: z.string(),   // → 调 executeAction
    }),
  ])
)

export function ResultRenderer({ manifest }: { manifest: unknown }) {
  const m = ResultManifest.parse(manifest)

  switch (m.type) {
    case 'text':
      return <Text>{m.content}</Text>

    case 'card':
      return (
        <Card title={m.title}>
          <Stack>
            {m.children.map((child, i) => (
              <ResultRenderer key={i} manifest={child} />
            ))}
          </Stack>
        </Card>
      )

    case 'table':
      return <DataTable columns={m.columns} rows={m.rows} />

    case 'alert':
      return <Alert variant={m.variant}>{m.message}</Alert>

    case 'confirm':
      return (
        <ConfirmCard
          title={m.title}
          description={m.description}
          onConfirm={async () => {
            // 调真实 action
            const [actionName, ...argKeys] = m.actionName.split(':')
            // 实际项目：从上下文拿 args
            await executeAction(actionName, {}, ctx)
          }}
        />
      )
  }
}
```

## 第 5 步：组装到 UI

```tsx
// src/pages/RunsPage.tsx
import { useState } from 'react'
import { executeAction } from '@/manifest/runtime'
import { ResultRenderer } from '@/manifest/renderer'

export function RunsPage() {
  const [results, setResults] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)

  async function handleQuery(question: string) {
    setLoading(true)
    try {
      // 1. 让 LLM 决定调什么
      const llmResponse = await callLLMWithActions(question, [], {
        provider: 'openai',
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        model: 'gpt-4o',
      })

      // 2. 提取 tool_call
      const toolCalls = llmResponse.choices[0]?.message?.tool_calls || []

      // 3. 顺序执行
      const newResults = []
      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments)
        const result = await executeAction(call.function.name, args, ctx)
        newResults.push(result)
      }

      setResults(newResults)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Input onSubmit={handleQuery} loading={loading} />
      <Stack>
        {results.map((r, i) => <ResultRenderer key={i} manifest={r} />)}
      </Stack>
    </div>
  )
}
```

## Vue 3 实现（对比）

### 1. Action Manifest（和 React 一样）
TS 写法完全一致，**框架无关**。

### 2. Runtime（和 React 一样）

### 3. Renderer

```vue
<!-- src/manifest/Renderer.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import ResultManifest from './schemas/result'
import { Card, Text, Alert, Stack, DataTable } from '@/components'

const props = defineProps<{ manifest: unknown }>()

const parsed = computed(() => ResultManifest.parse(props.manifest))
</script>

<template>
  <Text v-if="parsed.type === 'text'">{{ parsed.content }}</Text>

  <Card v-else-if="parsed.type === 'card'" :title="parsed.title">
    <Stack>
      <Renderer
        v-for="(child, i) in parsed.children"
        :key="i"
        :manifest="child"
      />
    </Stack>
  </Card>

  <DataTable v-else-if="parsed.type === 'table'" :columns="parsed.columns" :rows="parsed.rows" />

  <Alert v-else-if="parsed.type === 'alert'" :variant="parsed.variant">
    {{ parsed.message }}
  </Alert>

  <ConfirmCard
    v-else-if="parsed.type === 'confirm'"
    :title="parsed.title"
    :description="parsed.description"
    :action-name="parsed.actionName"
  />
</template>
```

### 4. 组装

```vue
<!-- src/pages/RunsPage.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { executeAction } from '@/manifest/runtime'
import Renderer from '@/manifest/Renderer.vue'
import type { ActionContext } from '@/manifest/runtime'

const results = ref<unknown[]>([])
const loading = ref(false)

const ctx: ActionContext = {
  user: { id: 'u1', permissions: ['runs.read', 'runs.delete'] },
  token: '...',
  traceId: crypto.randomUUID(),
  idempotency: { /* ... */ },
  audit: { /* ... */ },
  requestApproval: async (req) => {
    return window.confirm(`确认执行 ${req.action}?\n\n${JSON.stringify(req.preview, null, 2)}`)
  },
}

async function handleQuery(question: string) {
  loading.value = true
  try {
    const llmResponse = await callLLMWithActions(question, [], { /* ... */ })
    const toolCalls = llmResponse.choices[0]?.message?.tool_calls || []

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments)
      const result = await executeAction(call.function.name, args, ctx)
      results.value.push(result)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <QueryInput @submit="handleQuery" :loading="loading" />
    <Stack>
      <Renderer v-for="(r, i) in results" :key="i" :manifest="r" />
    </Stack>
  </div>
</template>
```

## React vs Vue 选型

| 维度 | React | Vue 3 |
|------|-------|-------|
| **生态** | AG-UI / CopilotKit 官方支持 | 需自实现或用社区适配 |
| **状态共享** | Zustand / Redux | Pinia |
| **类型推导** | 优秀 | 优秀 |
| **学习曲线** | Hooks 心智模型 | Composition API 心智模型 |
| **LLM 适配器** | 主流 | 需自己写 |
| **HITL UI** | `renderAndWaitForResponse` 直接支持 | 自实现 `useConfirm` composable |
| **推荐场景** | 复杂 SPA、agent 优先 | 中后台、组件优先 |

**建议**：
- 已经在 React 栈 → 留在 React
- 已经在 Vue 栈 → 自实现，参考本篇
- **新项目** → 优先 React（生态红利）

## 关键工具库

| 库 | 用途 |
|-----|------|
| `zod` | schema 校验 + 类型推导（必装） |
| `zod-to-json-schema` | Zod → JSON Schema（给 LLM 用） |
| `zustand` (React) | 状态共享 |
| `pinia` (Vue) | 状态共享 |
| `ai` / `openai` / `@anthropic-ai/sdk` | LLM 客户端 |
| `react-markdown` | 渲染 LLM 文本（如果还要混合） |
| `dompurify` | 防御性 HTML 清洗（**必装**，renderer 兜底） |
| `@copilotkit/react-core` | AG-UI 完整实现（如果选 CopilotKit） |

## 下一步

- 想了解 HITL / 权限 / 审计怎么落地 → [06-security-policy.md](./06-security-policy.md)
- 想看完整 action manifest 规范 → [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)
- 想用现成框架省事 → [08-tooling-ecosystem.md](./08-tooling-ecosystem.md)

---

### 参考

- CopilotKit React 集成文档 (2026)
- Anthropic Tool Use 文档
- OpenAI Function Calling 文档
- Vue 3 Composition API 文档
