---
name: mxmai-writing-business-bundle
description: 在 SuperMXMai 中新增或更新 Writing 子业务（formSchema + unifiedTemplate + 路由/计费），通过 mxm-business-bundle 导入 Admin/数据库。适用于文章、大纲、口播稿、分镜脚本、歌词等需走 Task V2（scope=writing）的配置化上架。
---

# Writing 子业务上架：Schema + Prompt + Bundle 导入（mxmai）

> **与 Graph skill 的关系**：流程与 `mxmai_graph_business_bundle` 相同（bundle 形态 + `apply:bundle`），但 **scope、taskKey、模板契约、运行时、计费** 均按写作链路，**不可**把 graph bundle 改 `scope` 后导入。  
> **配置 vs 老代码**：v2 只认 `extra.taskTemplate` 里的 **`prompt.unifiedTemplate`**（见 [`OUTLINE-CONFIG-VS-CODE.md`](../../../mxmcgi/src/tasks/OUTLINE-CONFIG-VS-CODE.md)）。  
> **命名（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md) — writing type **仅** `generator`（文稿 / Editorial）| `group`（方案 / Proposal）| `series`（系列 / Series）。题材进 subtype；中英显示见 naming skill §2。  
> **禁止** `type=editorial` / `proposal` 等旧 key；行业日报 = `writing/generator/industry-daily`。  
> **默认模型（硬约束）**：`routing` / `businessPricing` **一律** `provider=maxplan` + `model=MiniMax-M3`（与 text / 平台 `DEFAULT_LLM` 一致）。**禁止**再写 `deer` / `deepseek-*` / `deerapi`。  
> **新上架**请用例如：`type=generator` + `subtype=tech-outline`（subtypeLabel ≤ 8 字；补 `taskLabelI18n.en` / `subtypeLabelI18n.en`）。**不要**默认加 `parallel_count`。

当你需要「从零做一个新的写作子类型 + 表单 + 提示词模板 + 路由/价格」或「改现有子业务并同步 DB」时，按本 skill 执行。

**可选执行管线**（前置 / 人工审核 / 后置，**非必须**）：`generator` 以 **直出** 为主；`group` / `series` 可按需分步。见 [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md)。**主生成（读合同调 LLM）在 output**；`group` 遍历数组也在 output，勿塞 post。

> **行业日报教训（2026-07）**：`writing/generator/industry-daily` 曾在成稿前叠 structure → mapSections → body 三层 nestedText，token 贵且结构更差；已改为证据链 + **主笔直出**。详见管线 skill **§1.1**，同类报道体勿再堆回中间策划 LLM。

> **闸门语义**：pre 的 `interactiveCard` / `basic-form` 闸门会让 task 变成 `awaiting_user_input`（列表文案"待补充信息"），与真审核 `awaiting_review`（"待审核"）严格区分；详见 `docs/adr/awaiting-user-input-gate.md`。配 pipeline 时**不要**让 pre 交互卡进 `awaiting_review`，否则会误导用户。

---

## 1. 数据落在哪里

| 层级 | 存储 / 接口 | 作用 |
|------|----------------|------|
| 任务模板与表单 | `prompt_engineering_config`（`extra.taskTemplate`） | `formSchema`、`uiSchema`、`prompt.unifiedTemplate`；校验与插值见 `task-engine.ts` + `prompt-template.ts` |
| 路由 | `writing_scope_config`（bundle 里 `routing`） | 子类型 → provider / 物理模型 / 是否启用 |
| 计费 | `businessPricing[]`（bundle 内） | `business_type`、按次/按 token 等 |
| 可选展示 | `extra.display` | 任务列表 `taskLabel` / `subtypeLabel` |

**不要**在 Writing bundle 里写 Graph 专用字段：`promptTextTaskKey`（生图前 text/format）、`referenceImages` 槽位、隐藏 `type: poster` 管线等。

**`rules_i18n`**：全 scope 已弃用，bundle 里写 `{}` 即可；正文规则进 **`unifiedTemplate`**。

---

## 2. Writing 业务键（scope / type / subtype）

### 2.1 `type`（即 Task V2 的 `taskKey`，钉死）

| type | taskLabel | taskLabelI18n.en | 说明 |
|------|-----------|------------------|------|
| `generator` | 文稿 | Editorial | 可独立交付的文稿（大纲、短文、口播稿、剧本等）；合同为主对象 |
| `group` | 方案 | Proposal | 多段/可遍历结构产出（系列规划条目、课程多章等）；合同为对象数组 |
| `series` | 系列 | Series | 联合历史上下文连续写作（连载下一章等） |

