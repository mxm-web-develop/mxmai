---
name: mxmai-graph-business-bundle
description: 在 SuperMXMai 中新增或更新 Graph 子业务（formSchema + unifiedTemplate + 路由/计费），通过 mxm-business-bundle 导入 Admin/数据库。适用于「产品宣传海报」类设计生图、淘宝商拍等需走 Task V2（scope=graph）的配置化上架。
---

# Graph 子业务上架：Schema + Prompt + Bundle 导入（mxmai）

> **Schema / Prompt 全文规范**：[`mxmcgi/docs/GRAPH_SCHEMA_AND_PROMPT_REFERENCE.md`](../../../mxmcgi/docs/GRAPH_SCHEMA_AND_PROMPT_REFERENCE.md)（本 skill 旁 [`reference.md`](./reference.md) 为索引）  
> **命名（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md) — graph type **仅** `generator`（生成 / Generated）| `group`（图集 / Gallery）| `series`（系列 / Series）。题材进 subtype；工具类归 `generator` subtype 或 internal。  
> **禁止** `type=design` / `generated` / `gallery` 等旧 key。  
> **新上架**请用：`type=generator` + `subtype=product-poster`（subtypeLabel 如「产品海报」，≤ 8 字；补英文 i18n）。`parallel_count` **仅按需**（单图多份时）。  
> 架构说明：`mxmcgi/docs/GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md`

当你需要「从零做一个新的生图子类型 + 表单 + briefing 模板 + 路由/价格」或「改现有子业务并同步 DB」时，按本 skill 执行。

**可选执行管线**（前置 Prompt 格式化 / 后置等，**非必须**）：`generator` 以单次生图 + 可选 Prompt 格式化为主。见 [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md)。**主生图在 output**；勿把主路由调用挂到 post。

---

## 1. 数据落在哪里

| 层级 | 存储 / 接口 | 作用 |
|------|----------------|------|
| 任务模板与表单 | `prompt_engineering_config`（`extra.taskTemplate` 等） | `formSchema`、`uiSchema`、`prompt.unifiedTemplate`；校验与插值见 `task-engine.ts` + `prompt-template.ts` |
| text/format | `extra.promptTextTaskKey` | 例：`text/format/gpt-image-2`，由 `graph-service` 在生图前调用，把 briefing 压成英文 image prompt |
| 路由 | `graph_scope_config`（bundle 里 `routing`） | 子类型 → provider / 物理模型 / 是否启用 |
| 计费 | `businessPricing[]`（bundle 内） | `business_type`、按张/按次等 token 价 |

**产品宣传海报**类业务：`extra.display`（taskLabel=`生成`，taskLabelI18n.en=`Generated`，subtypeLabel ≤ 8 字）、`routing.logical_model`（`graph-generator-product-poster`）、`businessPricing` 与模型对齐。`logical_model` 前缀必须是 `graph-generator|group|series-`。

### 1.1 Graph `type`（钉死）

| type | taskLabel | taskLabelI18n.en | 说明 |
|------|-----------|------------------|------|
| `generator` | 生成 | Generated | 简单单次生图；合同为主对象 |
| `group` | 图集 | Gallery | 多图成组 / 批次；合同为对象数组 |
| `series` | 系列 | Series | 同一视觉主体连续调整（带历史） |

**不得新建**旧 type：`generated` `gallery` `tool` `photograph` `design` `painting` `eshop` `tools`。工具类归 `generator` subtype 或 internal。

---

## 2. 推荐交付物：`mxm-business-bundle` JSON

