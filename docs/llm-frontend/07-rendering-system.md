# 07 · 渲染系统

> 渲染器把 Action 的 result manifest 翻译成真实 UI 组件。它是"你的设计系统 + LLM 编排"的唯一接触面。

## 核心原则

```
┌─────────────────────────────────────────────────────────────────┐
│  LLM 输出的 manifest 永远不直接变成 DOM                            │
│                                                                 │
│  1. manifest 必须经过 Zod 校验（拒绝一切幻觉）                     │
│  2. 渲染器只能用白名单组件（拒绝一切不在设计系统里的元素）           │
│  3. 所有文本必须经过 sanitize（拒绝 XSS）                          │
│  4. 所有交互（onClick）必须映射到 action.id（拒绝"自由回调"）       │
│  5. 输出必须经过可访问性检测（拒绝不可达 / 无标签的控件）            │
└─────────────────────────────────────────────────────────────────┘
```

## Manifest Schema

### 最小 manifest 类型

```ts
// src/manifest/schemas/result.ts
import { z } from 'zod'

// 递归定义
type ResultManifestType = {
  type: 'text'
  content: string
} | {
  type: 'card'
  title: string
  children: ResultManifestType[]
} | {
  type: 'table'
  columns: string[]
  rows: Record<string, unknown>[]
  pagination?: { page: number; total: number }
} | {
  type: 'alert'
  variant: 'info' | 'success' | 'warning' | 'error'
  message: string
} | {
  type: 'confirm'
  title: string
  description: string
  actionName: string
  actionArgs: Record<string, unknown>
}

export const ResultManifest: z.ZodType<ResultManifestType> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      content: z.string().max(10_000),  // 限制大小
    }),
    z.object({
      type: z.literal('card'),
      title: z.string().max(200),
      children: z.array(ResultManifest).max(50),  // 限制嵌套
    }),
    z.object({
      type: z.literal('table'),
      columns: z.array(z.string().max(50)).max(20),
      rows: z.array(z.record(z.unknown())).max(1000),
      pagination: z.object({
        page: z.number().int().min(1),
        total: z.number().int().min(0),
      }).optional(),
    }),
    z.object({
      type: z.literal('alert'),
      variant: z.enum(['info', 'success', 'warning', 'error']),
      message: z.string().max(2000),
    }),
    z.object({
      type: z.literal('confirm'),
      title: z.string().max(200),
      description: z.string().max(2000),
      actionName: z.string().regex(/^[a-z]+\.[a-z]+\.[a-z]+$/),  // 必须是合法 action id
      actionArgs: z.record(z.unknown()),
    }),
  ])
)
```

### 扩展 manifest（生产级）

```ts
// 加更多组件
const ResultManifest = z.discriminatedUnion('type', [
  // 基础
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('card'), title: z.string(), children: z.array(ResultManifest) }),
  z.object({ type: z.literal('alert'), variant: ..., message: z.string() }),

  // 数据
  z.object({ type: z.literal('table'), columns: z.array(z.string()), rows: z.array(z.record(z.unknown())) }),
  z.object({ type: z.literal('list'), items: z.array(z.object({ title: z.string(), description: z.string().optional() })) }),
  z.object({ type: z.literal('chart'), chartType: z.enum(['bar','line','pie']), data: z.array(z.record(z.number())) }),

  // 交互
  z.object({ type: z.literal('confirm'), title: z.string(), description: z.string(), actionName: z.string(), actionArgs: z.record(z.unknown()) }),
  z.object({ type: z.literal('form'), fields: z.array(z.object({ name: z.string(), label: z.string(), type: z.enum(['text','number','select']), options: z.array(z.string()).optional() })), submitAction: z.string() }),

  // 反馈
  z.object({ type: z.literal('progress'), percent: z.number().min(0).max(100), label: z.string().optional() }),
  z.object({ type: z.literal('diff'), before: z.string(), after: z.string() }),

  // 媒体（白名单 URL）
  z.object({ type: z.literal('image'), src: z.string().url().regex(/^https:/), alt: z.string() }),
])
```

## Renderer 实现

### React