`subtype` = **可单独运营的场景名**（如 `tech-outline`、`ad`、`resume-it`），与路由键、计费一一对应。**subtypeLabel 2～8 字**；补英文 i18n。

**禁止**作 type：`editorial` `proposal` `longwrite` `outlines` `articles` `voice-scripts` `business` `resumes` 等。库内残留用 `pnpm run deactivate:legacy-writing-editorial`。

### 2.2 逻辑模型名 `routing.logical_model`

- `writing-generator-tech-outline`（`type=generator` + `subtype=tech-outline`）
- `writing-generator-industry-daily`
- `writing-group-course-series-plan`
- `writing-series-novel-next-chapter`

解析写入 **`writing_scope_config`**（`task_key` + `sub_type`），不是 `graph_scope_config`。`logical_model` 前缀必须是 `writing-generator|group|series-`，**禁止** `writing-editorial-*`。

### 2.3 `scope=outline` 与 `scope=writing`

- **新上架**：统一 **`scope: "writing"`** + `generator` | `group` | `series`。
- 勿新建 `scope=outline`。

---

## 3. 推荐交付物：`mxm-business-bundle` JSON

- **顶层**：`schemaVersion: 1`，`kind: "mxm-business-bundle"`，`items: [...]`。
- **每条 item** 至少包含：
  - `scope`（`"writing"`）/ `type` / `subtype` / `is_active`
  - `rules_i18n`: `{}`；`output_format_i18n`: `{ "zh": "", "en": "" }`（可为空，输出格式写在 unifiedTemplate 里）
  - `form_options_i18n`（可 `null`）
  - **`extra`**：`taskTemplate`（`formSchema`、`prompt.unifiedTemplate`、`uiSchema`、可选 `extra.generateParams`、`knowledge`、`storage`）、可选 `display`
  - **`routing`**：`logical_model`、`provider`、`model`、`enabled`、`sensitive_word_lists`
  - **`businessPricing`**：与 Admin「业务计价」一致
  - **`linkedTextFormat`**：写作业务通常为 `null`（生图才常链 text/format）

骨架见本 skill 目录 [`templates/writing-bundle-item.stub.json`](./templates/writing-bundle-item.stub.json)。

### 3.1 同步到数据库

| 方式 | 说明 |
|------|------|
| **Admin** | `POST /system/admin/business/bundle/import`，body：`{ "bundle": <JSON>, "conflictPolicy": "upsert" \| "skip" \| "dry-run" }` |
| **CLI** | 在 **`mxmcgi`**：`pnpm run apply:bundle -- src/tasks/examples/writing-outlines-tech-article.business.json [--dry-run]` |

实现：`mxmcgi/src/routes/business-bundle.ts`、`business-bundle-import-apply.ts`。

### 3.2 从已有 `*.taskTemplate.json` 生成 bundle

仓库内可先维护 `taskTemplate`，再合并进 bundle：

```bash
cd mxmcgi
pnpm exec tsx src/scripts/convert-writing-taskTemplate-to-bundle.ts \
  src/tasks/examples/writing-outlines-tech-article.taskTemplate.json \
  generator tech-outline maxplan MiniMax-M3 \
  > src/tasks/examples/writing-generator-tech-outline.business.json
```

参数：`taskTemplate路径` `type` `subtype` `provider` `model`（**固定示例**：`maxplan` `MiniMax-M3`）。生成后补全 `businessPricing` / `display` / `routing` 细项再 `apply:bundle`。

---

## 4. `taskTemplate.formSchema` 设计要点

### 4.0 产品规范（与 Graph 对齐）

- **subtype 要细**：一种场景一个 subtype，避免「万能表单」。
- **表单项要少**：用户主填 `properties` 建议 **1～3（普通）**、**3～6（复杂）**；超限需说明理由。
- **大纲类 JSON 输出**：必须在 **`unifiedTemplate` 的【输出要求】** 写清节点字段（`uid`、`content`、`children`、`motivation`、`stance`、`tone`、`length`、`key_elements` 等），v2 **不会**再拼接 `writing-service` 里老接口的硬编码说明（见 `OUTLINE-CONFIG-VS-CODE.md`）。

### 4.0.1 表单 UX 规范（必遵）