- **顶层**：`schemaVersion: 1`，`kind: "mxm-business-bundle"`，`items: [...]`。
- **每条 item**（一个子业务）至少包含：
  - `scope` / `type` / `subtype` / `is_active`
  - `output_format_i18n`（可选；`rules_i18n` 全 scope 已弃用，勿再写入正文）
  - `form_options_i18n`（可 `null`）
  - **`extra`**：`promptTextTaskKey`、`taskTemplate`（内含 `formSchema`、`prompt.unifiedTemplate`、`uiSchema`、`extra.generateParams` 等）、可选 `display`
  - **`routing`**：与 `graph_scope_config` 对齐（`logical_model`、`provider`、`model`、`enabled`、敏感词库名列表等）
  - **`businessPricing`**：与 Admin「业务计价」一致
  - **`linkedTextFormat`**：若需随包导入关联的 text 配置则填，否则 `null`

导入接口（需 Admin）：`POST /system/admin/business/bundle/import`，body：`{ "bundle": <上列 JSON>, "conflictPolicy": "upsert" | "skip" | "dry-run" }`。实现见 `mxmcgi/src/routes/business-bundle.ts`（内部与 CLI 共用 `mxmcgi/src/routes/business-bundle-import-apply.ts`）。

### 2.1 同步到数据库（任选其一）

| 方式 | 说明 |
|------|------|
| **Admin** | 业务配置页上传 bundle JSON → 调用上述 `bundle/import`（需管理员身份）。 |
| **CLI（推荐 CI/本地）** | 在 **`mxmcgi`** 目录：`pnpm run apply:bundle -- <相对或绝对路径/*.business.json> [--dry-run]`。与 Admin 导入写入同一套表（`prompt_engineering_config`、`graph_scope_config` 等 + `business_pricing`）。 |
| **单业务 seed** | 历史示例：`pnpm run seed:graph-taobaonvzhuang-2`。**新 graph 子业务优先用 bundle + `apply:bundle`**；快捷：`pnpm run seed:graph-design-characterInfocard`、`pnpm run seed:graph-design-Interior_decoration`。 |

### 2.2 为何常有 `formSchema.properties.type = "poster"`？和业务「独立性」的关系

- **一条独立业务** = 业务 **`taskKey`（generator|group|series）** + **`subtype` 唯一** + 自己的 `taskTemplate` / `routing` / `businessPricing`（逻辑模型如 `graph-generator-xxx`）。
- **`params.type`（如 `poster`）** 是 runtime **技术管线分支**（画报 / 3D / 图标…），与业务 taskKey **无关**。差异写进 **subtype + unifiedTemplate + routing**，不要用题材再发明 taskKey。
- **平面单张、设定卡、电商海报** 等技术枚举常落在 **`poster`**；业务独立性由 **`subtype` + DB 行** 保证。
- **用户侧与 Admin 均不暴露管线 `params.type`**：仅 `default: "poster"` + **`x-user-visible": false`**；**不要**在 `unifiedTemplate` 写 `${type}`。

---

## 3. `taskTemplate.formSchema` 设计要点

### 3.0 细分定位与表单体量（产品规范，必遵）

- **子类型要细**：`subtype` 应对应**可单独运营、单独写 briefing** 的细分场景；宁可拆成多个 subtype，也不要用一个大而全的 subtype + 巨型表单覆盖多种无关任务。
- **表单项要少**：面向用户实际要填的 **`properties` 字段数**（每个参考图槽位计 **1** 项；仅带 `default`、用户几乎不改的管线字段如固定 `type: poster` 可不计入「填表负担」）建议：
  - **普通业务**：**1～3 项**；
  - **复杂业务**：**3～6 项**；超过 6 项须在评审中说明理由，并优先用**合并文案**、**合成枚举（版式+气质一体）**、**长说明写进 `unifiedTemplate` 静态段落**等方式减项，而不是堆字段。