```tsx
// src/manifest/renderer.tsx
import { ResultManifest as ManifestSchema } from './schemas/result'
import { Card, Text, Alert, Button, Group, Stack, DataTable, Form, Image, Progress, Diff, Chart, List } from '@/components'
import { executeAction } from './runtime'
import { useActionContext } from './context'

export function ResultRenderer({ manifest, depth = 0 }: { manifest: unknown; depth?: number }) {
  // 1. 校验
  if (depth > 10) throw new Error('Manifest nesting too deep (max 10)')
  const m = ManifestSchema.parse(manifest)

  // 2. 渲染（白名单 dispatch）
  switch (m.type) {
    case 'text': {
      // 3. 文本 sanitize（防止 XSS）
      return <Text content={sanitizeText(m.content)} />
    }

    case 'card': {
      return (
        <Card title={m.title}>
          <Stack>
            {m.children.map((child, i) => (
              <ResultRenderer key={i} manifest={child} depth={depth + 1} />
            ))}
          </Stack>
        </Card>
      )
    }

    case 'alert': {
      return <Alert variant={m.variant} message={m.message} />
    }

    case 'table': {
      return <DataTable columns={m.columns} rows={m.rows} pagination={m.pagination} />
    }

    case 'confirm': {
      return <ConfirmCard manifest={m} />
    }

    default: {
      // 不应该到这里
      return null
    }
  }
}

function ConfirmCard({ manifest }: { manifest: Extract<z.infer<typeof ManifestSchema>, { type: 'confirm' }> }) {
  const ctx = useActionContext()

  return (
    <Card variant="warning">
      <Text weight="bold">{manifest.title}</Text>
      <Text size="sm" c="dimmed">{manifest.description}</Text>
      <Code block>{JSON.stringify(manifest.actionArgs, null, 2)}</Code>
      <Group>
        <Button onClick={async () => {
          // 4. 交互只允许调 action，不允许 inline 逻辑
          await executeAction(manifest.actionName, manifest.actionArgs, ctx)
        }}>确认</Button>
        <Button variant="default">取消</Button>
      </Group>
    </Card>
  )
}

// 5. sanitize：清洗文本（DOMPurify）
function sanitizeText(s: string): string {
  // textContent 已经天然防 XSS，但如果允许 markdown 需要进一步处理
  return s
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')  // 简单剥离 HTML
}
```

### Vue 3

```vue
<!-- src/manifest/Renderer.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { ResultManifest } from './schemas/result'
import { Card, Text, Alert, DataTable, ConfirmCard, Stack } from '@/components'

const props = defineProps<{
  manifest: unknown
  depth?: number
}>()

// 校验失败时返回 fallback
const parsed = computed(() => {
  try {
    return ResultManifest.parse(props.manifest)
  } catch (err) {
    return { type: 'alert', variant: 'error', message: 'Invalid manifest' } as const
  }
})
</script>

<template>
  <Text v-if="parsed.type === 'text'" :content="parsed.content" />

  <Card v-else-if="parsed.type === 'card'" :title="parsed.title">
    <Stack>
      <Renderer
        v-for="(child, i) in parsed.children"
        :key="i"
        :manifest="child"
        :depth="(depth ?? 0) + 1"
      />
    </Stack>
  </Card>

  <Alert v-else-if="parsed.type === 'alert'" :variant="parsed.variant" :message="parsed.message" />

  <DataTable v-else-if="parsed.type === 'table'" :columns="parsed.columns" :rows="parsed.rows" />

  <ConfirmCard v-else-if="parsed.type === 'confirm'" :manifest="parsed" />
</template>
```

## 关键设计点

### 1. 校验是硬约束

**任何 manifest 进 renderer 之前必须 parse**。parse 失败 → 显示 fallback（不要让整个 UI 崩）。

```tsx
function SafeRenderer({ manifest }: { manifest: unknown }) {
  try {
    return <ResultRenderer manifest={manifest} />
  } catch (err) {
    return (
      <Alert variant="error">
        无法渲染结果：{(err as Error).message}
      </Alert>
    )
  }
}
```

### 2. 白名单组件

**禁止让 manifest 指定任意组件**。只允许 schema 中定义过的 type。

```ts
// ❌ 错误：让 manifest 任意指定组件（这种"任意指定 HTML 标签 + 任意 props"的设计
//    等于把 XSS 钥匙交给 LLM，是绝对禁止的反模式）
{ type: 'html', tag: 'div', children: ... }
{ type: 'react-component', name: 'MyButton', props: ... }

// ✅ 正确：白名单 dispatch
switch (m.type) {
  case 'text': ...
  case 'card': ...
  case 'alert': ...
  // 任何 schema 外的 type 都不可能进 renderer
}
```

### 3. 文本防 XSS

