---
name: mxmai-smartflow-bundle
description: 在 SuperMXMai 中设计、编写并导入 Smartflow 工作流（mxm-smartflow-bundle JSON）。适用于新建/更新预置流程、电商批量流、Agent+业务编排；与 mxm-business-bundle 配合（先上架业务，再引用 business 节点）。
---

# Smartflow 工作流：Bundle 设计与导入（mxmai）

> **业务依赖**：流程中的 **business 节点**须先在 Admin 用 `mxm-business-bundle` 上架对应 `scope/taskKey/subtype`。  
> **典例**：`eshop-clothes-batch-v2.smartflow.json`（推荐，input[] 业务类型化）；v1 仅兼容  
> **文档**：`docs/mxmcgi/smartflow/ESHOP_CLOTHES_BATCH.md`

---

## 1. 交付物：`mxm-smartflow-bundle` JSON

```json
{
  "schemaVersion": 1,
  "kind": "mxm-smartflow-bundle",
  "exportedAt": "2026-05-24T12:00:00.000Z",
  "items": [
    {
      "id": "my-flow-v1",
      "name": "我的工作流",
      "description": "可选",
      "category": "graph",
      "tags": ["demo"],
      "status": "active",
      "version": "1.0.0",
      "is_public": false,
      "schema": {
        "version": "1.0.0",
        "nodes": [],
        "edges": []
      }
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `schemaVersion` | 是 | 固定 `1` |
| `kind` | 是 | 固定 `mxm-smartflow-bundle` |
| `items[].id` | 是 | 工作流唯一 ID（DB 主键） |
| `items[].name` | 是 | 显示名称 |
| `items[].schema` | 是 | `nodes` + `edges`；可选 `version` / `settings` |

---

## 2. 节点类型与产品规范（必遵）

### 2.1 允许的 `type`

`start` | `end` | `business` | `tools` | `condition` | `variable` | `loop` | `plan_execute` | `reflection` | `react` | `research`

**禁止**在新建 bundle 中使用裸 **`model`** 节点。LLM 能力须：

- **business 节点** → 引用已上架的 **text**（或其它 scope）细分业务；或  
- **Agent 模式** → `plan_execute` / `reflection` / `react` / `research`

### 2.2 business 节点（必须三级齐全）

```json
{
  "id": "run_eshop",
  "type": "business",
  "name": "eshop/clothes",
  "business_scope": "graph",
  "taskKey": "eshop",
  "subtype": "clothes",
  "params": {
    "model_images": "{{variables.task.model_images}}"
  }
}
```

| 字段 | 说明 |
|------|------|
| `business_scope` | 业务大类：writing / text / graph / audio / video 等 |
| `taskKey` | 业务标识，与 Admin 一致 |
| `subtype` | **必填**，细分业务 |
| `params` | 支持 `{{input.xxx}}`、`{{nodeId.xxx}}`、`{{variables.loopVar.xxx}}` |

### 2.3 start 节点与 formSchema

- 推荐在 start 上挂 **`formSchema` + `uiSchema`**（与 Task V2 同构），运行页与 Open API 文档自动对齐。  
- 电商批量 formSchema 内联在 bundle JSON 的 start 节点；**运行时以 DB 为准**。  
- legacy 仍可用 `input[]`，但新流程优先 formSchema。

### 2.4 画布坐标（可选）

节点可带 **`position: { "x": 120, "y": 80 }`**，导入后设计器 `schemaToFlowNodesEdges` 会还原布局。

### 2.5 loop 循环体

- `loop_nodes`: 循环体内节点 id 数组（**不**写入 `edges` 的 loop-body 虚线）。  
- 循环体出口：从 loop 节点右侧 `loop-body` handle 连到 business 节点（设计器维护 `loop_nodes`）。

---

## 3. edges 约定

仅 **主流程** 写入 `edges`（`from` / `to` 为节点 id）：

```json
"edges": [
  { "from": "start", "to": "assemble_tasks" },
  { "from": "assemble_tasks", "to": "loop_batch" },
  { "from": "loop_batch", "to": "end" }
]
```

---

## 4. 导入 / 导出方式

| 方式 | 说明 |
|------|------|
| **Smartflow 页** | 选中工作流 →「导出 bundle」；「导入 bundle」→ dry-run 预览 → upsert / skip |
| **HTTP** | `GET /api/v1/smartflows/bundle?id=` · `POST /api/v1/smartflows/bundle/export` · `POST /api/v1/smartflows/bundle/import` |
| **CLI** | `cd mxmcgi && pnpm run apply:smartflow-bundle -- path/to/x.smartflow.json [--dry-run]` |
| **Seed（电商批量）** | `pnpm run seed:eshop-smartflow-batch`（默认 `eshop-clothes-batch-v2.smartflow.json`） |

`conflictPolicy`：`upsert`（覆盖）| `skip`（跳过已存在 id）| `dry-run`（仅预览）

---

## 5. Agent 设计 Smartflow 时的推荐步骤

1. **理清业务依赖**：列出所有 business 节点的 `scope/taskKey/subtype`，确认 Admin 已 `apply:bundle`。  
2. **编写 `items[0].schema`**：start → 变量/条件/loop → business → end。  
3. **校验**：bundle 导入会校验 start/end、business subtype、禁止 model。  
4. **落库**：`apply:smartflow-bundle` 或 Smartflow 页导入。  
5. **验收**：运行 Tab 提交 `input_data`；检查 loop 批量与 `on_iteration_error`。

---

## 6. 验收清单

- [ ] `kind` / `schemaVersion` 正确  
- [ ] 无裸 `model` 节点  
- [ ] 每个 `business` 含 `business_scope` + `taskKey` + `subtype`  
- [ ] 有 `start` + `end`，edges 连通  
- [ ] 引用的业务已在 DB 上架  
- [ ] dry-run 通过后再 upsert  
- [ ] 运行页 formSchema（若有）字段可填、执行成功  

---

## 7. 相关路径

| 用途 | 路径 |
|------|------|
| Bundle 类型 | `mxmcgi/src/smartflow/core/smartflow-bundle-types.ts` |
| 导入逻辑 | `mxmcgi/src/smartflow/core/smartflow-bundle-import-apply.ts` |
| Schema 校验 | `mxmcgi/src/smartflow/core/smartflow-schema-validator.ts` |
| API 路由 | `mxmcgi/src/smartflow/routes/smartflow.ts` |
| 示例 JSON | `mxmcgi/src/smartflow/examples/*.smartflow.json` |
| 业务 bundle skill | `.cursor/skills/mxmai_graph_business_bundle/SKILL.md` |
