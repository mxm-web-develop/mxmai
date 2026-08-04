---
name: mxmai-business-naming
description: SuperMXMai 全 scope 业务命名规范：taskKey/subtype 结构、四语显示名（zh / zh-TW / en / ja）、按需 parallel_count。新建或改版 business bundle、Admin 显示名、seed 脚本时必须遵循。
---

# 业务命名规范（mxmai）

> 路由键 = `scope` + `taskKey`（type）+ `subtype`。  
> **非 text scope：type 全平台统一为 `generator` | `group` | `series`**（见 §3）。  
> **text** 仍为 `plan` | `transform` | `expert` | `validation`（见 §3.6）。  
> 具体业务名只放 **subtype** / **subtypeLabel**。  
> **中文显示名只给人看**；**英文显示可用旧分类名**（Editorial / Gallery / Autocut…），**内部 value 一律三态**。  
> **新生产业务必须遵循本文件**。非 text 的 `type` **只允许** `generator`|`group`|`series`；**禁止**再写、再 seed、再导入任何旧 type（含 `editorial`）。  
> **text / writing 默认模型**：`maxplan` + `MiniMax-M3`。**禁止** bundle 再写 `deer` / `deepseek-*`。

## 1. 三层结构

| 层 | 字段 | 含义 | 示例 |
|----|------|------|------|
| scope | `scope` | 能力域 | `writing` `graph` `audio` `video` `music` `text` |
| 分类 | `type`（taskKey） | **平台规定**的产出形态 | `generator` / `group` / `series` |
| 具体业务 | `subtype` | 唯一子业务（业务名） | `product-poster` `tech-outline` `autocut` |

**原则**：

- type = **产出 / 合同形态**（单件对象 vs 并发数组 vs 历史连续），**跨 scope 同名同义**。
- 题材、渠道、场景、管线风格一律进 **subtype**（及中英 subtypeLabel）。例：`video/group/autocut`。
- Admin / 前端列表分列 type / subtype；显示名**不要**再写路径式标题。
- 模块产物彼此独立、可导入解析；**流水线可选**，不因 type 名暗示强制全家桶。

## 2. 显示名与多语言约定

产品语言码：`zh` | `zh-TW` | `en` | `ja`（见 `docs/shared/I18N.md`）。

存储位置：

- 简体默认：`extra.display.taskLabel` + `extra.display.subtypeLabel` + `extra.display.description`
- 多语 map：`extra.display.taskLabelI18n` / `subtypeLabelI18n` / `descriptionI18n`（及 `form_options_i18n`）
- 键：`zh` / `zh-TW` / `en` / `ja`；缺键运行时按回退链解析（`zh-TW`→`zh`→`en`，`ja`→`en`→`zh`）
- Admin「基础配置」可编辑显示名与业务描述（四语）；交互卡副文案读 `description` / `descriptionI18n`

### 2.1 语言规则（钉死）

| 用途 | 规则 |
|------|------|
| **type / taskKey（value）** | **仅** `generator` \| `group` \| `series`（text 除外，见 §3.6） |
| **简体环境显示** | `taskLabel` / `subtypeLabel` 用**简体中文**（与 §3 各 scope 中文列一致） |
| **繁体 / 日语 / 英文** | 分别写入 `*I18n['zh-TW']` / `*I18n.ja` / `*I18n.en`；英文可用旧分类 Title Case |
| **subtype value** | 英文 kebab-case（如 `product-poster`、`voiceover-science-pop`） |

### 2.2 格式