**关键防线**：
- text 字段：textContent 天然防 XSS（**绝对不要**用任何把 LLM 输出当 HTML 字符串注入 DOM 的方式）
- markdown：DOMPurify + 严格白名单标签
- 永远不要让 LLM 输出的字符串绕过 React/Vue 的自动转义

```ts
import DOMPurify from 'dompurify'

// 如果要支持 markdown
const clean = DOMPurify.sanitize(markdown, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
})
```

### 4. 交互只允许调 action

manifest 中的 onClick 之类，**只能指向 action.id**。不允许 inline 函数。

```ts
// ❌ 错误：允许任意回调（让 LLM 决定"调哪个 URL / 跑什么代码"）
{ type: 'button', onClick: 'fetch("/api/admin/delete-all")' }

// ✅ 正确：只允许 action.id
{
  type: 'confirm',
  actionName: 'kb.tree.delete',
  actionArgs: { treeId: '...' }
}
```

### 5. 限制大小和深度

LLM 可能输出**极大或极深**的 manifest，导致 UI 卡死。

```ts
const ResultManifest = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      content: z.string().max(10_000),  // 单 text 不超 10k
    }),
    z.object({
      type: z.literal('card'),
      children: z.array(ResultManifest).max(50),  // 单 card 不超 50 子项
    }),
    // ...
  ])
)

// 渲染时再限制深度
if (depth > 10) throw new Error('Too deep')
```

### 6. 错误降级

校验失败、组件未注册、action 未知 —— 都不要让 UI 崩。

```tsx
function ResultRenderer({ manifest }: { manifest: unknown }) {
  let m
  try {
    m = ResultManifest.parse(manifest)
  } catch (err) {
    console.error('Invalid manifest:', err)
    return <Alert variant="error">结果格式异常，已忽略</Alert>
  }

  switch (m.type) {
    case 'text': return <Text>{m.content}</Text>
    case 'card': return <Card title={m.title}>...</Card>
    // ...
    default: {
      // exhaustiveness check
      const _exhaustive: never = m
      return <Alert variant="error">未知结果类型</Alert>
    }
  }
}
```

## 高级模式

### 流式渲染

LLM 流式输出时，**逐个 chunk 解析 + 渲染**：

```tsx
function StreamingRenderer({ chunks }: { chunks: string[] }) {
  // chunks 是 LLM 流式输出的 JSON 字符串片段
  // 拼起来 + parse + 渲染
  const combined = chunks.join('')
  let manifest
  try {
    manifest = ResultManifest.parse(JSON.parse(combined))
  } catch {
    // 还没完整，先不渲染
    return null
  }
  return <ResultRenderer manifest={manifest} />
}
```

### Diff / 变更对比

特别适合"删除前的预览"：

```ts
{ type: 'diff', before: '...', after: '...' }
```

```tsx
case 'diff': return <Diff before={m.before} after={m.after} />
```

### 表单

让 LLM **生成表单让用户填**：

```ts
{ type: 'form', fields: [
  { name: 'title', label: '标题', type: 'text' },
  { name: 'priority', label: '优先级', type: 'select', options: ['low','high'] }
], submitAction: 'feedback.create' }
```

```tsx
case 'form': {
  const [values, setValues] = useState<Record<string, any>>({})
  return (
    <Form
      fields={m.fields}
      values={values}
      onChange={(name, v) => setValues({ ...values, [name]: v })}
      onSubmit={async () => {
        await executeAction(m.submitAction, values, ctx)
      }}
    />
  )
}
```

### Chart

让 LLM 输出数据 + 图表类型，前端用 Chart 组件渲染：

```ts
{ type: 'chart', chartType: 'bar', data: [
  { label: '周一', value: 12 },
  { label: '周二', value: 18 }
]}
```

## 与设计系统的协作

### 主题 / Token 继承

Renderer 输出必须用**你的 design token**，不能 hardcode 颜色 / 间距。

```tsx
// ✅ 正确：用 design token
<Alert variant="error">  // 颜色由 Alert 组件决定，来自 token

// ❌ 错误：hardcode
<Alert style={{ color: '#ff0000' }}>  // 破坏主题一致性
```

### 组件库选择

Renderer 应该用**已经验证过的组件库**：

| 场景 | 推荐 |
|------|------|
| 中后台 | shadcn/ui、Ant Design、Material UI |
| 营销站 | 自实现 + Tailwind |
| 移动端 | React Native Paper、Gluestack |

