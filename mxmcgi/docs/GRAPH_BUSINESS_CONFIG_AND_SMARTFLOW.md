# Graph 业务配置与 Smartflow 节点契约

> **FormSchema 与 unifiedTemplate 写法细则**（字段约定、参考图槽位、`${prompt}` 校验等）见同目录 **[GRAPH_SCHEMA_AND_PROMPT_REFERENCE.md](./GRAPH_SCHEMA_AND_PROMPT_REFERENCE.md)**。

本文总结 **提示词工程（Admin）** 里 Graph 子业务的配置结构，以及后端如何把 **`formSchema`、`unifiedTemplate`**（及可选 **text/format**）与请求参数拼进生图链路，便于后续 **Smartflow 模型/参数节点** 与任务参数对齐。

---

## 1. 数据落点

| 存储 | 作用 |
|------|------|
| `prompt_engineering_config` | `scope` + `type` + `subtype`。正文以 **`extra.taskTemplate`**（`unifiedTemplate`、`formSchema` 等）与可选 **`output_format_i18n`** 为主；`rules_i18n` 列在库中恒为 `{}`，产品侧不再使用。 |
| `graph_scope_config` | 该子类型绑定的生图模型、provider、计费等（与表单无关）。 |

`extra` 常用字段：

- **`promptTextTaskKey`**：走 text/format 拼装最终 prompt 时使用的任务 key（如 `text/format/gpt-image-2`）。
- **`taskTemplate`**：与写作任务类似的 **任务模板**，内含 `formSchema`、`uiSchema`、`prompt.unifiedTemplate` 等。

示例源文件：`mxmcgi/src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json`  
同步 DB：`pnpm run seed:graph-taobaonvzhuang-2`（在 `mxmcgi` 目录，需可用 Supabase 环境变量）。

---

## 2. `output_format_i18n`（可选）

对模型输出结构/格式的说明（若该子类型走 text/format，可能进入 format 侧或拼接上下文）。**固定规则与长说明**请写入 **`prompt.unifiedTemplate` 静态段落** 或 **`promptTextTaskKey`** 对应的 text/format。全 scope 已弃用 `rules_i18n` 列正文。

---

## 3. `taskTemplate.formSchema`（JSON Schema）

用于：

1. **校验**：任务入口 `validateWithJsonSchema(template.formSchema, req.params)`（见 `task-engine.ts`）。
2. **默认值**：`applyFormSchemaDefaults` 在归一化参数后补齐缺省（见 `graph-reference-slots.ts`、`task-engine.ts`）。
3. **Admin 表单生成**：前端 `SchemaForm` / 业务配置页根据 `type`、`enum`、`x-ui-type` 等渲染。

### 3.1 常用 `type` 与 UI 约定

**子业务标识**：路由上已有 **`taskKey` + `subtype`**；`formSchema` 勿再包含 **`subtype`** 字段（与路由重复，加载时会剥离，见 `task-definition.ts`）。若确需在 `unifiedTemplate` 中向模型注入子业务 id，可选用 **`${subtype}`**（由 `task-engine` 的 `contextVars` 注入，且已在模板变量白名单）；**面向终端用户的「一、…」清单不必写 `${subtype}` / 管线 `${type}`**。**`params.type`**（如 design 的 `poster`）与 **subtype** 不同：design 下缺省不会用 `subtype` 回填 `type`，由 **`formSchema` 的 `default`** 等补齐（见 `mxmcgi/src/tasks/task-engine.ts`）。

| Schema `type` | 说明 | 前端 / `x-ui-type` |
|---------------|------|----------------------|
| `string` | 普通文本或枚举 | `enum` → 下拉；可配 `x-ui-type: selection` |
| `number` / `integer` | 数值 | 数字输入 |
| **`boolean`** | 布尔 | **`x-ui-type: switch`**（管理端与 `SchemaForm` 均按开关渲染）；也可仅 `type: boolean` |
| `array` | 列表；参考图槽位多为 `items` 内 `content`（URL/base64）+ `type` / `purpose` / `groupKey` 等 | 参考图编辑器 |
| `object` | 嵌套结构 | 按 properties 展开 |

扩展字段（与宫格等业务相关）：