| 字段 | 规则 | 正例 | 反例 |
|------|------|------|------|
| **taskLabel（zh）** | 2～8 字，表示**分类**（与 §3 中文列对齐） | `文稿` `图集` `单口` `创作` `系列` | `视频 · UP 素材` `电商 · 海报` |
| **taskLabelI18n.en** | §3 英文显示名（旧分类名） | `Editorial` `Gallery` `Voiceover` `Autocut` | `generator`（value 才是小写三态） |
| **taskLabelI18n.zh-TW / ja** | 繁体 / 日语分类名（可缺，运行时回退） | `圖集` / `アルバム` | |
| **subtypeLabel（zh）** | **2～8 字**，具体业务 | `产品海报` `播客讲稿` `口播成片` | 过长流程句、technical path |
| **subtypeLabelI18n.en** | 简短英文业务名 | `Product poster` `Podcast script` | 复述整个 subtype key |
| **subtypeLabelI18n.zh-TW / ja** | 繁体 / 日语业务名（可缺） | `產品海報` / `製品ポスター` | |
### 2.3 禁止

- 括号：`()` `（）` `[]`（显示名内）
- 技术路径重复：`autocut/render`、`scope/type/subtype`
- 英文 key 当中文标题：`productposter`、`grid-r2v`
- 过长流程箭头放进 label（放 `description` 或文档）
- subtypeLabel（zh）**超过 8 字**
- 在 taskLabel 里再叠 `写作 ·` / `图像 ·` 等 scope 前缀
- **新上架**再使用 `editorial` / `proposal` / `generated` / `gallery` / `voiceover` / `dialogue` / `synthesis` / `autocut`（作 **type**）等旧 taskKey —— 它们只可作 **英文显示名** 或 **subtype**（如 `video/group` + subtype `autocut`）

### 2.4 text 与管线嵌套

- **text**（plan/transform/expert/validation）本身即可被管线 `nestedText` / webSearch 等嵌套调用，**无单独 C 端「纯文本生成」入口**；不要再使用已废弃的「内部业务」标记（`userFacing` / `extra.internal` / Admin「显示内部管线」）。
- **与 video/group 分工**：人工审核里 AI 镜头选 `video/generator/*`；`videoTimelineRender` 是审核通过后按时间轴批量调度 dispatcher，**不是 DB 业务**

## 3. 各 scope 分类 taskKey（钉死 · 2026-07-23 起新上架）

> **不得**在下列表之外再发明新 type（除非先改本 skill）。  
> `editorial` / `proposal` / `generated` / `gallery` / `voiceover` / `dialogue` / `speak` / `synthesis` / `autocut`（作 type）/ `fragment` 等：**一律禁止**作为 taskKey。解析层别名仅兼容历史任务，**不得**据此上架。清理：`pnpm run delete:legacy-writing-editorial` / `deactivate:legacy-audio-speak` 等（writing editorial 为硬删）。

### 总则：三态语义（跨 scope 一致）

| taskKey | 合同形状 | 含义 | 典型场景 |
|---------|----------|------|----------|
| **`generator`** | **对象**（单焦点） | 专注的单次内容生成 | 一篇文稿、一张主图、一段口播、一条成片、一首完整曲 |
| **`group`** | **对象数组**（可遍历 / 并发生成） | 多个子任务并发生成 | 图集、多角色对话、自动剪辑多 clip、方案多段产出 |
| **`series`** | **对象 + 历史上下文**（将演进） | 联合历史数据生成新内容 | 连续剧下一集、同一张图连续调整、连载章节 |

运行时：`resolveWarpShape(scope, taskKey)` → `generator` \| `group` \| `series`（**只查表，不写入合同 meta**）。

**硬约束（跨 scope）**：**从合同取参并调用本业务主生成接口** 的步骤默认落在 **output**（`generator` 一次 / `group` 遍历数组 / `series` 带历史），**禁止**因 `skipOutputLlm` 把主合成挪到 `pipeline.post`。详见 [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md) §2.1。

---

### 3.1 writing

| taskKey | 中文显示 | 英文显示 | 说明 |
|---------|----------|----------|------|
| `generator` | 文稿 | Editorial | 可独立交付的文稿：短文、大纲、口播稿、剧本、社媒帖、Shownotes、行业日报等 |
| `group` | 方案 | Proposal | 多段/可遍历结构产出：系列规划条目、课程多章大纲、分集梗概列表等 |
| `series` | 系列 | Series | 带历史上下文的连续写作（连载下一章、续写同一世界观等） |

