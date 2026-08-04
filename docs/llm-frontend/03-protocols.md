# 03 · 三大协议横向对比

> 2026 年上半年，三大协议同时 1.0：AG-UI（CopilotKit）、MCP Apps（Anthropic）、A2UI（Google）。它们解决不同问题，但经常被混用。本篇拆清楚。

## 一图流

```
                       LLM 决策层
                          │
            ┌─────────────┼─────────────┐
            ↓             ↓             ↓
         A2UI          MCP Apps      AG-UI
       (UI 描述       (工具/能力      (用户/前端
        schema)        发现)         交互流)
            │             │             │
            ↓             ↓             ↓
       任何客户端     任何客户端    任何前端
       渲染相同 UI    调用相同能力   与 agent 双向
       描述           描述          同步状态
```

**它们不竞争，分工不同**：
- **A2UI** = "UI 长什么样"的 schema
- **MCP Apps** = "agent 能调什么工具 / 看到什么 UI"
- **AG-UI** = "前端怎么和 agent 实时对话 / 共享状态"

## 三大协议速查

| 维度 | AG-UI | MCP Apps | A2UI v0.9 |
|------|-------|----------|-----------|
| **提出方** | CopilotKit (开源) | Anthropic (官方) | Google (官方) |
| **首次稳定** | 2026-04 | 2026-01 | 2026-04 |
| **关注点** | 前端 ↔ agent 的交互 | 工具/能力发现 | UI 描述的便携性 |
| **传输** | SSE (Server-Sent Events) | JSON-RPC over stdio/HTTP | JSON over HTTP |
| **方向** | 双向（事件流） | 单向（请求-响应） | 单向（描述 → 渲染） |
| **主要语言** | TypeScript | TypeScript / Python | 协议中立 |
| **状态同步** | 强（STATE_SNAPSHOT 事件） | 弱（靠 tool 结果） | 无（纯描述） |
| **HITL 支持** | 内置（renderAndWaitForResponse） | 需应用层实现 | 需应用层实现 |
| **Generative UI** | 一等公民 | 一等公民 | 唯一目标 |
| **客户端实现** | React/Angular SDK | mcp-ui / 自实现 | 任何实现 schema 的客户端 |
| **生产案例** | AWS Bedrock AgentCore、LangGraph | Claude 全家桶 | Google AI Studio / Vertex |

## AG-UI（Agent-User Interaction Protocol）

### 一句话
**前端和 agent 实时对话的事件流协议**。CopilotKit 主导，已成事实标准。

### 核心事件类型
```ts
// 生命周期
RUN_STARTED, RUN_FINISHED, RUN_ERROR
STEP_STARTED, STEP_FINISHED

// 文本流
TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END

// 工具调用
TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT

// 状态
STATE_SNAPSHOT, STATE_DELTA, MESSAGES_SNAPSHOT

// HITL
RENDER_AND_WAIT_FOR_RESPONSE  // 等用户回填
```

### 典型交互流
```
User: "把今天的低分反馈整理成报告"
  ↓
Server (SSE):
  RUN_STARTED { runId: "abc" }
  STEP_STARTED { stepName: "observe" }
  TOOL_CALL_START { name: "feedback.list", args: { rating: "<4" } }
  TOOL_CALL_RESULT { items: [...] }
  STEP_FINISHED
  STEP_STARTED { stepName: "prepare-report" }
  TOOL_CALL_START { name: "report.generate", args: {...} }
  TOOL_CALL_RESULT { preview: "..." }
  RENDER_AND_WAIT_FOR_RESPONSE { prompt: "确认生成报告？" }
  // 客户端弹出确认框 → 用户点确认
  // 客户端发回 USER_RESPONSE
  STEP_FINISHED
  RUN_FINISHED { result: { reportUrl: "..." } }
```