- **必填最少**：`required` 通常 **0～1**（如单个短文本主题）；禁止多个必填项、禁止必填 textarea。详见 [mxmai_business_naming §8](../mxmai_business_naming/SKILL.md#8-表单-ux全-scope)。
- **选择器优先**：周期、风格、渠道等用 `selection` / `multiSelection` + `default`，长材料走 `textFileOrPaste` / context 槽位，不要堆多个大段 input。
- **新增与改版遵守**：仓库里**既有** bundle 允许保持历史形态；**新做或重做** Graph 子业务时应按本条设计。本条不要求回溯修改已上线业务。

### 3.1 技术要点（原 3 条顺延）

1. **Task V2 路由**：`POST /api/v2/tasks/run` 使用 `scope`、`taskKey`（大类）、`subtype`（子业务）。表单里的 **`params.type`**（如 design 下的 `poster`）是**管线类型**，与 **subtype** 不是同一概念。**面向用户的 `unifiedTemplate`「一、…」清单不要写 `${subtype}` / `${type}`**（终端用户不关心）；子业务由请求体 `subtype` 与后端路由区分即可。若确需向模型暴露子业务 id，可选用 **`${subtype}`**（`contextVars` 注入，白名单，不要求进 schema）。
2. **除 `prompt-template` 白名单变量外，所有 `${xxx}` 必须在 `formSchema.properties` 里声明**，否则 `renderPromptFromTemplate` 会报配置错误（白名单含 `userId`、`taskId`、`date`、`timestamp`、`uuid`、`subtype` 等，见 `prompt-template.ts`）。
3. **参考图槽位**：`x-ui-type: "referenceImages"`，`items.properties` 含 `content`、`type`（enum + **default**）、可选 `purpose`。  
   - **给 LLM 的用途说明**写在字段 **`description`**（会进摘要 briefing）；上传框短提示可放在 **`title`** 或单独约定。  
   - 合并与落库：`mergeGraphReferenceImageFromFormSlots` / `hydrate`；落库时 `sanitizeReferenceImagesForStorage` **须保留** `groupKey` / `groupTitle` / `groupDesc` / `purpose`（见 `mxmcgi/src/task/reference-image.ts`）。
4. **枚举 UI**：`x-ui-type: "selection"` + `enum` + `x-enum-labels`（中文标签）。
5. **布尔**：`type: boolean` + 建议 `x-ui-type: "switch"`（见项目文档）。
6. **管线 `type`（design 下固定 `poster` 等）**：`properties.type` 只写 `enum` + `default` + **`x-user-visible": false`**；**禁止** `title`/`x-ui-type: selection` 让用户看见「设计子类（固定）」；**禁止**在 `unifiedTemplate` 插 `${type}`。Admin 保存时会自动保留隐藏字段，勿手删该 property。

---

## 4. `prompt.unifiedTemplate`（中文 briefing）结构建议

参考 `graph-design-productposter.business.json` 内长模板，一般采用：

1. **角色 + 下游契约**（谁写英文、参考图像素不进正文、优先级规则）。
2. **「一、重要的用户要求」**：逐行 **`${field}`** 插值——只列**用户能感知、能填的业务字段**（产品名、价格、参考图摘要等）；**不要**写 `${subtype}`、管线 **`${type}`** 等技术项。
3. **「二、任务定义」**：这类海报 / 摄影「是什么」。
4. **「三、任务要求」**：硬规则（如 product identity lock、上屏字与「禁止 no-text」矛盾处理）。
5. **「四、相关参考」**：仅用户未写时补全，不得覆盖「一」。
6. **「五、输出结构」**：英文正文顺序、禁忌、多宫格声明等。
7. **【输出】**：只输出英文 image prompt 等。

**注意**：Admin 富文本可能产生 `<template placeholder="var">` 残留；运行时 `sanitizeTemplateTagPlaceholders` 会转为 `${var}`（见 `prompt-template.ts`）。

---

## 5. 与运行时链路的衔接

1. **`validateWithJsonSchema`**：`task-engine` 在 `runTaskV2` 入口用 `formSchema` 校验 `req.params`。
2. **参考图**：`mergeGraphReferenceImageFromFormSlots` → `hydrateGraphImageSlotParamsFromReferenceImage` → 再 `merge`（与 `graph-service` 一致），保证 `referenceImage` 与槽位元数据一致后再落库。
3. **`formatTemplateValue`**：参考图数组进模板时只输出**摘要**（不注入 URL/base64）；枚举等可能有专用映射（见 `prompt-template.ts`）。
4. **生图**：`graph-service` 读 `promptTextTaskKey` 调 text/format，再把英文 prompt + 参考像素送 provider。

---

## 6. 验收清单（Agent 自检）

- [ ] **子类型足够细**：`subtype` 与「单表单多场景」不混用；宁可拆 subtype。
- [ ] **表单项体量合规**：用户主填项落在 **1～3（普通）** 或 **3～6（复杂）**；超限已评审或已说明例外。
- [ ] `bundle.items[0].scope/type/subtype` 与路由、前端调用一致。
- [ ] `unifiedTemplate` 中每个变量均在 `formSchema.properties` 中定义，或为 `prompt-template` 白名单变量；**「一、用户要求」段不写 `${subtype}` / 管线 `${type}`**；**管线 `type` 为 `x-user-visible:false` 且不出现在 Admin Schema/Prompt 变量列表**。
- [ ] 参考图槽位含 `x-ui-type: "referenceImages"`，且 `description` 语义与产品需求一致（LLM 指令向）。
- [ ] `routing` 中 `model` 已在 `provider_models` / 路由表中可解析。
- [ ] `businessPricing` 与运营预期一致（或确认可后补）。
- [ ] Admin **bundle import** 成功，或等价 `promptRepo.upsert` + 路由写入。
- [ ] 调用 **`POST /api/v2/tasks/run`**：`scope=graph`，`taskKey` 为 `generator`/`group`/`series`，`subtype` 为子类型，`params` 与 schema 一致，任务创建且生图完成。

---

## 7. 相关文件索引

| 用途 | 路径 |
|------|------|
| 产品宣传海报 bundle 示例 | `mxmcgi/src/tasks/examples/graph-design-productposter.business.json` |
| 角色展示卡 bundle 示例 | `mxmcgi/src/tasks/examples/graph-design-characterInfocard.business.json` |
| 室内设计效果图 bundle 示例 | `mxmcgi/src/tasks/examples/graph-design-Interior_decoration.business.json` |
| Bundle 导入实现 | `mxmcgi/src/routes/business-bundle.ts`、`business-bundle-import-apply.ts` |
| CLI 写入 DB（与 import 等价） | `mxmcgi`：`pnpm run apply:bundle -- <path>` |
| 单文件 config 转 bundle（脚本模板，当前偏向 photograph 示例） | `mxmcgi/src/scripts/convert-example-config-to-bundle.ts` |
| Graph 配置与 Smartflow 说明 | `mxmcgi/docs/GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md` |
| 模板插值与参考图摘要 | `mxmcgi/src/tasks/prompt-template.ts` |
| 参考图槽位合并 | `mxmcgi/src/tasks/graph-reference-slots.ts` |
| Task V2 入口 | `mxmcgi/src/tasks/task-engine.ts`、`mxmcgi/src/tasks/routes.ts` |

---

## 8. 常见坑

- **subtype 与 params.type 混用**：路由键用 `graphBusinessSubtype`（subtype）；design 表单里的 `type: poster` 是管线类型，勿混为一谈，**勿对用户展示**。
- **管线 type 做成可见下拉**：违反产品规范；应 `x-user-visible:false` + default，仅运行时注入。
- **模板变量未声明**：插值前 `assertTemplateVarsAllowed` 失败。
- **参考图 briefing 与落库不一致**：确保合并逻辑执行且落库 sanitize **保留**槽位元数据；客户端勿只信扁平 `referenceImage` 的 `type`。
- **未导入 bundle**：仅改仓库 JSON 不会生效，必须 **import** 或 seed 写入 `prompt_engineering_config`。

按上述流程即可复刻「产品宣传海报」式：**一条 bundle = 表单 schema + unified  briefing + 路由 + 计费** 的一站式上架。
