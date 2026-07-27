# Smartflow 复合节点

复合节点负责 **多步 Agent 编排**（Plan / Reflection / ReAct / Research），与 `business` 业务节点正交：

- **business**：单次 Task V2 能力（生图、写作等）
- **复合节点**：内部多轮调用 text / tools / model，对外输出统一信封

## 节点类型

| type | 说明 | `output.result` |
|------|------|-----------------|
| `plan_execute` | Plan-and-Execute | 多步执行摘要 |
| `reflection` | 反思环 | 终稿文本 |
| `react` | ReAct 工具环 | Final Answer |
| `research` | 调研摘要 | Markdown 报告 |

## 统一输出

```json
{
  "pattern": "reflection",
  "result": "...",
  "text": "...",
  "completed": true,
  "stop_reason": "pass",
  "meta": { "passed": true, "rounds": 2 },
  "trace": [{ "step": 1, "phase": "critique", "summary": "..." }],
  "usage": { "input_tokens": 0, "llm_calls": 3, "tool_calls": 0 }
}
```

下游引用：`{{nodeId.output.result}}`、`{{nodeId.output.meta.passed}}`。

## 与 text 业务关系

- `text/plan/*`、`text/think/critique` 等仍由 Admin 配置
- 复合节点通过 `planner` / `critic` 等字段引用，不重复 prompt 体系

## 预置 Flow

- `composite-reflection-draft`
- `composite-plan-execute`
- `composite-research-summary`

示例节点组合见 `mxmcgi/src/smartflow/core/predefined-flows.ts`（**仅参考，不自动写入 DB**）。上架请用 bundle 导入。

## 前端

- 左侧节点库 + 顶部工具栏 + 画布右键右侧快速添加
- 属性面板按节点类型编辑 goal / max_rounds 等

参见 [agent-patterns-react-plan-reflection.md](../../agent-patterns-react-plan-reflection.md)。