### 可访问性

每个 renderer 输出必须：
- 文字对比度 ≥ 4.5:1
- 交互元素键盘可达
- 必要的 ARIA 标签
- 图标有 aria-label

```tsx
case 'alert': {
  return (
    <Alert
      variant={m.variant}
      role={m.variant === 'error' ? 'alert' : 'status'}  // 屏幕阅读器友好
      aria-live={m.variant === 'error' ? 'assertive' : 'polite'}
    >
      {m.message}
    </Alert>
  )
}
```

## 测试策略

### 单元测试

```ts
describe('ResultRenderer', () => {
  it('renders text', () => {
    const { getByText } = render(<ResultRenderer manifest={{ type: 'text', content: 'hi' }} />)
    expect(getByText('hi')).toBeInTheDocument()
  })

  it('rejects invalid manifest', () => {
    const { getByText } = render(<ResultRenderer manifest={{ type: 'unknown' } as any } />)
    expect(getByText(/结果格式异常/)).toBeInTheDocument()
  })

  it('rejects oversized text', () => {
    const huge = 'x'.repeat(20_000)
    expect(() => ResultRenderer({ manifest: { type: 'text', content: huge } } as any)).toThrow()
  })

  it('rejects deep nesting', () => {
    const deep = { type: 'card', title: 'a', children: [] } as any
    let cur = deep
    for (let i = 0; i < 20; i++) {
      const next = { type: 'card', title: 'a', children: [] }
      cur.children = [next]
      cur = next
    }
    const { getByText } = render(<ResultRenderer manifest={deep} />)
    expect(getByText(/nesting too deep|Too deep/)).toBeInTheDocument()
  })

  it('sanitizes HTML in text', () => {
    const { container } = render(<ResultRenderer manifest={{ type: 'text', content: '<script>alert(1)</script>safe' }} />)
    expect(container.querySelector('script')).toBeNull()
  })

  it('confirm action calls executeAction with right args', async () => {
    const mockExecute = vi.fn()
    // ... 测试 confirm 调对了 action 和 args
  })
})
```

### 集成测试

用 Playwright 跑"真实 LLM → manifest → 渲染"：

```ts
test('user can ask "show last 5 runs" and see results', async ({ page }) => {
  await page.goto('/runs')
  await page.fill('input[name="query"]', '显示最近 5 条 run')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('table')).toBeVisible()  // 渲染了 table
  await expect(page.getByRole('row')).toHaveCount(6)  // 1 header + 5 rows
})
```

## 性能优化

### 大表格虚拟化

LLM 可能输出 1000 行表格，**必须用虚拟列表**：

```tsx
case 'table': {
  return (
    <VirtualDataTable
      columns={m.columns}
      rows={m.rows}
      rowHeight={36}
      height={600}
    />
  )
}
```

### 避免重新解析

```tsx
const parsedManifest = useMemo(() => {
  try { return ResultManifest.parse(manifest) }
  catch { return null }
}, [manifest])

if (!parsedManifest) return <Alert variant="error">结果格式异常</Alert>
return <ResultRenderer manifest={parsedManifest} />
```

### 慢组件懒加载

```tsx
const ChartRenderer = lazy(() => import('./ChartRenderer'))
const FormRenderer = lazy(() => import('./FormRenderer'))
```

## 反模式

### ❌ 让 LLM 指定任意组件
```ts
// ❌ schema 是开放的
const Manifest = z.object({ type: z.string(), props: z.record(z.unknown()) })
// LLM 可以传 { type: 'div', props: { dangerouslySetInnerHTML: { __html: '...' } } }
```

### ❌ 接收 manifest 时不校验
```tsx
// ❌ LLM 幻觉直接崩 UI
return <Card>{m.title}</Card>  // m 可能是 undefined
```

### ❌ 校验失败就让 UI 空白
```tsx
// ❌ 静默失败
if (!valid) return null  // 用户看不到任何东西
```

## 下一步

- 想用现成框架（CopilotKit / mcp-ui）省事 → [08-tooling-ecosystem.md](./08-tooling-ecosystem.md)
- 想看完整 Action Manifest 规范 → [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)
- 想把本项目 webassist 改造过来 → [09-webassist-integration.md](./09-webassist-integration.md)

---

### 参考

- CopilotKit Generative UI 文档 (2026)
- A2UI v0.9 Spec (Google, 2026)
- mcp-ui Protocol (2026)
- DOMPurify Documentation
