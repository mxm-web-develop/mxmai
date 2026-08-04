# llm-frontend

> 面向 LLM 时代的前端架构文档集 —— 如何让你的 React / Vue 应用"被 AI 安全操控"。

## 这是什么

这一组文档讲的是一件具体的事：**当你把路由、操作、状态契约用结构化方式集中声明，LLM 就能"读懂"你的应用并按规则执行**。这件事在 2026 年有了正式名字 —— **Generative UI / Agentic UI**，对应协议是 AG-UI、MCP Apps、A2UI，学术化叫法是 UIR-X。

它不是"用 AI 生成 UI 代码"，而是**让 LLM 当编排者，让你的设计系统当渲染器**：

```
用户说："把刚才那条 run 删掉"
        ↓
LLM 读到 application manifest → 决定调 runs.delete
        ↓
校验输入 → 检查权限 → 准备预览 → 用户确认 → 真正执行
        ↓
manifest 化的执行结果 → 你的设计系统组件渲染
```

你写的页面、组件、token 体系**完全不变**；变的是"AI 怎么知道有哪些能力 + 怎么安全调用 + 怎么展示结果"。

## 适用对象

| 角色 | 为什么读 |
|------|----------|
| **前端架构师** | 想做"AI 友好"的中后台 / SaaS，但不知道怎么从 0 起手 |
| **React / Vue 开发者** | 想给现有项目加 copilot / 智能助手能力 |
| **全栈 / 后端** | 想知道"暴露给 LLM 的 API 契约应该长什么样" |
| **技术负责人** | 想评估"我们能不能上 Agentic UI"——投入多少、回报多少、风险在哪 |
| **AI Agent 工程师** | 想知道"前端怎么配合我做 Generative UI" |

## 不适用

- **从 0 写 ChatGPT 替代品**——那是模型层的事
- **纯展示型营销站**——没有"操作"就没有"manifest"
- **Landing page 改写**——那是 marketing AI 的事
- **任何"靠 prompt 写出漂亮界面"的需求**——这条路你走的是另一条

## 文档地图

按推荐阅读顺序：

| # | 文档 | 解决什么问题 | 时长 |
|---|------|--------------|------|
| 01 | [concepts](./01-concepts.md) | Generative UI / Agentic UI / LLM-as-orchestrator 三个概念的区别 | 15 min |
| 02 | [architecture](./02-architecture.md) | 6 层架构：route / action / data / state / render / runtime | 30 min |
| 03 | [protocols](./03-protocols.md) | AG-UI / MCP Apps / A2UI 三大协议横向对比 | 20 min |
| 04 | [action-manifest](./04-action-manifest.md) | Action Manifest 是什么、字段怎么设计、zod 怎么用 | 30 min |
| 05 | [react-vue-impl](./05-react-vue-impl.md) | React + Vue 两套最小实现 + 选型 | 45 min |
| 06 | [security-policy](./06-security-policy.md) | 风险分级 / 权限 / 人工确认 / 审计 | 25 min |
| 07 | [rendering-system](./07-rendering-system.md) | manifest → 设计系统组件的渲染器 | 25 min |
| 08 | [tooling-ecosystem](./08-tooling-ecosystem.md) | 现成框架：CopilotKit / AAF / LangGraph / mcp-ui | 20 min |
| 09 | [webassist-integration](./09-webassist-integration.md) | 本项目 `webassist` 的集成方案与改造步骤 | 20 min |
| SPEC | [action-manifest-v1](./SPEC-action-manifest-v1.md) | 完整 Action Manifest v1 规范（含 JSON Schema + Zod Schema） | 参考 |

## 关键认知

读之前需要建立的几个**反直觉**的判断：

1. **"路由集中"只是骨架**——光有这个 LLM 也能调，但会闯祸。需要至少 6 层（见 [02](./02-architecture.md)）。
2. **LLM 不写代码、不写 HTML**——它输出 JSON manifest，前端按 manifest 选组件（[07](./07-rendering-system.md)）。
3. **写动作必须 prepare + 确认 + commit 三段式**——这是当前所有生产级 agent 系统的共识（[06](./06-security-policy.md)）。
4. **`.well-known/ai-manifest.json` 是契约入口**——你的应用对外声明"我能做什么"的唯一标准位置。
5. **设计系统是 source of truth**——LLM 是设计系统的"消费者"，不能改你的 token、组件、可访问性约束。

## 30 秒架构图

```
┌─────────────────────────────────────────────────────────────┐
│  用户："把这条 run 删了"                                       │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  LLM（带 application manifest 作为 system prompt）            │
│  → 决定调用 action: runs.delete                              │
│  → 输出 { runId: "abc-123" }                                 │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  Runtime Guard (校验 / 授权 / 风险评估)                       │
│  → Zod 校验 input                                            │
│  → 查 permission: runs.delete                                │
│  → risk: high → 准备 proposal                                 │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  用户确认（HITL）                                            │
│  → "确认删除 run abc-123？" [确认] [取消]                     │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  Action 真正执行 → 输出结构化 result（manifest）              │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  渲染器：用你的设计系统组件把 result 渲染出来                  │
│  → <Alert variant="success">已删除</Alert>                   │
│  → <DataTable rows={...} />                                  │
│  → <DiffView before={...} after={...} />                     │
└─────────────────────────────────────────────────────────────┘
```

## 立项动机

为什么 2026 年这个事变得重要了？三件事同时发生：

1. **模型能力到位**——GPT-5 / Claude 4.5 / Gemini 2.5 Pro 在结构化输出、工具调用、复杂 plan 编排上已经稳定可生产。
2. **协议收敛**——AG-UI / MCP / A2UI 在 2026 上半年全部 1.0，意味着跨厂商可移植。
3. **生态成熟**——CopilotKit、LangGraph、mcp-ui、AAF 等开源实现把"5 个月开发量"压到"2 周集成"。

如果你今天还在用"prompt + function calling + 自由文本回复"的方式做 AI 产品——**竞争对手 1 年后会用这份架构做 10x 体验**。这是从"加个 AI 功能"到"AI 原生应用"的代际差异。

## 本项目的特殊性

`webassist` 本身已经在做这件事的子集（`架构.md` 里的 `intention → plan → act` Loop + 多种 act 类型）。文档集 [09-webassist-integration](./09-webassist-integration.md) 会基于现有架构给改造方案，**不推倒重做**。

## 怎么开始

按你团队的资源三选一：

| 团队 | 起步 |
|------|------|
| **小团队 / 试水** | 直接用 [CopilotKit](https://docs.copilotkit.ai/) + [LangGraph](https://langchain-ai.github.io/langgraph/)，1 个前端 + 1 个后端，2 周出 demo |
| **中团队 / 已有前端** | 按 [05-react-vue-impl](./05-react-vue-impl.md) 最小实现自己搭；用 [08-tooling-ecosystem](./08-tooling-ecosystem.md) 选框架 |
| **大团队 / 要做规范** | 直接用 [SPEC-action-manifest-v1](./SPEC-action-manifest-v1.md) 做团队标准 |

## 维护

- 文档版本：`v0.1.0` (2026-07)
- 协议参考：AG-UI (CopilotKit 2026-07)、MCP Apps (Anthropic 2026-01)、A2UI v0.9 (Google 2026-04)
- 反馈：`webassist` 仓库 issue，或团队内部 wiki

## License

本文档集以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布，欢迎引用、翻译、修改。
