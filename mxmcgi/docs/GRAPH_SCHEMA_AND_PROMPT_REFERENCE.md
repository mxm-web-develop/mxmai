# Graph 业务：FormSchema 规范与 Prompt（unifiedTemplate）规范

本文是 **配置侧** 的硬性约定，与 `GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md`（数据落点与运行时链路）互补。实现以源码为准：`mxmcgi/src/tasks/prompt-template.ts`、`mxmcgi/src/tasks/graph-reference-slots.ts`、`mxmcgi/src/tasks/task-engine.ts`。

---

## 一、FormSchema 规范（`taskTemplate.formSchema`）

### 1.1 根对象

| 字段 | 要求 |
|------|------|
| `$schema` | 建议 `http://json-schema.org/draft-07/schema#` |
| `type` | 必须为 `"object"` |
| `properties` | 所有业务字段定义在此 |
| `required` | 必填字段列表；与产品契约一致，避免运行时再用隐式默认 |

### 1.2 字段命名

- 使用 **snake_case** 或与现有子业务一致的风格；与 `POST /api/v2/tasks/run` 的 `params` JSON 键 **完全一致**。
- **子业务路由**：Task V2 使用 `scope` + `taskKey` + `subtype`。表单内若需「管线类型」（如 design 的 `poster`），可用独立字段名 `type`（与 **subtype** 不同概念）。**面向终端用户的 `unifiedTemplate`「一、…」清单不必、也不建议列出 subtype / 管线 type**；子业务身份由请求 `subtype` 与 DB 配置承担。若确需向模型注入子业务 id，可选用 **`${subtype}`**（由 `contextVars` 注入，白名单、不要求在 schema 声明）。

### 1.2.1 细分定位与表单项数量（产品规范）

- **`subtype` 粒度**：应对应**可独立运营、单独维护 unifiedTemplate** 的细分场景；宁可增加 `subtype`，也不要单 subtype + 超大表单承载多种无关任务。
- **用户填表项数量**：统计 `formSchema.properties` 中用户**每次任务会动手填**的字段（每个 **`x-ui-type: "referenceImages"`** 槽位计 **1** 项；仅有 `default`、几乎不展示的管线字段如固定 `type: poster` 可不计入负担）：
  - **普通业务**：建议 **1～3 项**；
  - **复杂业务**：建议 **3～6 项**；超过 6 项应评审必要性，并优先通过**合并多行文案**、**合成枚举预设**、**通用说明写进 `unifiedTemplate` 静态段落**减项。
- **与历史配置的关系**：本条约束**新增或重做**子业务；仓库内既有 bundle 不强制回溯整改。

### 1.3 与 `unifiedTemplate` 的契约

- **`${fieldName}`** 与 **`{{fieldName}}`** 均支持（Mustache 可含空格：`{{ fieldName }}`）。
- 模板中出现的 **每一个** 变量名，必须在 **`formSchema.properties`** 中存在对应 key，或为下文 **白名单**（否则 `assertTemplateVarsAllowed` 抛错）。**面向用户的「一、…」清单只插业务字段**；不必写 `${subtype}`、管线 **`${type}`**。
- **白名单变量**（不必出现在 `properties`）：`userId`、`taskId`、`date`、`timestamp`、`uuid`、`subtype`、`parallel_index`、`parallel_total`、`parent_task_id`（见 `prompt-template.ts`）。业务模板**可选**引用 `${parallel_index}` / `${parallel_total}` 拉开多份差异，非强制。

### 1.3.1 平台字段 `parallel_count`（生成份数）

- 由 `mxmcgi/src/tasks/platform-fields.ts` 自动注入各异步 scope 的 `formSchema`（**`text` 不注入**），无需逐 bundle 维护。
- 用户填写 1～99；`> 1` 时创建 `task-v2-batch-parent` + N 子任务，组间差异由 `parallel-variation.ts`（枚举轮换 + `prompt` 追加变体句）分配。
- **勿**把 `parallel_count` / `parallel_index` / `parallel_total` 写入 graph text/format 业务参数字符串（`GRAPH_BUSINESS_PARAM_DENY` 已排除）。

### 1.4 常用 JSON Schema 类型

| `type` | 说明 | 前端约定 |
|--------|------|----------|
| `string` | 文本或枚举 | 可配 `enum`；下拉见下 |
| `number` / `integer` | 数值 | 数字输入 |
| `boolean` | 布尔 | 建议 `x-ui-type: "switch"` |
| `array` | 列表 | 参考图槽位见 1.6 |
| `object` | 嵌套 | 少用；优先扁平字段便于 Task V2 |

通用约束：`minLength` / `maxLength` / `minItems` / `maxItems` / `default` 按产品需要填写。

### 1.5 扩展：`x-ui-type` 与枚举展示

| `x-ui-type` | 适用 | 配套字段 |
|-------------|------|----------|
| `selection` | 单选下拉 | `enum` + 建议 **`x-enum-labels`**（中文短标签，与 `enum` 顺序一致） |
| `string` | 单行文本 | 可选 `description` |
| `referenceImages` | 参考图多图槽位 | 见 1.6 |
| `switch` | 布尔开关 | `type: "boolean"` |

可选：`x-enum-descriptions`（如 `scenes` 枚举长说明，供 `formatTemplateValue` 展开进模板）。

### 1.6 参考图槽位（`x-ui-type: "referenceImages"`）