> 全 scope 通用摘要见 [mxmai_business_naming §8](../mxmai_business_naming/SKILL.md#8-表单-ux全-scope)。

| 原则 | 规则 |
|------|------|
| **必填最少** | `required` 通常 **0～1 项**（多数业务仅 1 个「主题/品牌/客户」短文本）；**禁止** 2 个以上必填，**禁止** 必填大段 textarea |
| **选择器优先** | 周期、渠道、目标、客群、风格等用 `selection` / `multiSelection` + `default`，不用自由文本让用户「猜该填什么」 |
| **长文本克制** | 全表单 **至多 1 个** 可选 textarea（`supplement` / 补充说明，2～3 行）；货盘、brief、手册走 `textFileOrPaste` / `kbRecall` / `webSearch`，不要堆多个 textarea |
| **有默认就不必填** | 带合理 `default` 的枚举/多选 **不要** 放进 `required`；空值时由 `unifiedTemplate` 说明推断策略 |
| **算填表负担** | 仅计用户**真正要选择或输入**的可见项；带 `default` 且多数用户不改的、`x-user-visible: false` 的、可选 context 槽位（`webSearch` / `kbRecall` / `textFileOrPaste`）**不计入** 1～6 项上限 |
| **典例** | `writing/generator/topic-article`：仅主题类短文本必填；篇幅/语气等用选择器 + default；补充说明可选 2 行 |

**反例（禁止）**：`required: [brand, horizon, channels, prompt]` 且 prompt 为 5 行必填 textarea；周期用自由文本「到10月底」而非枚举预设。

### 4.1 技术要点

1. **Task V2**：`POST /api/v2/tasks/run` 使用 `scope: "writing"`、`taskKey` = bundle `type`、`subtype` = bundle `subtype`。
2. **`${var}` 声明**：除 `prompt-template` 白名单（`userId`、`taskId`、`date`、`subtype` 等）外，所有 `${xxx}` 须在 `formSchema.properties` 中定义。
3. **枚举**：`x-ui-type: "selection"` + `enum` + `x-enum-labels`。
4. **长文本需求**：`prompt` 字段 `type: string`，`uiSchema` 可用 `ui:widget: textarea`。
5. **任务列表名**：写作/图文等 Task V2 页顶栏已有「任务名称（列表展示）」→ `metadata.label`，**勿**在 `formSchema` 再声明 `label` 字段，否则会与顶栏重复。
6. **大纲根 uid**：若模板用 `${uid}`，schema 中声明 `uid` 并在 `required` 或 default 策略中与前端约定一致。
7. **勿用 Graph 槽位**：写作不需要 `x-ui-type: referenceImages`（除非产品明确要做「带图写作」且走写作链路，需单独设计）。

---

## 5. `prompt.unifiedTemplate` 结构建议

推荐单段 **`unifiedTemplate`**（Admin 保存后勿依赖已废弃的 `systemTemplate` / `outputFormatTemplate` 三段；导入时 `task-definition` 会合并或要求 unified 非空）。

1. **角色 + 任务定义**（这类写作产出是什么）。
2. **「用户要求 / 参数」**：逐行 **`${field}`** 插值——只列用户可填项；**「一、用户要求」段不写 `${subtype}`**（用户不关心技术 id）。
3. **结构/体裁说明**（如 IMRaD、口播时长约束）；可静态写入，或引用 `outline_structure_type` 等字段。
4. **【用户需求】**：`${prompt}`（可重复强调优先级）。
5. **【输出要求】**：
   - **纯文本**：体裁、语气、长度、禁止 Markdown 代码块等；
   - **JSON 大纲**：明确「仅输出一个 JSON 对象」、字段 schema、禁止 `#` 标题、根节点 `uid` 等（参考典例 `writing-outlines-tech-article`）。

**输出格式**应写在 unifiedTemplate 内，而不是仅依赖空的 `output_format_i18n`。

---

## 6. 与运行时链路的衔接

1. **`validateWithJsonSchema`**：`runTaskV2` 入口校验 `params`。
2. **`renderPromptFromTemplate`**：生成 `finalPrompt`；`useConfiguredPrompt: true`。
3. **`writing-service`**：大纲走 `generateOutline`，文章等走对应 generator；**configured 路径不再拼接老接口硬编码**。
4. **计费预检**：`scope=writing` 按 **token 估算**（`estimatedInputTokens` / `estimatedOutputTokens`），不是按张图。
5. **存储**：可选 `taskTemplate.storage`（如大纲 `bucket: writing-outlines`），见典例 taskTemplate。

---

## 7. 验收清单（Agent 自检）

- [ ] **subtype 足够细**；表单项体量合规（1～3 / 3～6）；**必填 ≤1**；选择器优先、长文本 ≤1 个可选 textarea（见 §4.0.1）。
- [ ] `scope` 为 `writing`（非误用 `graph`）；`type` / `subtype` 与前端、`form-config`、run 请求一致。
- [ ] `prompt.unifiedTemplate` 非空；每个 `${var}` 在 `formSchema` 或白名单中。
- [ ] JSON 类业务：输出约束完整（仅 JSON、字段列表、禁止 markdown 包裹）。
- [ ] **无** `promptTextTaskKey`、**无** 生图 referenceImages（除非刻意扩展）。
- [ ] `routing`：**`provider=maxplan` + `model=MiniMax-M3`**（禁止 deer / deepseek）；`logical_model` 与 `business_type` 一致；`model` 在 `provider_models` 可解析。
- [ ] `businessPricing.charge_metric` 与运营一致（常见 `per_request` / token 类指标，以 Admin 现有写作为准）。
- [ ] `pnpm run apply:bundle -- ... [--dry-run]` 或 Admin import 成功。
- [ ] `GET /api/v2/tasks/form-config?scope=writing&taskKey=...&subtype=...` 返回预期 schema。
- [ ] `POST /api/v2/tasks/run`：`scope=writing`，任务完成且结果为**文本/JSON**（非图片）。
- [ ] **证据缺失处理（§8.5）**：变体/结构策划 prompt 含切片原则；成稿 prompt 含后端回复不入正文 + section 锁定；`field_specs` 含 `insufficient_evidence`；`groupItemBatch` 之后有 manualReview 闸门（id 含 `evidence-review`）。

---

## 8. 相关文件索引

| 用途 | 路径 |
|------|------|
| 大纲科技文 bundle 典例 | `mxmcgi/src/tasks/examples/writing-outlines-tech-article.business.json` |
| 同源 taskTemplate | `mxmcgi/src/tasks/examples/writing-outlines-tech-article.taskTemplate.json` |
| taskTemplate → bundle 脚本 | `mxmcgi/src/scripts/convert-writing-taskTemplate-to-bundle.ts` |
| Bundle 导入 | `mxmcgi/src/routes/business-bundle.ts`、`business-bundle-import-apply.ts` |
| 配置 vs 老逻辑 | `mxmcgi/src/tasks/OUTLINE-CONFIG-VS-CODE.md` |
| Task v2 总览 | `mxmcgi/src/tasks/README.md`、`README_TASK_V2_FIXED.md` |
| 模板插值 | `mxmcgi/src/tasks/prompt-template.ts`、`task-definition.ts` |
| 写作运行时 | `mxmcgi/src/core/writing/writing-service.ts` |
| Graph skill（勿混用） | `.cursor/skills/mxmai_graph_business_bundle/SKILL.md` |

---

## 8.5 证据缺失处理（写作通用硬规则）

适用于 `scope=writing` 的所有子业务，**不止 group**。规则比"不得编造"更严格——它规定**当证据就是没有的时候**，pipeline 必须显式作出反应，而不是把"无证据"翻译成读者可见的文字。

### 8.5.1 禁止的翻译行为

下列内容**禁止**作为读者可见的段落、导语、过渡句、免责声明、致歉语、方法论清单出现——它们是**后端回复**，不是文章：

- 「本轮未能通过公开检索……」
- 「N 条命中没有任何一条来自 X」
- 「按调查惯例……需调取以下材料……」
- 「现状说明：……」
- 「方法论提示：……」
- 「读者可自行核查的入口：……」
- 「鉴于公开资料有限，本文仅作初步梳理……」
- 任何教读者"如何查 / 如何验证 / 第一性核查方法"的清单

判断标准：**任何一段删除后文章照样成立、或读者读完发现是写给后端看的而不是写给自己的**——这段就是后端回复，必须砍。

### 8.5.2 section 切片原则（变体导演 / 结构策划阶段）

`structure_plan.sections.intent` **只描述该章要回答什么 / 切入什么角度**，**禁止**预设依赖已检索事实才能成立的证据形态：

- ❌「两组可核查报道并置」「抽取标题高频词与情感方向」「对比中外信源出现频次」「列举本可援引而未援引的反方材料」「按工商/财报/诉讼档案逐条核验」——本阶段尚未检索，写不出就别预设。
- ✅ 把意图落到 `search_focus` 里，由后续成稿阶段按检索结果自行决定切片形态。

`common_ground.rules` 写「不得编造具体数字、引语或已检索到的事实」是底线，**但不等于「必须写到这类证据」**——rules 是真伪底线，不是产量指标。

### 8.5.3 section 锁定（成稿 / 写手阶段）

`structure_plan.sections` 中每一节的 `heading / purpose` 在本阶段**不可改写为另一个主题**：

- 要么用原本意图的证据成稿，要么整节从 `body_sections` 中**删除**（连 heading 都不留）。
- ❌ 不得用其它 section 的证据"顶包"成原 section。
- ❌ 不得借"换个角度"之名整段偷换主题。
- ❌ 不得用"暂无数据……"等过渡句填充。

### 8.5.4 处置矩阵

| 情况 | 行为 |
|------|------|
| 单 section 缺证据 | 删除该 section |
| 多数 section 缺证据 | 保留剩余，压缩篇幅，不补无证据过渡段 |
| **全部 section 缺证据** | 该路标记 `insufficient_evidence: true`（`body_sections=[]`），pipeline 在 `groupItemBatch` 后由 `manualReview` 节点拦住，让用户改 `search_focus` 单独重跑该路，或接受该路不出稿、只汇编剩余路 |
| 全部路都缺证据 | 整个 task 在 `manualReview` 处停下，用户重新选择话题/角度/检索方向 |

### 8.5.5 schema / pipeline 必加项

1. **`itemNestedText.field_specs`** 加 `insufficient_evidence: boolean`。
2. **`itemNestedText.field_specs.body_sections.description`** 写明：缺证据 section 删除；全部缺时输出空数组 + `insufficient_evidence=true`。
3. **`pipeline.enrich` 末尾、`groupItemBatch` 之后**插 `manualReview`（id=`*-evidence-review`），`applyMapping` 回写 `state.contract`；后端需在 `insufficient_evidence` 全 false 时跳过该 gate（未实现前，所有路 ready 时也会拦一道，由前端 UI 自动 skip 即可）。
4. **变体导演 / 结构策划 prompt** 加 §8.5.2 的切片原则硬规则。
5. **成稿导演 prompt** 加 §8.5.1 + §8.5.3 的硬规则。

### 8.5.6 验收（必加）

- [ ] 变体导演 / 结构策划 prompt 包含 §8.5.2 切片原则
- [ ] 成稿导演 prompt 包含 §8.5.1（后端回复不入正文）+ §8.5.3（section 锁定）
- [ ] `field_specs` 含 `insufficient_evidence` 字段
- [ ] pipeline 在 `groupItemBatch` 之后有 manualReview 拦证据缺失（id 含 `evidence-review`）

---

## 8.6 写作类人工审核：对话 + 摘要模式（`kind: writing-chat`）

写作类 manualReview **不得**继续走 `kind: json` 把整份合同 JSON 摊给用户——他们没有时间读 JSON。`kind: writing-chat` 是为写作类业务专门设计的人工审核模式：

> **后端**调一个 text 子业务把合同整理成人话版 Markdown 摘要 + 可调字段提示；
> **前端**默认渲染摘要对话，原始 JSON 折叠在「查看/编辑原始合同（进阶）」里，可展开手动调整。

### 8.6.1 三方职责

| 角色 | 负责 |
|---|---|
| **bundle（writing 业务）** | 在 manualReview 步骤声明 `kind: writing-chat` + `summaryTaskKey: "text/transform/writing-review-summary"` + `applyMapping: { "state.contract": "${review.json}" }` |
| **text/transform/writing-review-summary（管线内 text 业务）** | 入参固定为 `input` + `instruction`（text v2 transform）；`input` JSON 含 contract/gate/field_specs；输出 Markdown 摘要。**禁止**用 `text/expert/*`（expert 钉死只有 contract/field_specs，模板无法引用 source/gate）。**禁止**输出"暂无数据 / 检索无命中 / 方法论提示 / 教读者自查"；不引用 schema 内部字段名；走 m3 |
| **前端 Modal** | 与 pre **交互卡同构**：短气泡引导 + `WarpGateWizard` 分步字段；提交时把卡片值写回 `state.contract`。**禁止**默认摊整页 Markdown / 原始 JSON |

### 8.6.2 后端 manualReview 步骤声明

```json
{
  "step": "manualReview",
  "params": {
    "id": "seek-variants-review",
    "label": "确认各路结构与风格",
    "hint": "请逐路核对切入角度、结构方案与写手风格；确认或修改后，再分路检索并写成文章。",
    "kind": "writing-chat",
    "summaryTaskKey": "text/transform/writing-review-summary",
    "draftFrom": "${state.contract}",
    "reviewSurface": "business",
    "applyMapping": { "state.contract": "${review.json}" },
    "editable": true
  }
}
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `kind` | ✅ | 必须为 `writing-chat` |
| `summaryTaskKey` | ✅ | 形如 `text/transform/<subtype>`；后端会**同步**调用 `runTaskV2({ ephemeral: true })` 拿到 Markdown 摘要；失败回退到空摘要 + `metadata.summaryError`（不阻塞审核） |
| `summaryInstruction` | ❌ | 自定义摘要 prompt；不传走默认（默认会强调"用对话口吻、不要列内部字段、不要解释后台状态"） |
| `draftFrom` | ✅ | 原始合同 JSON 的来源路径（通常 `${state.contract}`） |
| `applyMapping` | ✅ | 至少要有 `state.contract: ${review.json}`，否则用户编辑无法写回 |

### 8.6.3 text/transform/writing-review-summary 的 unifiedTemplate 硬要求

- 模板变量**仅**允许 `${input}` / `${instruction}`（与 text v2 transform 钉死入参一致）
- 直接输出 **Markdown 文本**，禁止代码围栏
- 推荐 4 段结构：
  1. **这次是什么**（≤2 句，含 gate.label）
  2. **关键要点**（3～6 条 bullet，含：话题主线 / 各变体的角度 / 风格 / 证据是否充分）
  3. **要你确认或调整的事**（≤5 条 bullet，告诉读者「你可以改什么、点哪里」）
  4. **可调整字段提示**（一句话总结 schema 里真正可让用户改的字段名 / 选项，**不要**列内部 id）
- **禁止**输出「本轮检索无命中」「按调查惯例需调取以下材料」「方法论提示」「建议读者可自行核查」「本文不构成投资建议」等后端回复
- 模型：m3（`MiniMax-M3`），provider `maxplan`，logical_model `text-transform-writing-review-summary`

### 8.6.4 前端 Modal 行为

- 弹窗宽约 560（与 pre 交互卡一致），**不是**全屏 Markdown 墙
- 进闸前后端已写入 `interactiveCardFields`（由合同 variants/topic 同步生成，**不依赖**打开弹窗时再调 LLM）
- 顶部短气泡：`summary` 首段或 deterministic 引导；下方 `WarpGateWizard` 分步卡（话题 / 各路角度 / 检索方向 / 语气）
- GET `/review-draft` **禁止**同步重跑摘要 LLM（打开即显卡）；缺字段时仅同步补齐
- 提交：卡片值合并进合同 JSON → `reviewJson`；`applyMapping` 写回 `state.contract`

### 8.6.5 schema / pipeline 必加项（验收 checklist）

- [ ] writing 业务的每个 manualReview 步骤**改为** `kind: writing-chat`
- [ ] `summaryTaskKey` 指向 `text/transform/writing-review-summary`（**不要**再用 `text/expert/...`）
- [ ] `applyMapping` 至少含 `state.contract: ${review.json}`
- [ ] 仓库内 `text/transform/writing-review-summary` 已注册为独立 item（routing 走 m3，logical_model = `text-transform-writing-review-summary`）
- [ ] prompt 内不出现「暂无数据 / 检索无命中 / 教读者自查 / 免责语」
- [ ] 打开审核弹窗应立即看到分步交互卡，**不得**长时间转圈等摘要
- [ ] 前端默认交互卡，**不**要求用户打开 JSON 才能操作

---

## 9. 常见坑

- **把 graph bundle 改成 writing**：路由进错表、仍走 `graph-service` 或带着 image prompt 模板。
- **只改仓库 JSON 不 import**：DB 不更新，线上仍用旧配置。
- **v2 大纲只有最简 outputFormat**：产出只有 `uid/content/children`，缺 `tone`/`stance` 等——须在 **unifiedTemplate** 写全字段说明。
- **logical_model 与 type 不一致**：如 `writing-outline` 应规范为 `writing-outlines`（导入时会 canonical）。
- **Smartflow 业务节点**：`business_scope` 选 `writing`，`business_task_key` / `business_subtype` 与 bundle 一致。

按上述流程即可复刻：**一条 bundle = 表单 + unifiedTemplate + writing 路由 + 计费** 的一站式写作子业务上架。
