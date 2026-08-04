# 01 · 核心概念

> 用 15 分钟搞清楚 Generative UI / Agentic UI / LLM-as-orchestrator 三件事分别是什么、不是什么。

## 一图流

```
                  ┌──────────────────────────────────────────┐
                  │         用户（自然语言 / 语音 / 点击）       │
                  └──────────────────────────────────────────┘
                                    ↓
                  ┌──────────────────────────────────────────┐
                  │  LLM Orchestrator（理解意图 + 编排 plan）   │
                  │  ↓ 读到 application manifest              │
                  │  ↓ 决定调哪些 action                      │
                  └──────────────────────────────────────────┘
                                    ↓ JSON manifest
                  ┌──────────────────────────────────────────┐
                  │  Runtime Guard（校验 / 授权 / 风险）        │
                  └──────────────────────────────────────────┘
                                    ↓
                  ┌──────────────────────────────────────────┐
                  │  Action Executors（真实业务执行）           │
                  │  → 你的数据库 / API / 工作流               │
                  └──────────────────────────────────────────┘
                                    ↓ 结构化 result
                  ┌──────────────────────────────────────────┐
                  │  Renderer（你的设计系统组件）              │
                  │  → 不是 LLM 写 React 组件                 │
                  │  → 是 LLM 选你的预制组件 + 填 props         │
                  └──────────────────────────────────────────┘
```

## 三个核心概念

### 1. Generative UI（生成式 UI）

**是什么**：LLM 在运行时输出**结构化 UI 描述**（通常是 JSON manifest），前端用**预制的设计系统组件**渲染出来。

**不是什么**：❌ LLM 直接生成 HTML / JSX / React 组件代码。

**关键特征**：
- 设计系统是 **source of truth**（你写的 token、组件、可访问性约束不会被 LLM 改坏）
- LLM 只是**选组件 + 填 props**——它决定"用什么、按什么顺序、传什么数据"
- 所有 UI 输出都经过**结构化校验**（Zod / JSON Schema），LLM 幻觉会被拦截

**例子**：
```jsonc
// LLM 输出
{
  "type": "Card",
  "props": { "title": "删除成功", "variant": "success" },
  "children": [
    { "type": "Text", "props": { "content": "已删除 run abc-123" } }
  ]
}

// 前端渲染：用你的 <Card> <Text> 组件，不是 LLM 生成的 <div>
```

**官方定义**（CopilotKit 2026）："LLM emits a JSON manifest that a frontend renders through accessible primitives like Radix UI or shadcn/ui, never raw HTML."

### 2. Agentic UI（代理式 UI）

**是什么**：UI 不再是被动展示，而是**主动编排任务的执行**。LLM 当作"操作员"，UI 变成"操作面板 + 状态投影"。

**不是什么**：❌ 单纯 chatbox 套壳（"我是 AI 助手，请问您想问什么"）。

**关键特征**：
- 用户说的每句话都可能触发**一连串操作**（observe → plan → act → validate → next）
- UI 实时**投影执行状态**（loading / done / error / unsure）
- 关键操作**需要人工确认**（HITL - Human-in-the-loop）
- 一切**可审计**（每步记录 input / output / user / timestamp）

**与 Generative UI 的关系**：Agentic UI **包含** Generative UI。Agentic UI 是编排，Generative UI 是渲染。

**例子**：
```
用户："把这个月所有低于 4 星的反馈都整理成报告"

agent:
  1. observe(feedback.list, filter={ rating < 4, month=2026-07 })
  2. plan(generateReport(items))
  3. prepare(generateReport.dryRun) → 预览
  4. [用户确认]
  5. commit → 写入
  6. render(<ReportView data={...} />)
```

**官方定义**（Anthropic）："MCP Apps defines how LLMs produce JSON manifests that renderers use to construct interfaces, establishing a de facto standard for component-based generation."

### 3. LLM-as-orchestrator（LLM 当编排者）

**是什么**：把 LLM 当作**永远不信任的下属**——它负责"决策和表达"，但**所有执行权都在你手里**。它只能"建议"，不能"动手"。

**不是什么**：❌ 让 LLM 直接调数据库、HTTP、文件系统。❌ 让 LLM 自己写 SQL / 拼 URL。