- **数组元素** `items.type` 为 `object`，必须包含：
  - **`content`**：`string`，URL 或 base64（生图管线消费）。
  - **`type`**：`string` + `enum`（与 `mxmcgi/src/core/graph/reference-image.ts` 中类型一致）+ **`default`**（该槽位默认语义；合并时优先于客户端乱传的 type）。
- **`title`**：人类可读短标题（表单标签、摘要行标题）。
- **`description`**：**写给下游 LLM 的用途指令**（进入 `summarizeReferenceImages` 的 briefing），说明「这些图代表什么、生成时必须如何遵守」；不要只写「至少上传一张」这类纯 UI 提示。
- **`minItems` / `maxItems`**：按业务限制张数。
- **`items.additionalProperties`**：建议 `false`，避免脏字段。
- **`purpose`**（可选）：每张图额外说明；会进入摘要。

运行时：多槽位会 **merge** 到 `params.referenceImage` 并写回 **`groupKey` / `groupTitle` / `groupDesc`**；落库 sanitize **须保留**这些键（见 `mxmcgi/src/task/reference-image.ts`）。

### 1.7 默认值

- 字段级 **`default`**：由 `applyFormSchemaDefaults` 在请求未带该键时写入（见 `graph-reference-slots.ts`）。
- 与 **required** 一致：若字段必填，通常不应仅靠 default 掩盖缺失。

### 1.8 `uiSchema`（可选）

- 与 RJSF 习惯一致，如 `prompt` → `textarea` + `rows`；不参与后端 JSON Schema 校验，仅影响 Admin / Web `SchemaForm` 展示。

---

## 二、Prompt 规范（`taskTemplate.prompt.unifiedTemplate`）

### 2.1 语言与受众

- **unifiedTemplate 正文**：默认 **中文** 为主（便于运营与美术阅读）；其中插值后的片段可为枚举展开的中/混排。
- **最终英文 image prompt**：由 **`promptTextTaskKey`** 指向的 text/format 任务生成；unified 中须用条款明确「只输出英文 prompt、不得粘贴 URL/base64」。

### 2.2 占位符语法

- 优先 **`${var}`**；兼容 **`{{var}}`**。
- Admin 富文本可能写入 `<template placeholder="var"></template>`；运行时在 `renderPromptFromTemplate` 内会 **sanitize** 为 `${var}`，否则变量无法被收集、**`${prompt}` 长 briefing 校验** 会失效。

### 2.3 参考图在正文中的形态

- **`${referenceImage}`** 以及 **任意值为参考图数组的字段**（通过 `formatTemplateValue` 检测含 `content` 的数组）：只注入 **摘要文本**，不注入 URL/base64。
- 摘要格式由 `summarizeReferenceImages` 定义：按 `groupKey` 分组，含 **`title（共N张）：description`**（有 `description` 时），避免把多图压成无区分的一行。

### 2.4 推荐章节结构（与现有电商/海报子业务对齐）

1. **【角色】** + **【text/format 或下游契约】**：优先级（用户硬约束 > 词表补全）、与参考像素矛盾不写、输出语言。
2. **一、重要的用户要求**：逐条 **`${...}`** 对应表单硬约束（含参考图摘要行）。
3. **二、任务定义**：这类交付物「是什么」。
4. **三、任务要求**：可执行硬规则（identity lock、多宫格连拍、禁止换 SKU 等）。
5. **四、相关参考**：仅未指定时补全，不得覆盖「一」。
6. **五、Prompt 输出参考**：英文段落顺序、画幅与宫格声明、negatives。
7. **【输出】**：只输出最终生图用英文正文等。

### 2.5 `${prompt}` 专项校验

- 若模板引用了 **`prompt`**，且本次请求 `params.prompt` 长度 ≥ 80：插值后的全文 **必须包含** `params.prompt` 的前至多 160 字符作为子串，否则抛 `ConfigurationError`（防止模板未承接 briefing）。

### 2.6 行级裁剪（空占位）

- `interpolateTemplate` 对「整行只有 `标签：${var}` 且 var 为空」的行会 **删除该行**，避免残留「补充说明：」类空壳（见 `prompt-template.ts`）。

---

## 三、与运行时的一页对照

| 步骤 | 说明 |
|------|------|
| 校验 | `validateWithJsonSchema(formSchema, req.params)` |
| 参考图 | `merge` → `hydrate` → `merge`；权威列表写回 `params.referenceImage` |
| 默认值 | `applyFormSchemaDefaults` |
| 插值 | `renderPromptFromTemplate` → `effectiveUserPrompt` / text/format 输入 |
| 生图 | `graph-service`：像素走 provider；大段 URL/base64 不进 text/format |

---

## 四、相关文档与示例

| 文档 / 文件 | 用途 |
|-------------|------|
| [GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md](./GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md) | 存储表、Smartflow、源码索引 |
| `mxmcgi/src/tasks/examples/graph-design-productposter.business.json` | design + bundle 完整示例 |
| `mxmcgi/src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json` | photograph 单文件示例（可再转 bundle） |
| `.cursor/skills/mxmai_graph_business_bundle/SKILL.md` | Agent 上架流程 skill（**§3.0** 与本文 **§1.2.1** 对齐：表单项体量与 subtype 细分） |

> **说明**：仓库内个别历史 bundle 的表单项可能多于 6 条；**新增/重做**请优先遵守 §1.2.1，不强制回溯改旧数据。

---

**版本**：与仓库实现同步维护；冲突时以 TypeScript 源码为准。