具体题材全部是 **subtype**。

**禁止作 type**：`editorial` `proposal` `longwrite` `articles` `outlines` `voice-scripts` `storyboard-scripts` `lyrics` `suno-lyrics` `media-post` `reviews` `resumes` `business` 等。行业日报 = `writing/generator/industry-daily`（**不是** `editorial`）。

---

### 3.2 graph

| taskKey | 中文显示 | 英文显示 | 说明 |
|---------|----------|----------|------|
| `generator` | 生成 | Generated | 单次生图（海报、摄影、商拍、角色卡、Logo 等一张/一次主调用） |
| `group` | 图集 | Gallery | 多图成组 / 批次图集产出 |
| `series` | 系列 | Series | 同一视觉主体连续调整 / 多轮迭代生图（带历史帧或历史合同） |

**禁止作 type**：`generated` `gallery` `tool` `photograph` `design` `painting` `eshop` `tools`。  
图像工具类（扩图、去背景等）新上架优先归 **`generator` 下 subtype**。

> 表单里隐藏的 `params.type`（如 `poster`）是 **runtime 技术管线分支**，与业务 taskKey **无关**，仍勿对用户展示。

---

### 3.3 audio

| taskKey | 中文显示 | 英文显示 | 说明 |
|---------|----------|----------|------|
| `generator` | 单口 | Voiceover | 单人 / 单轨 TTS 或口播（可含短 nestedText 写稿） |
| `group` | 对话 | Dialogue | 多角色 / 多音色对话或多轨语音（并发或成组轨） |
| `series` | 系列 | Series | 带历史上下文的连续配音 / 多集口播续作 |

**已废弃作 type**：`voiceover` `dialogue` `multiple` `speak`（仅作 type 时）。旧 `speak/*` 示例与路由须清理：`pnpm run deactivate:legacy-audio-speak`（仓库内不再保留 speak bundle）。

---

### 3.4 video

| taskKey | 中文显示 | 英文显示 | 说明 |
|---------|----------|----------|------|
| `generator` | 创作 | Synthesis | 独立成片 / 片段等「创作向」单次或简单生成 |
| `group` | 编组 | Autocut | 多子任务并发展开（如自动剪辑多 clip）；例：`video/group/autocut` |
| `series` | 系列 | Series | 带历史镜头/成片上下文的连续创作 |

电商上架动效、宫格分镜、通用短视频等，全部是 **`generator` 下的 subtype**。  
自动剪辑入口：**`group` + subtype（如 `autocut` / `voiceover-science-pop`）**，**不要**再把 `autocut` 当作 type。

**已废弃作 type**：`synthesis` `autocut`（作 type）`edit` `resource` `storyboard` `short` `commercial`

---

### 3.5 music

| taskKey | 中文显示 | 英文显示 | 说明 |
|---------|----------|----------|------|
| `generator` | 生成 | Generated | 完整曲目单次生成（可含可选写词 nestedText） |
| `group` | 片段 | Fragment | 多段 / 短 hook / 切片向成组产出 |
| `series` | 系列 | Series | 带历史曲目上下文的续作 / 变奏连作 |

**已废弃作 type**：`fragment`（请改 `group`）、`compose` 等。

---

### 3.6 text（内部 LLM 原子步骤 · v2 · **不纳入三态**）

| taskKey | 中文显示 | 固定入参 |
|---------|----------|----------|
| `plan` | 规划 | `contract` + `goal` |
| `transform` | 转换 | `input` + `instruction` |
| `expert` | 专家填合同 | `contract` + `field_specs` |
| `validation` | 校验 | `contract` + `rules` |

**废止**（不得新建）：`format` `think` `structure` `layout`。本分支不兼容旧映射。

text **无管道、无合同双区**；入参 schema 由平台按 type 注入。多步只在宿主生成业务的 nestedText 中串接。详见 `docs/mxm-warp-v2-对齐记录.md` §T、`.cursor/skills/mxmai_text_business_bundle/SKILL.md`。

text 多为其它 scope 的 nestedText 挂载，**不是** C 端主入口分类。