### 前端代码（React）
```tsx
import { useCoAgent, useCopilotKitAction } from '@copilotkit/react-core'

function FeedbackPage() {
  const { state, setState } = useCoAgent({
    name: "feedback_agent",
    initialState: { items: [], preview: null }
  })

  // 注册一个 HITL 工具：让 agent 等用户回填
  useCopilotKitAction({
    name: "requestUserConfirm",
    description: "关键操作前让用户确认",
    parameters: [{ name: "prompt", type: "string" }],
    renderAndWaitForResponse: ({ prompt, respond }) => (
      <ConfirmDialog
        title="确认操作"
        body={prompt}
        onConfirm={() => respond({ confirmed: true })}
        onCancel={() => respond({ confirmed: false })}
      />
    ),
  })

  return (
    <div>
      <DataTable rows={state.items} />
      {state.preview && <ReportPreview data={state.preview} />}
    </div>
  )
}
```

### 优点
- **双向状态同步**——`useCoAgent` hook 让 UI 和 agent 看同一个 state
- **流式输出**——SSE 让 LLM 打字一样输出
- **HITL 一等公民**——`renderAndWaitForResponse` 让前端接管确认 UI
- **生态广**——LangGraph / Pydantic AI / Mastra / Bedrock AgentCore 都接

### 缺点
- **CopilotKit 主导**——其他厂商虽有实现但生态明显落后
- **前端框架绑定**——官方 SDK 主要在 React/Angular
- **学习曲线**——事件类型多，前端要处理一堆 case

## MCP Apps（Model Context Protocol - Apps）

### 一句话
**Anthropic 给"agent 工具 + UI"做的协议**。MCP 是底层（工具发现），MCP Apps 是上层（带 UI 的工具）。

### 核心概念
```jsonc
// server 端声明
{
  "name": "github",
  "tools": [
    {
      "name": "create_issue",
      "description": "Create a GitHub issue",
      "inputSchema": { ... },
      "_meta": {
        "ui": {
          "resourceUri": "ui://github/issue-card",
          "renders": [{ "type": "card", "minWidth": 320 }]
        }
      }
    }
  ],
  "resources": [
    {
      "uri": "ui://github/issue-card",
      "name": "Issue Card",
      "mimeType": "application/vnd.mcp-ui+json",
      "text": "{\"type\":\"card\",\"props\":{...}}"
    }
  ]
}
```

### 关键差异
- **工具 = 能力**——和 MCP 一样，agent 用 `tool_call` 调
- **UI = 资源**——工具的结果可以"挂"一个 UI 描述，让客户端渲染
- **离线性**——UI 描述可以**预存**在 server，agent 调工具时返回引用

### 典型用法
```python
# server.py
@mcp.tool(ui="ui://github/issue-card")
async def create_issue(title: str, body: str):
    issue = await github_api.create(title, body)
    return {
        "content": [{"type": "text", "text": f"Created issue #{issue.number}"}],
        "_meta": {"ui": {"resourceUri": "ui://github/issue-card"}}
    }

@mcp.resource("ui://github/issue-card")
async def issue_card():
    return {
        "mimeType": "application/vnd.mcp-ui+json",
        "text": json.dumps({
            "type": "card",
            "props": {"title": "Issue Created", "variant": "success"}
        })
    }
```

### 优点
- **官方背书**——Anthropic 主力推，Claude 全家桶内置
- **mcp-ui 协议中立**——UI 描述是 JSON，任何前端都能渲
- **资源可缓存**——UI 模板和业务数据分离

### 缺点
- **HITL 要应用层实现**——没有 AG-UI 的 renderAndWaitForResponse
- **状态同步弱**——靠 tool 结果往返，没有 STATE_SNAPSHOT
- **生态窄**——主要在 Claude 客户端

## A2UI v0.9（Agent-to-UI）

### 一句话
**Google 提的"UI 描述 schema"协议**。任何 LLM 输出符合 A2UI 的 JSON，**任何**实现 A2UI 渲染器的客户端都能显示。

### 核心思想
```
LLM 输出 A2UI JSON
        ↓
任何 A2UI 兼容客户端（Android、Web、iOS、Flutter、CLI）
        ↓
同样的 UI 体验
```

