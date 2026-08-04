# 08 · 工具链与生态

> 2026 年已经有不少现成框架让你跳过"自己搭"。本篇帮你选型。

## 速查表

| 框架 | 协议 | 类型 | 适合 | 学习成本 |
|------|------|------|------|----------|
| **CopilotKit** | AG-UI | React / Angular | 完整 copilot 体验 | 中 |
| **LangGraph** | AG-UI | Python/TS | 后端 agent 编排 | 高 |
| **mcp-ui** | MCP Apps | 任何 | MCP server 加 UI | 低 |
| **Mozilla AAF** | 自定义 | Playwright adapter | 已有 HTML 应用 + AI | 中 |
| **A2UI** | A2UI v0.9 | 任何 | 跨平台 UI 描述 | 低 |
| **Vercel AI SDK** | 自实现 | TS/Next | LLM 工具调用封装 | 低 |
| **Mastra** | AG-UI | TS | 后端 agent 框架 | 中 |
| **Pydantic AI** | AG-UI | Python | 类型安全 agent | 中 |

## 选型决策树

```
你已经有应用 + 想加 copilot
├── 已有 MCP server
│   └── 用 mcp-ui（最小代价）
├── 是 React / Angular
│   └── 用 CopilotKit（最完整）
└── 是 Vue / 其他
    └── 自实现 renderer + 选 LangGraph 当后端

你是从 0 起新项目
├── 跨平台（iOS + Android + Web）→ A2UI
├── Web 单平台
│   ├── 已有 Python 后端 → LangGraph
│   └── 已有 TS 后端 → Mastra / 自实现
└── 想"装上 AI 就能用" → CopilotKit

你已经有 HTML 应用，想让 AI 操控
└── Mozilla AAF（不改前端）
```

## 详细对比

### CopilotKit