## 4. 生成份数 `parallel_count`（按需，非默认）

- **不是**所有业务都要「生成份数」。
- 仅当产品明确需要「一次提交出 N 份独立结果」（常见：单图 `generator`、部分 video `generator` 片段）时，才在 **该业务** formSchema / 平台字段中启用。
- **默认不要**给 `group`（组内件数另论）/ `series` / 多数 writing `generator` 无脑加 `parallel_count`。
- 启用时：范围与计费按子任务次数；`text` scope 仍不支持。
- 设计新业务时在 checklist 里显式回答：**本业务是否需要份数？** 不需要则 schema 不出现该字段。

## 5. video 标准子业务一览（示例 · 新 key）

| taskKey | subtype | taskLabel | taskLabelI18n.en | subtypeLabel | 备注 |
|---------|---------|-----------|------------------|--------------|------|
| group | voiceover-science-pop | 编组 | Autocut | 口播分镜成片 | 用户入口（原 autocut type） |
| group | autocut | 编组 | Autocut | 自动剪辑 | 通用编组入口示例 |
| generator | fragment | 创作 | Synthesis | UP素材片段 | AI 块默认 |
| generator | fragment-mini | 创作 | Synthesis | 经济素材段 | Seedance Mini |
| generator | grid-r2v | 创作 | Synthesis | 宫格分镜成片 | |
| generator | default | 创作 | Synthesis | 通用短视频 | |
| generator | eshop-i2v | 创作 | Synthesis | 上架图动效 | |

**禁止**再上架 `synthesis/*`、`autocut/*` 作 type；一律用上表。

**管线内置节点（非业务）**：`videoTimelineRender` — 由 `renderOptions` 区分阶段：

| renderOptions | 职责 |
|---------------|------|
| `concatFinal: false` | **逐段生成**：并发渲染各 clip，供成片审核 |
| `concatFinal: true, skipReadyClips: true` | **拼接成片**：跳过已就绪片段，ffmpeg 合成 mp4 |
| `concatOnly: true` | 仅拼接，不重新渲染 |

## 6. 其它 scope 命名示例（新规范）

| scope | type | subtype（示例） | taskLabel | taskLabelI18n.en | subtypeLabel |
|-------|------|-----------------|-----------|------------------|--------------|
| writing | generator | tech-outline | 文稿 | Editorial | 科技大纲 |
| writing | group | course-series-plan | 方案 | Proposal | 课程系列规划 |
| writing | series | novel-next-chapter | 系列 | Series | 连载下一章 |
| graph | generator | product-poster | 生成 | Generated | 产品海报 |
| graph | group | content-album | 图集 | Gallery | 内容配图 |
| graph | series | poster-iterate | 系列 | Series | 海报连调 |
| audio | generator | podcast-host | 单口 | Voiceover | 播客主持 |
| audio | group | multi-voice | 对话 | Dialogue | 多人语音 |
| audio | group | dual-host | 对话 | Dialogue | 双人主持（历史例名；新业务优先 multi-voice） |
| video | generator | teaser-15s | 创作 | Synthesis | 十五秒预告 |
| video | group | autocut | 编组 | Autocut | 自动剪辑 |
| music | generator | full-track | 生成 | Generated | 完整曲目 |
| music | group | hook-pack | 片段 | Fragment | 短 hook 组 |

## 7. routing / logical_model

与 **现行** taskKey 对齐（`scope-type-subtype`）：

- `writing-generator-tech-outline`
- `writing-group-course-series-plan`
- `writing-series-novel-next-chapter`
- `graph-generator-product-poster`
- `graph-group-content-album`
- `audio-generator-podcast-host`
- `audio-group-multi-voice`
- `audio-group-dual-host`
- `video-generator-fragment`
- `video-group-voiceover-science-pop`
- `music-generator-full-track`

## 8. 新建 bundle 检查清单