- **`x-ui-type: selection`** + **`enum`** + **`x-enum-labels`**：单选展示中文标签。
- **`output_grid`（string enum，可选）**：`1x1` 为单图；`2x2` / `3x3` / `4x4` 时服务端走 **Grid Prompt Plan**（一次生图、contact sheet），完成后 **裁格** 供选片（不逐格独立生图、不父子切图任务）。
- **`x-grid-pose-scripts`（formSchema 根级，可选）**：按 `output_grid` 提供每格英文 directive 池；平台有内置默认，业务可覆盖。
- **`grid_cell_constraint_preset` / `x-enum-prompt-append`（可选）**：plan 阶段按用户所选 preset 将英文 seam 条款拼入 contact sheet（替换 `${grid_n}` / `${total_cells}`）。
- **宫格服务端流程（`MXMCGI_GRID_QA_ENABLED` 默认开）**：FUC 冻结 → 格位脚本 + 文案门禁（n-gram，失败不生图）→ `text/format` 一次（`TEXT_FORMAT_STRUCTURE_LOCK` 保留 Panel 行）→ **1 次生图** → `splitGridLayoutImage` + 像素 dHash QA（默认 `warning` 不二次生图）。
- **环境变量**：`MXMCGI_GRID_PLANNER_ENABLED`、`MXMCGI_GRID_EMBEDDING_QA_ENABLED`（可选）；`MXMCGI_GRID_PIXEL_QA_BLOCK_DELIVERY=true` 时像素冲突可阻断交付。

### 3.2 模板变量与 `prompt.unifiedTemplate`

- **`prompt.unifiedTemplate`**：单段模板，占位符 **`${fieldName}`**（及可选 Mustache `{{fieldName}}`）。
- 合并前会校验：**模板中出现的变量必须出现在 `formSchema.properties`**（见 `prompt-template.ts` 内 `assertUnifiedTemplateVarsDeclared`）。
- 插值时通过 **`formatTemplateValue(key, value)`** 把原始参数转成**适合写进文本**的字符串，例如：
  - 参考图数组：**不注入 URL/base64**，只输出 **分组/类型/用途摘要**（避免泄漏与超长）。
  - **`boolean`**：**`是` / `否`**（中文），便于中文 unified 模板阅读。
  - 部分枚举字段（如 `scenes`、`clothing_material`、`output_grid` 等）在 `formatTemplateValue` 中有专用映射；`grid_cell_constraint_preset` 若出现在 unified 模板中也会被格式化为可读文本，但**不会**再在服务端拼进最终英文生图 prompt。

Smartflow 向 API 传参时：字段名与 **formSchema.properties 的 key** 一致即可；**布尔**用 JSON `true`/`false`。

#### 3.2.1 占位符格式兼容与防御

Admin 富文本编辑器 `PromptTempDesigner`（`@mxmweb/rtext`）在编辑模板时内部使用 HTML `<template>` 标签表示变量占位符，保存时通过 `parseTemplateMarkup()` 转为纯文本 `${var}` 写入 `unifiedTemplate`。

**已知双格式**：

| 来源 | HTML 格式 | 示例 |
|------|-----------|------|
| `buildMarkupFromTemplate` | `<template name="var" ...>var</template>` | `<template name="prompt" type="string">prompt</template>` |
| `PromptTempDesigner` 编辑器 | `<template key="..." placeholder="var"></template>` | `<template key="template-xxx" placeholder="prompt"></template>` |

**防御链**（确保 `<template>` 标签不会泄漏到运行时）：

1. **Admin 前端**：`parseTemplateMarkup()` 同时识别 `attrs.name` 和 `attrs.placeholder`，将两种格式统一转为 `${var}`。
2. **后端运行时**：`renderPromptFromTemplate()` 在插值前调用 `sanitizeTemplateTagPlaceholders()`，将残留的 `<template placeholder="var">` 自动转为 `${var}`。

**注意**：若 `<template>` 标签泄漏到 `unifiedTemplate`，后端的 `collectTemplateVars()` 无法识别该变量，导致 prompt 安全检查（`uniVars.includes('prompt')` 分支）被跳过，用户输入完全不注入模板——最终模型收到空白 briefing 并编造无关内容。

---

## 4. `uiSchema`

与 RJSF 习惯一致，用于覆盖控件形态（如 `textarea` 行数）。不参与后端校验逻辑，仅影响 Admin / 部分前端表单。

---

## 5. 请求参数流水线（与 Graph 相关）