**关键特征**：
- LLM 输出的是**意图**（manifest / 工具调用参数），不是**执行结果**
- 所有执行**经过 runtime guard**（schema 校验 + 权限检查 + 风险评估）
- 所有副作用**走应用层事务**（不是 LLM 的事）
- 失败可重放、可回滚、可审计

**反模式 → 正模式**：

```ts
// ❌ 错误：让 LLM 直接拼 SQL
const sql = await llm("为 user_123 查最近 7 天的订单")
db.query(sql)  // 灾难：SQL 注入 + 权限失控

// ✅ 正确：让 LLM 选 action，runtime 验证 + 执行
const result = await llm("查 user_123 最近 7 天的订单")
// LLM 决定调 action: orders.list
// LLM 输出: { userId: "user_123", days: 7 }
await runtime.executeAction("orders.list", { userId: "user_123", days: 7 })
// runtime 内部：Zod 校验 + 鉴权 + 真正查库
```

## 三个概念的层级关系

```
LLM-as-orchestrator      ←  思维模式：你怎么"使用" LLM
       │
       ↓ 必须实现
Agentic UI               ←  交互模式：UI 怎么"代理"用户操作
       │
       ↓ 必须实现
Generative UI            ←  渲染模式：UI 怎么"被生成"出来
```

**上一层是下一层的实现方式**：
- 没有 LLM-as-orchestrator → Agentic UI 不可能安全
- 没有 Agentic UI → Generative UI 就只是个 chatbox 装饰
- 没有 Generative UI → 只能把 LLM 输出当文本，UI 全靠前端硬编码

## 容易混淆的相邻概念

| 概念 | 关系 | 区别 |
|------|------|------|
| **Copilot** | Agentic UI 的常见形态 | copilot 是"嵌入式助手"；Agentic UI 是"整个 UI 的范式" |
| **MCP** | Agentic UI 的传输层 | MCP 解决"工具怎么被发现 / 调用"；Agentic UI 解决"工具怎么被展示" |
| **RAG** | 常与 Agentic UI 配合 | RAG 让 LLM "有知识"；Agentic UI 让 LLM "能动手" |
| **Chatbot** | Generative UI 的退化版 | Chatbot 只能输出文本/卡片；Generative UI 输出任意组件 |
| **Low-code** | Generative UI 的另一种实现 | Low-code 是人拖拽；Generative UI 是 LLM 编排 |
| **Web Components** | Generative UI 的渲染容器 | WC 是浏览器原语；Generative UI 用你的组件库 |

## 一些术语统一

为了文档集里没有歧义，下表是术语约定：

| 术语 | 含义 | 避免混用 |
|------|------|----------|
| **Action** | 应用对外暴露的一个能力单位（增删改查/触发流程） | 不要叫 "API"（太宽泛）、"Function"（太技术） |
| **Manifest** | Action / Route / Component 的结构化声明 | 不要叫 "Schema"（schema 是它的一部分） |
| **Runtime** | 执行 Action 前的校验 / 授权 / 拦截层 | 不要叫 "Middleware"（middleware 是它的一种实现） |
| **Renderer** | 把 Action result manifest 渲染为真实 UI 的层 | 不要叫 "Template engine"（template 是它的一种实现） |
| **Orchestrator** | LLM 在此充当决策者 | 不要叫 "Controller"（controller 是后端概念） |
| **HITL** | Human-in-the-loop，关键操作的人工确认 | 缩写固定，不展开 |
| **Design system** | 你的 token + 组件 + 可访问性约束 | 不要叫 "UI library"（太窄） |

## 一句话总结

> **Generative UI = LLM 选你的组件填数据；Agentic UI = LLM 编排你的 actions；LLM-as-orchestrator = LLM 永远不直接动手。**

## 下一步

读 [02-architecture.md](./02-architecture.md) 了解一个完整的面向 LLM 的前端架构应该有几层、每层管什么。

---

### 参考

- CopilotKit, "Generative UI Spectrum" (2026-07)
- Anthropic, MCP Apps Spec v1.0 (2026-01)
- Google, A2UI v0.9 Spec (2026-04)
- Microsoft, Declarative Agent Manifest 1.8
- Mozilla AAF, "Agent Capability Manifest"
- Jonas, "UIR-X: A Semantic Frontend Intermediate Language for LLM Coding" (2026)