### Schema 片段
```jsonc
{
  "version": "0.9",
  "surface": "default",
  "components": [
    {
      "id": "title",
      "type": "Heading",
      "props": { "level": 1, "text": "Feedback Report" }
    },
    {
      "id": "summary",
      "type": "Card",
      "props": { "elevation": 1 },
      "children": ["total", "avg_rating"]
    },
    {
      "id": "total",
      "type": "Text",
      "props": { "variant": "body", "text": "Total: 47 items" }
    },
    {
      "id": "avg_rating",
      "type": "Text",
      "props": { "variant": "body", "text": "Avg: 2.3 / 5" }
    }
  ]
}
```

### 优点
- **跨平台**——一份描述，处处渲染
- **schema 严格**——A2UI 兼容客户端能保证设计语言一致
- **极简**——比 MCP Apps / AG-UI 都轻

### 缺点
- **不能携带交互**——纯展示，没有事件回调（要走另外的 RPC）
- **不能携带状态**——和 AG-UI 的 STATE_SNAPSHOT 比，弱很多
- **生态最窄**——主要在 Google AI Studio

## 选哪个？

| 你的需求 | 推荐 |
|----------|------|
| 已有 React / Angular 前端，要做完整 copilot | **AG-UI** |
| 已有 MCP server（Claude 工具），加 UI | **MCP Apps** |
| 想跨平台（iOS / Android / Web 一致 UI） | **A2UI** |
| 业务工具给多 LLM 用，UI 必须标准化 | **A2UI + MCP Apps** 组合 |
| LLM 多轮 plan + 复杂状态共享 | **AG-UI**（唯一选择） |
| 不想被任何协议锁定 | 自实现 + A2UI 风格的 schema |

## 它们可以组合

实际项目经常是**混合**：

```
LLM (Anthropic Claude)
  ↓ MCP 协议
  → 调 MCP server 的 tools (业务能力)
  → tools 返回的 UI 描述是 mcp-ui 格式
  ↓ AG-UI 协议
  → 前端用 CopilotKit 接住事件流
  → 状态通过 useCoAgent 同步
  → HITL 用 renderAndWaitForResponse
  → UI 模板可以是 A2UI 风格
```

**本项目 webassist** 的现状：
- 后端 `motor/plan.py` 是**自实现的 action registry**（没有走 MCP）
- 前端 popup 也没接 AG-UI
- 优势：**完全自主**，迁移到任何协议都不亏
- 劣势：**生态红利吃不到**

详见 [09-webassist-integration.md](./09-webassist-integration.md)。

## 选协议时的反问清单

选之前问自己 5 个问题：

1. **agent 在哪跑？** 自家后端 / 第三方 SaaS / 浏览器内
2. **前端用什么框架？** React / Vue / 原生 / 移动端
3. **要不要双向状态？** UI 是否需要"被 agent 操控"
4. **要不要 HITL？** 关键操作是否需要用户确认
5. **要不要跨平台？** Web 还是要 iOS / Android

**答完这 5 题，答案就出来了**：
- 1+2+3+4+5 全 yes → AG-UI（前端）+ MCP Apps（后端）+ A2UI（共享 schema）
- 1+3+4 yes，2 no → AG-UI
- 1+5 yes，其他 no → A2UI
- 只 1 yes → MCP 即可（不带 Apps）

## 迁移路径

如果你**已经有一个项目**想升级：

```
阶段 1: 内部 Action Manifest 化
  → 不引入任何协议，自实现 runtime
  → 收益：立刻能"声明能力"+ 防止 LLM 闯祸

阶段 2: 暴露 well-known 端点
  → GET /.well-known/ai-manifest.json
  → 让外部 agent 能发现你

阶段 3: 接 AG-UI（或 MCP Apps）
  → 选一个协议，让前端 / 外部客户端能复用

阶段 4: A2UI 化 UI 描述
  → 把 renderer 输出的 manifest 改成 A2UI 兼容
  → 跨平台客户端能直接用
```

## 下一步

- 想看 Action Manifest 怎么写 → [04-action-manifest.md](./04-action-manifest.md)
- 想直接搭最小实现 → [05-react-vue-impl.md](./05-react-vue-impl.md)

---

### 参考

- CopilotKit AG-UI Protocol Spec (2026-07)
- Anthropic MCP Apps Spec v1.0 (2026-01)
- Google A2UI v0.9 (2026-04)
- AWS Bedrock AgentCore + AG-UI Blog (2026-06)