1. **`mergeGraphReferenceImageFromFormSlots`**：按 `formSchema` 把表单里的参考图槽位合并到 `referenceImage` 等（`graph-reference-slots.ts`）。
2. **`applyFormSchemaDefaults`**：按 schema `default` 填齐缺省字段。
3. **生图主路径**：`generateGraphPrompt` 以 **`unifiedTemplate` 插值后的 briefing** 为主；若 DB 中仍存在非空的旧式 rules 字段，实现上可能追加段落（兼容历史数据，**新配置不应依赖**）。**`GRAPH_BUSINESS_PARAM_DENY`** 中的 key（如 `referenceImage`、`model_images`、`clothing_images`、`environment_images` 等）**不会进入「业务参数字符串」**，避免把大图写进 text/format；图像像素仍走生图侧 `image_input`。
4. 若配置了 **text/format** 与 **`promptTextTaskKey`**，最终 prompt 还可能经过 format 任务；以 **`unifiedTemplate` + format 模板** 为单一事实来源即可（脚本 `run-graph-photograph-taobaonvzhuang-2-clean-log.ts` 可用于对照日志）。

---

## 6. Smartflow 节点设计要点

1. **参数 JSON = 通过 `formSchema` 校验的对象**：节点输出应能被 `POST .../graph`（或当前网关路径）直接当作 `params` 使用（含 `type` / `subtype` 等业务约定字段，以现有路由为准）。
2. **不要**在 flow 里重复传 denied 的大图字段到「文本 prompt」侧；应使用与各槽位 schema 一致的结构传参考图。
3. **新增表单项**：同时更新 **formSchema.properties**、**unifiedTemplate 占位符**（若要在 unified 里展示），并执行 **seed** 或 Admin 保存，避免「模板引用未声明变量」校验失败。
4. **`boolean`**：schema `type: boolean`，建议 **`x-ui-type: switch`**；模板侧显示为「是/否」，API 仍为布尔。

---

## 7. 工具 · 高清放大（`graph` / `taskKey=tools` / `subtype=hd`）

- **用途**：用户上传单图或宫格联系表（最大 4×4）；宫格时表单须选 **宫格规格** `grid_layout`（2x2 / 3x3 / 4x4）与 **格位** `grid_cell`（通常来自上游 `output_grid`）；服务端 **不** 调 LLM 识格；裁格后图生 4K 放大，不走 `text/format`。
- **表单**：`pnpm run seed:graph-tools-hd`（或 Admin 导入 `graph-tools-hd.business.json`）后，平台会出现「宫格规格」下拉；未传 `grid_layout` 时 Worker 暂回退 `3x3` 并打日志（请尽快更新 DB schema）。
- **模型**：`deer` + `nano-banana-2`（`image` 参考 + 强约束英文 prompt，尽量不改背景/主体/姿势）。
- **画幅**：`aspect_ratio` 可选；不选则按裁切后单格比例推断并传给模型。
- **物理模型**：`provider_models` 中已启用的 `deer` + `nano-banana-2`（`upstream_model` 如 `gemini-3.1-flash-image-preview`）。
- **业务 bundle**：`pnpm run seed:graph-tools-hd`（`mxmcgi` 目录）。
- **实现**：`graph-tools-hd.ts`；`graph-task.ts` 识别 `tools`+`hd` 后走专用链路。

Task V2 示例：

```json
{
  "scope": "graph",
  "taskKey": "tools",
  "subtype": "hd",
  "params": {
    "source_images": [{ "content": "<url或base64>", "type": "main-subject" }],
    "is_grid": true,
    "grid_layout": "3x3",
    "grid_cell": "2-1",
    "aspect_ratio": ""
  }
}
```

---

## 8. 相关源码索引

| 主题 | 文件 |
|------|------|
| 模板校验与插值（含 `sanitizeTemplateTagPlaceholders` 防御） | `mxmcgi/src/tasks/prompt-template.ts` |
| 参考图合并 / 默认值 | `mxmcgi/src/tasks/graph-reference-slots.ts` |
| 任务校验与调用顺序 | `mxmcgi/src/tasks/task-engine.ts` |
| 业务参数抽取与 deny 列表 | `mxmcgi/src/core/graph/graph-service.ts` |
| 宫格 Grid Plan / QA | `mxmcgi/src/core/graph/grid/*`、`graph-service.ts`、`graph-task.ts` |
| 宫格 prompt | unified 中文 briefing + Grid contact sheet + `promptTextTaskKey`（text/format）一次 |
| Admin 前端模板解析（含 `placeholder` 兼容） | `web/src/pages/AdminBusiness.utils.ts` (`parseTemplateMarkup`) |
| 示例配置 + seed | `mxmcgi/src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json`、`mxmcgi/src/scripts/seed-graph-taobaonvzhuang-2.ts` |
| 高清放大 tools/hd | `mxmcgi/src/tasks/examples/graph-tools-hd.business.json`、`mxmcgi/src/core/graph/tools/graph-tools-hd.ts` |

---

文档版本：与仓库内实现同步维护；若行为变更，请优先以源码为准并更新本节表格与路径。