- [ ] `type`/`subtype` 符合 §3（非 text 仅 `generator`|`group`|`series`；不用已废弃旧 type）
- [ ] taskLabel = §3 **中文**列；`taskLabelI18n.en` = §3 **英文显示**列（旧分类 Title Case）
- [ ] subtypeLabel（zh）2～8 字；补 `subtypeLabelI18n.en`
- [ ] 无括号、无 technical path
- [ ] **是否需要 `parallel_count`？** 不需要则不要加（§4）
- [ ] 单件直出用 `generator`；并发表组用 `group`；历史连续用 `series`（未就绪前勿硬上 series 运行时能力）
- [ ] 不与已有 `(scope,type,subtype)` 重复
- [ ] 若库里仍有活跃旧 type：先 `deactivate:legacy-*`，再 seed 三态业务

## 9. 相关 skill

- Video / Graph / Writing / Audio / Music：同目录 `mxmai_*_business_bundle`
- **Text（LLM 原子步骤 v2）**：`.cursor/skills/mxmai_text_business_bundle/SKILL.md`（plan/transform/expert/validation；固定入参；无管道）
- Pipeline：`.cursor/skills/mxmai_business_pipeline/SKILL.md`

## 10. 表单 UX（全 scope）

新建或改版 **formSchema** 时与命名规范同等重要：

1. **必填最少**：`required` 通常 **0～1**；禁止多个必填 + 禁止必填 textarea。
2. **选择器辅助决策**：周期、渠道、目标、风格、档位等用 `selection` / `multiSelection` + `default`。
3. **长文本克制**：至多 **1 个** 可选 `supplement`；详细材料用 `textFileOrPaste`、`kbRecall`、`mxmKbInput`、`webSearch`。
4. **表单项体量**：用户主填 **1～3（普通）/ 3～6（复杂）**。
5. **导入优先**：支持用户上传 / 引用已有资产作为本模块输入，不强迫跑完上游流水线。
6. Writing / Graph 细节见对应 `mxmai_*_business_bundle`。

### 10.1 C 端表单「其他」/ 自定义提示规范（强制）

**禁止**让 C 端用户裸接一个没有上下文的纯输入框。每个 basic 字段都必须满足以下其一：

- 走 **`selection` 枚举**：在 C 端只展示 chips / 选项；枚举值即为产品最终值。
- **包含「其他」时**：必须配套 `*_custom` 字符串字段（如 `style_custom` / `article_structure_custom` / `industry_custom`），并由 C 端向导在用户选「其他」时**内联展开**一个标题 + 占位文案 + 提示三件套的输入框，**不要**把它单独拆成下一个分步。
- 字符串 / `supplement` 字段：必须给 schema 的 `description`（在 C 端当 prompt 文案）+ `placeholder`（input 占位）+ 提示行（C 端组件层兜底，至少 `告诉用户这里要填什么 + 给出 1 个示例`）。

适用组件：`web/src/components/GuidedChatField.tsx`（对话式引导）+ `web/src/components/WarpGateWizard.tsx`（分步式）。

**反例（2026-07 截图）**：行业日报 basic 表单把 `article_structure_custom`（`article_structure=其他时补充结构要求`）独立成步，C 端只渲染一个空 `TextArea` 占位「输入自定义内容…」—— 用户完全不知道要填什么。修复后：选「其他」时**就地展开**「自定义结构说明」标题 + `例：开头产品速览 → 三段对比 → 风险与展望` 占位 + 提示行。

**允许的字段类型清单**（用户在 C 端能看到并填）：

- `selection`（含 `enum`）+ 可选 `*_custom`
- `multiSelection`（多选）
- `textFileOrPaste` / `upload`（带文件入口）
- `kbRecall` / `mxmKbInput`（知识库引用）
- `webSearch`（联网检索节点）
- `supplement`（至多 1 个，**禁必填**）
- `topic-chips`（话题多选，仅写作向导）

任何超出该清单的字段（如无 enum 的 `string`、无 `_custom` 的「其他」、裸 `text`）**禁止**直接暴露给 C 端；要么加上选择器 / 上下文，要么改 x-user-visible=false（仅 Admin）。