**官网**：[copilotkit.ai](https://www.copilotkit.ai/)

**协议**：AG-UI 主导。

**适合**：
- 已经有 React / Angular 应用
- 想做"嵌入式 AI 助手"
- 要 HITL / 状态同步 / Generative UI 完整能力

**优点**：
- 最完整的前端集成（一行 provider 启用）
- 文档详细，示例丰富
- 生态广（LangGraph / Mastra / Pydantic AI 都能接）
- 自带 chat UI、状态同步、HITL

**缺点**：
- 绑定 React/Angular（Vue 需要自实现）
- 体积不小（gzipped ~50KB）
- 二次开发需要熟悉其内部 hook 体系

**最小集成**：
```tsx
import { CopilotKit } from '@copilotkit/react-core'
import { CopilotChat } from '@copilotkit/react-ui'

function App() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="my_agent">
      <YourApp />
      <CopilotChat />
    </CopilotKit>
  )
}
```

**评级**：⭐⭐⭐⭐⭐（React 项目首选）

### LangGraph

**官网**：[langchain-ai.github.io/langgraph/](https://langchain-ai.github.io/langgraph/)

**协议**：通过 `ag-ui-langgraph` 库接 AG-UI。

**适合**：
- 后端用 Python / TypeScript
- 需要复杂的多步 agent 编排
- 团队接受 LangChain 生态

**优点**：
- 强大的状态机 / 多步 plan / cycle
- 大量集成（OpenAI / Anthropic / Gemini / Mistral / Ollama）
- 可视化（LangGraph Studio）
- AG-UI 桥接库已稳定

**缺点**：
- 学习曲线陡（节点、边、状态机思维）
- 依赖 LangChain 生态
- "什么都想做"的瑞士军刀，可能 over-engineering

**最小集成**：
```python
from langgraph.graph import StateGraph
from ag_ui_langgraph import add_langgraph_fastapi_endpoint

class State(TypedDict):
    messages: list

def my_agent(state: State):
    # 你的 agent 逻辑
    return state

graph = StateGraph(State)
graph.add_node("agent", my_agent)
graph.set_entry_point("agent")

app = FastAPI()
add_langgraph_fastapi_endpoint(app, graph, "/agent")
```

**评级**：⭐⭐⭐⭐（Python 后端首选）

### mcp-ui

**官网**：[mcp-ui.dev](https://mcp-ui.dev/)

**协议**：MCP Apps。

**适合**：
- 已经有 MCP server（Claude 工具）
- 想给工具加 UI
- 想要最轻的方案

**优点**：
- 极简：就是 JSON 资源 + 客户端渲染
- 跨平台（任何支持 MCP 的客户端）
- 协议中立

**缺点**：
- 状态同步弱（靠 tool 结果往返）
- HITL 要应用层实现
- 生态相对窄

**最小集成**：
```python
# server.py
from mcp_ui_server import UIResource

@mcp.resource("ui://my-card")
def my_card():
    return UIResource(
        type="card",
        props={"title": "Hello"},
        children=[...]
    )
```

**评级**：⭐⭐⭐（已有 MCP server 首选）

### Mozilla AAF

**官网**：[github.com/mozilla-ai/aaf](https://github.com/mozilla-ai/aaf)

**协议**：自定义 + Playwright adapter。

**适合**：
- 已经有 HTML 应用，**不想改前端**
- 想"装个 manifest + 装个 runtime"就让 AI 操控
- 接受用 Playwright 适配

**优点**：
- **零前端改动**（给 HTML 加 `data-agent-*` 属性 + manifest）
- 内置 AAF runtime（校验、策略、执行、审计）
- WebMCP 桥接（Chrome 146+ 注册成浏览器原生工具）
- 测试友好（Playwright adapter）

**缺点**：
- 状态同步弱
- 不能自定义 UI（用现有 HTML）
- 生态窄

**核心思路**：
```html
<button data-agent-action="delete_run" data-agent-arg-id="abc-123">删除</button>

<!-- 配套 manifest 在 /.well-known/agent-manifest.json -->
```

**评级**：⭐⭐⭐（不改前端时选）

### A2UI

**官网**：[a2ui.dev](https://a2ui.dev/)（推测）

**协议**：A2UI v0.9。

**适合**：
- 跨平台（iOS + Android + Web 一致 UI）
- 已有 A2UI 客户端
- 不需要复杂状态同步

**优点**：
- 极轻（一段 JSON schema）
- 跨平台
- Google 官方背书

**缺点**：
- 不能携带交互（要 RPC）
- 不能携带状态
- 生态最窄

**评级**：⭐⭐（跨平台场景才用）

### Vercel AI SDK

**官网**：[sdk.vercel.ai](https://sdk.vercel.ai/)

**协议**：自实现 / 支持多种。

**适合**：
- Next.js 项目
- 想要简单工具调用
- 不想引大框架

**优点**：
- 极简
- Next.js 原生支持
- 流式输出做得好

**缺点**：
- 没有 copilot 整套（HITL / 状态同步要自己写）
- 不强制 Action Manifest 规范

**最小集成**：
```ts
import { streamText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const result = await streamText({
  model: openai('gpt-4o'),
  tools: {
    weather: tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => fetchWeather(city),
    }),
  },
  prompt: '...',
})
```

**评级**：⭐⭐⭐（Next.js 简单场景用）

### Mastra

**官网**：[mastra.ai](https://mastra.ai/)

**协议**：AG-UI。

**适合**：
- TypeScript 后端
- 想用现代 agent 框架（替代 LangChain.js）

**优点**：
- TS 原生
- 现代 API
- 集成 AG-UI

**缺点**：
- 生态比 LangGraph 窄
- 生产案例少

**评级**：⭐⭐⭐（TS 后端备选）

### Pydantic AI

**官网**：[ai.pydantic.dev](https://ai.pydantic.dev/)

**协议**：AG-UI。

**适合**：
- Python 后端
- 重视类型安全

**优点**：
- Pydantic 生态
- 类型安全
- 集成 AG-UI

**缺点**：
- 比 LangGraph 年轻
- 生态还在建立

**评级**：⭐⭐⭐（Python 类型党）

## 自实现 vs 用框架

### 自实现的边界

**自实现**是合适的，如果：
- 你想要完全控制（合规、私有部署）
- 你的场景特殊（不是通用 copilot）
- 团队人手够 / 想学原理

**用框架**是合适的，如果：
- 你想 2 周出 demo
- 你的场景是"通用 copilot"
- 团队不想造轮子

### 自实现最小代价

如果你决定自实现（参考 [05](./05-react-vue-impl.md)），最少需要：
- 2 周（1 前端 + 1 后端）
- zod + zod-to-json-schema
- 一个 LLM 客户端（openai / anthropic sdk）
- 自己的 Runtime / Renderer 实现
- 一个 Result Manifest schema

**自实现的隐藏成本**：
- 跨会话状态管理
- 流式输出
- HITL UI
- 错误降级
- 审计
- 限速

**加起来约 4-6 周**。这就是为什么 90% 的项目应该用框架。

## 推荐组合（按团队规模）

### 小团队 / MVP（2 周出 demo）
```
前端: CopilotKit (React)
后端: LangGraph (Python) + ag-ui-langgraph
LLM: GPT-4o / Claude Sonnet
```

### 中团队 / 已有前端
```
前端: 自实现 Renderer + CopilotKit 部分组件
后端: 自实现 Action Runtime（参考 04/06）
LLM: 多 provider 切换
```

### 大团队 / 平台化
```
前端: 自实现统一 Renderer
后端: 自实现 Action Registry + Runtime + 审计
协议: 暴露 AG-UI + MCP + A2UI 多协议
LLM: 抽象 provider 层，可热切换
```

### 跨平台
```
协议: A2UI v0.9
前端: 每平台一个 A2UI 客户端
后端: 自实现 + AG-UI 兼容
```

## 工具链配套

无论用哪个框架，都建议：

| 工具 | 用途 |
|------|------|
| `zod` | schema 校验 + 类型推导（**必装**） |
| `zod-to-json-schema` | Zod → JSON Schema（给 LLM 用） |
| `dompurify` | 防 XSS（**必装**） |
| `pino` / `winston` | 结构化日志（审计） |
| `redis` | 幂等 + 限速 |
| `langfuse` / `helicone` | LLM 观测 |
| `posthog` / `amplitude` | 用户行为（观察 LLM 用的好不好） |

## 监控 / 观测

LLM 应用的"业务指标"和传统应用不同，**必须额外监控**：

- **工具调用成功率**——LLM 多久调对一次 action
- **HITL 拒绝率**——用户多久拒绝一次
- **平均对话轮次**——多少轮能完成用户意图
- **token 消耗**——每用户 / 每 action
- **schema 校验失败率**——LLM 幻觉频次
- **dryRun / commit 比**——多少 action 真被执行

```ts
// 例如用 langfuse
import { Langfuse } from 'langfuse'

const langfuse = new Langfuse()

function traceAction(name, args, ctx) {
  return langfuse.trace({
    name: `action.${name}`,
    userId: ctx.user.id,
    metadata: { args, risk: ctx.risk },
  })
}
```

## 生态时间线

```
2024 H1: LangChain function calling 成熟
2024 H2: OpenAI / Anthropic 工具调用稳定
2025 H1: CopilotKit AG-UI 0.x → 1.0
2025 H2: MCP 成为事实标准（Anthropic）
2026 H1: AG-UI 1.0、MCP Apps 1.0、A2UI 0.9 三协议齐发
2026 H2（预测）: 三协议开始融合 / 互操作
2027 (预测): 大部分新项目默认带 AI，原生应用范式完成
```

## 下一步

- 想把本项目 webassist 改造过来 → [09-webassist-integration.md](./09-webassist-integration.md)
- 想看完整 Action Manifest 规范 → [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)

---

### 参考

- CopilotKit 官方文档 (2026)
- LangGraph 官方文档
- mcp-ui 规范
- Mozilla AAF GitHub
- A2UI v0.9 Spec
- Vercel AI SDK 文档
