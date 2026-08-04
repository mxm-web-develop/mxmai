# mxm-warp 业务与管线改版 · v2（对齐记录）

> **地位**：本文件为改版**唯一讨论主稿**。  
> **废止**：`pipelines和业务包新设计.md` 中未经验证的臆测样例**不作为设计依据**。  
> **规则**：数据结构 / 统一字段 / 运行逻辑须先提问对齐 → 写入「已对齐」；禁止自行发明当定论。

## 文档约定

| 状态 | 含义 |
|------|------|
| ✅ 已对齐 | 双方明确同意，可当后续设计前提 |
| ❓ 待对齐 | 开放问题；未写入已对齐前不得当假设落地 |
| 🚫 废案 | 曾提出但已否定或过期 |

## ✅ 已对齐

1. 产品模块名：**知识库**（原虚拟文件夹）；与本改版数据面分开推进。
2. 业务路由仍谈 **scope / taskKey(type) / subtype**；非 text 的 taskKey **三态**钉死：`generator`（对象合同）| `group`（对象数组 / 并发表组）| `series`（历史上下文连续生成）。旧名如 editorial/gallery/autocut 仅作英文显示或兼容别名，不作新 type。text 仍为 plan/transform/expert/validation。
3. **改版推进顺序**：**C（执行引擎）→ A（运行时合同）→ B（业务定义物）**。
4. **业务包 ≠ 运行时合同**。
5. **C1 · 平台固定五段**：`pre → input → enrich → output → post`（可跳过空管道段）。
   - **pre / enrich / post**：Admin 管道可配；**禁止写死业务逻辑**。
   - **input**：按 Schema/`description` **简单回填**；不做角色/高复杂字段。
   - **output**：吃齐前序数据再生成。写作 = Admin Prompt（业务理解 + 角色）+ 完整合同 → 文本 LLM；**媒体** = 从合同取参调用本 scope 主生成接口（speech / 生图 / 视频 / 音乐等）。`generator`|`group`|`series` **一致**：group 在 output **遍历**合同数组，series 带历史调同一套 output。
   - **`skipOutputLlm`**：仅跳过 output 的**文本 LLM**；**不**跳过媒体 output，**禁止**把主 TTS/成片链塞进 post 冒充「跳过了 output」。规范见 `.cursor/skills/mxmai_business_pipeline/SKILL.md` §2.1。
6. **C2**：input 只简单回填；复杂字段交 enrich 的 text(tools)。
7. **检索层次**：pre≈大话题/趋势；enrich≈面向业务内容的深检索。
8. **C3**：复杂 text(tools) 回填主要挂 **enrich**。
9. **C4**：步骤注册表沿用演进 + 阶段推荐用途 + 禁写死。
10. **N · 管线节点可复用**（2026-07-25）：
    - 平台 step 只表达通用能力；靠 `params` / `fieldMapping` / `when` / 命名 `queryBuilder` 适配业务。
    - 禁止 step 内按 `taskKey`/`subtype` 分支或写死业务字段名唯一路径。
    - 验收：同一 step 能挂到 ≥2 个无关业务且只改配置。见 `docs/adr/pipeline-reusable-steps.md`。
11. **C5**：空段跳过；失败默认失败任务；人工审核可配在 pre/enrich/post（用末步位置表达 input 前/output 前）。
12. **C6**：不以「用户填全跳过 input」为场景。
13. **A1**：运行时**一份合同**；basic 可问答且作复杂字段背景。
14. **A2**：basic vs 专业字段物理分区；input 填 basic；专业字段 enrich 专家 text。
15. **A3 · 合同顶层**（现行）：

    | 顶层键 | 含义 |
    |--------|------|
    | `meta` | 平台信封 |
    | `basic` | 大方向 |
    | `business` | 业务输出数据字段 |
    | `sources` | 检索沉淀为主（含 pre、知识库等） |
    | `assets` | 静态资源 |
    | `enrich_search` | 深搜工作区（input 写方案；enrich 可写 `result`；output 可读） |

16. **A4**：知识库 `@` 文在 `sources`、图在 `assets`，同一 **`refId`**（优先知识库稳定业务 ID）。
17. **A5 / pre 联网（修订）**：
    - **不需要** `basic.search`。
    - pre 若配置网络检索节点：查询配在**该节点**上；结果挂 **`sources.websource`**。
    - **体积**：结果可进合同；可在 **pre 网络检索节点上配置检索结果字段长度 limit**（节点级，非全局死写）。
18. **A6**：~~`basic.search`~~ → **废止**。
19. **A8/A9**：`meta` 最小集：`version`/`scope`/`taskKey`/`subtype`/`taskId` + 选填 `label`。
19. **A10**：可遍历 / 形态靠 `taskKey` + `resolveWarpShape` → `generator`|`group`|`series` **只查表不存 meta**；不强造 `business` 固定主数组键。
20. **B0**：`contractSchema` 首要服务模型理解字段用途（`description`=解读）；basic 可引导用户；Output Prompt=业务+角色+完整合同。
21. **B1**：`taskTemplate.contractSchema` + `prompt`（仅 output）+ `pipeline:{pre,enrich,post}`；可兼容旧 `formSchema`。
22. **B2**：业务 Schema 主要画 basic+business；其余平台约定。
23. **B3**：扁平字段 + **`x-zone`: basic\|business**；未标注默认 business。
24. **B4a**：`enrich_search` **顶层并列**。
25. **B4b**：不需要 `basic.search`。
26. **B4c / B4e · 结果体积**：
    - 检索结果可落合同（`sources.websource`、`enrich_search.result`）。
    - **结果长度 limit** 属**网络检索节点自身配置**（pre / enrich 节点均可有）；**细则延后到「网络检索节点」专题**，本改版对齐不展开节点内部字段。
27. **检索提升产出链路**：
    - pre 网络检索（查询等在节点上）→ `sources.websource`
    - input 用 sources 回填并写 `enrich_search`
    - enrich 联网节点 → `enrich_search.result`
    - output 合用合同 + enrich_search
28. **B5 · Output 如何吃合同**：
    - **完整引入**回填后的合同（含各区与 `enrich_search`），作为产出依据。
    - **不做**字段级插值拼装；**先不压缩**合同。
    - 选用能接受该合同长度的模型（你称可用 100m 量级能力模型）；若后续长度有问题，再考虑压缩其它字段。
    - 业务 `prompt` 仍写角色/业务/交付规范；与「完整合同」一并交给 output。

29. **T · Text 子业务改版（管道 LLM 原子步骤）**（2026-07-22）：
    1. **四档 type（即 taskKey）**：仅 `plan` | `transform` | `expert` | `validation`。废止旧 `format` / `think` / `structure` / `layout`（本分支不兼容映射）。
    2. **入参按 type 钉死**（个数、key、类型）；**subtype 只改 prompt/业务规范**，不得增删改入参 key。同为 expert 的「分镜导演」与「数据科学」入参表相同、prompt 不同。
    3. **固定入参表**：

       | type | 固定入参 |
       |------|----------|
       | `expert` | `contract` + `field_specs` |
       | `plan` | `contract` + `goal` |
       | `transform` | `input` + `instruction` |
       | `validation` | `contract` + `rules` |

    4. **输出**：
       - `expert`：JSON object，键 ⊆ `field_specs` 字段名；用于回填合同 `business`。
       - `plan`：单一 JSON object 外壳；内部 schema 由 subtype prompt 定。
       - `transform`：**不**钉死 string/json；内容格式由 subtype prompt 声明「入什么、出什么」；管道只搬运。
       - `validation`：固定 `{ ok: boolean, errors: string[] }`。
    5. **text 无管道**：Admin 不配 `pipeline`；禁止 text→text 嵌套。多步只在**宿主生成业务**管道里串多个 text 节点。
    6. **text 无合同双区**：Schema/formSchema 由平台按 type **注入固定模板**；Admin 只编 subtype、display、unifiedTemplate/prompt、模型路由。
    7. **管道节点（nestedText）**：
       - 选 `text/{type}/{subtype}`；bindings **只能**绑到该 type 固定 key。
       - **档位 2**：`expert.field_specs` 可平台自动生成（按 business + schema description / 未填字段）；其余 key 显式绑定路径。
       - `outputTarget`：结果写回何处（expert 默认可合并进 `business`）。
    8. **validation 失败**：写入 `errors` + **管道停在当前步骤**（任务不再继续）。
    9. **本分支数据策略**：**C**——本地 `scope=text` **全部清空**，按四档从零重建示范；不做旧业务迁移。

30. **D · 行业日报**（2026-07-23；**人机流修订同日**）：
    1. **宿主**：`writing` / `generator` / `industry-daily`（资讯/行业日报）；一次任务一篇 Markdown（generator）；板块在 `business`，非 group/series。
    2. **basic 字段**（分步采集，见 §31）：
       - `industry` 枚举（金融/娱乐/科技/体育/其他）+ `industry_custom`（其他时）— **pre 交互卡**
       - `date_mode`：today | yesterday | custom；custom 时 `report_date`（YYYY-MM-DD）；时区默认 `Asia/Shanghai` — **亦在 pre 采集**（确认日期后才检索）
       - 选填 `core_topic`（热门 chips 单选 **或完全手写**，可跳过）— **input**
       - `style` 枚举（资讯简报/深度评论/口播播报/社媒短讯/其他）+ `style_custom` — **input**
    3. **人机顺序（修订 · §34 / §35）**：
       ```text
       C 端新建（pre 不建任务）
         → 业务列表
         → pre.interactiveCard（行业 + 报道日期）
         → pre.webSearch 预览（按「行业 + 该日」检索热门话题/要闻；≥5 条；写入合同 sources.websource）
         → input 引导（话题 chips+自定义 / 风格…；不含日期）
         → 任务名 → 确认计价
         → 此刻才 create task（params 已含 basic + sources.websource）
         → 服务端 pre：交互卡若字段已齐则跳过；webSearch 若合同已有 websource 则跳过
         → input → enrich → … → output → post
       ```
       **废止**：pre 内再挂「分步 basic」专用交互卡（与默认 input 重复）；**废止** pre 阶段 `runTaskV2` 建真任务；**废止** 在 input 再问日期。
    4. **pre 趋势查询**：`queryBuilder=industryTrend`（行业 + 该日 YYYY-MM-DD / 今日|昨日 +「热门话题 要闻 头条」）；过滤栏目/媒体名噪声；结果进 `sources.websource`，抽 ≥5 条标题作话题推荐。
    5. **话题推荐**：input 引导中的 `core_topic`（`x-ui: topic-chips`）消费预览/合同 `websource`；点选或自定义。
    6. **input**：回填/补全 basic（话题、风格等；日期已在 pre）+ 写顶层 `enrich_search`。
    7. **enrich**（顺序钉死）：
       1. `webSearch` → `enrich_search.result`
       2. `text/expert/industry-daily-structure`
       3. `text/expert/industry-daily-body`
       4. `manualReview`（json；**output 前**暂停）
    8. **output**：吃完整合同成 Markdown 正文。
    9. **post**：`text/transform/md-polish-daily`。
    10. **business 字段集**：同前（结构导演 vs 论据编剧分责）。

31. **U · 交互卡 + 分步 basic（平台）**（2026-07-23）：
    1. **pre.interactiveCard**：选题/方向 **与日期**（行业日报）；**不要**用交互卡重做整段 basic。
    2. **basic 采集**：归 **input**（话题、风格等；`x-zone: basic` 且非 `x-collect: pre`）。
    3. **日报 v1**：pre = 行业+日期卡 + webSearch（当日热门话题）；input = 话题→风格。
    4. **落地范围**：Admin 管道编辑与 C 端 WritingCreateWizard 同协议。

32. **U · C 端新建任务交互（修订）**（2026-07-23）：
    1. **入口**：打开某 scope「新建」→ **业务列表选择器**（非下拉墙）。
       - 按 **taskKey** 分组；组标题用 `display.taskLabel`。
       - 每项：`subtypeLabel` + **业务描述**（`display.description` / i18n）。
    2. **选中业务后**：按该业务 **pre（不建任务）→ input（basic）** 引导；交互形态对齐大模型对话。
    3. **任务名称**：默认作为引导流的 **最后一问**。
    4. **确认 / 计价 / create**：仅在 input 收齐后；此前不算真任务。
    5. **废止**：一屏 Schema 长表单；pre 阶段建任务再闸门。

33. **U · pre 交互卡消费 webSearch（平台）**（2026-07-23）：
    1. `pre.webSearch` 结果记入合同（默认 `sources.websource`，含 `items[]` + `text`）。
    2. 话题 chips 供 **input** 引导使用（不再要求 pre 第二张交互卡）。
    3. 合同为唯一真相源。

34. **U · pre 不建任务 / basic 归 input（修订）**（2026-07-23）：
    1. pre = 事前准备（方向卡 + 检索推荐），**不** `create task`。
    2. 废止 pre 内「分步 basic」专用交互卡；basic 由默认 input 环节收集。
    3. 真任务在 input（+任务名）齐套并确认后创建；创建时可带上预览得到的 `sources.websource`。
    4. 服务端：交互卡字段已在 params 则跳过闸门；合同已有 websource 则跳过 pre.webSearch。

35. **U · 日报 pre 含日期再检索（修订）**（2026-07-23）：
    1. pre 交互卡必采 **行业 + 日期**（`date_mode` / `report_date`）；input **不再**问日期。
    2. 日期确认后才 `webSearch`：`queryBuilder=industryTrend`（行业 + 该日 + 热门话题/要闻/头条）。
    3. 话题 chips 过滤栏目面包屑、媒体名等噪声（要的是当日热点事件标题）。

## 🚫 废案

- 未对齐臆测：`warp.contractShape` / `seriesKey` / `fromForm` / `spawn` 等。
- 未对齐「完整日报业务包」当规格。
- 管道按业务名写死逻辑。
- input 做角色/高复杂字段。
- 推倒重做全量步骤目录。
- 人工审核单开第六段。
- 「用户填全跳过 input」。
- 两套运行时单据（表单+合同）。
- 启发式分区（已用物理区 + x-zone）。
- `payload` 兼指正文+资源；顶层 `websearch` 结果柜。
- 角色卡整包只进 sources。
- 平台强制 business 统一主数组键。
- generator/group/series 形状重复写入 meta。
- **`basic.search`**（已由 pre 节点配置 + `sources.websource` + `enrich_search` 取代）。
- text 自带五段管道 / text→text 嵌套。
- transform 输出强制 string 或 string\|json 平台二选一钉死。
- 旧 text type 运行时兼容映射（`format→transform` 等）。
- **入口一次交完长 basic 再跑 pre**（已由 §30/§31 人机序取代）。
- pre 内「分步 basic」专用交互卡（与默认 input 重复；见 §34）。
- C 端在 pre 阶段 `create task` 再过闸门（见 §34）。

## ❓ 待对齐队列

### B · 当前

- B 检索与 Output 吃合同已收口；下一题可选：
- **B6**：input 回填时，「完整合同」组装顺序 / 必经校验（可选）
- **B7**：进入业务包示例骨架（仅结构、无臆造业务字段）是否现在要？
- （网络检索节点内部配置 → 专题延后）

### T · Text

- expert 自动 `field_specs` 的精确过滤规则（仅空字段 vs 勾选字段）细则可在实现中按「空/缺失优先」先做

### U · 交互卡 / 分步表单

- ~~`interactiveCard` 节点 JSON 字段细则~~ → 已用 `fields` / `kind` / `skippable`；`applyMapping` 可选
- `x-step` 编号约定与 GSAP 动效强度（可再调）
- C 端首发页面范围（Admin 测试 + Writing 列表闸门已通）

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-07-21 | 开 v2；C→A→B；多轮对齐见正文 |
| 2026-07-21 | B4a：`enrich_search` 顶层并列；检索链路推进 |
| 2026-07-21 | 修复主稿误删；整理 A5/A6 为待与 B4 收口 |
| 2026-07-21 | B4b：取消 basic.search；pre 查询在节点上；结果 → sources.websource |
| 2026-07-21 | B4c：结果可落合同；pre 节点可配结果字段长度 limit |
| 2026-07-21 | B4e：enrich 同为节点级配置；节点细则延后专题 |
| 2026-07-21 | B5：output 完整引入回填合同；不插值、先不压缩 |
| 2026-07-22 | **T**：text 四档、固定入参、无管道/无合同双区、validation 停步、本地清空重建 |
| 2026-07-23 | **D**：行业日报 writing/generator/industry-daily + enrich 双 expert + 审核 + post md-polish |
| 2026-07-23 | **U/D 修订**：pre 交互卡→趋势检索→分步 basic（GSAP）；话题 chips+手写 |
| 2026-07-23 | **U 落地**：后端 queryTemplate + interactiveCard 闸门；前端 WarpGateWizard + Admin 测试续跑 + Writing 审核弹窗 |
| 2026-07-23 | **U C 端**：form-config `createUx=warp-gates`；Writing 新建抽屉不再渲长表单，开任务后进分步闸门 |
| 2026-07-23 | **U C 端修订**：抽屉内 `WritingWarpGuidedCreate`——从行业交互卡 GSAP 起笔，检索中态 → basic-form 连续引导 |
| 2026-07-23 | **U C 端**：写作新建全面废弃长表单；一律「选业务 → 分步填表」（管线闸门 / Schema 步进） |
| 2026-07-23 | **U §32**：C 端新建对齐——列表选业务（按 taskKey）+ 对话式逐步引导 + 任务名最后 + 确认/价格仅收齐后 |
| 2026-07-23 | **U §33**：pre 交互卡可消费同段 webSearch→sources.websource；话题 chips 优先 items[].title + 自定义输入 |
| 2026-07-23 | **U §34**：pre 不建任务；废止 pre「分步 basic」卡；basic 归 input；create 在 input 齐套后 |
| 2026-07-23 | **U §35**：日报 pre = 行业+日期；确认日期后按该日检索热门话题；input 不再问日期；过滤栏目噪声 chips |
| 2026-07-25 | **N**：管线节点必须跨业务可复用；ADR pipeline-reusable-steps；webSearch 插件化
| 2026-07-23 | **命名**：非 text taskKey 统一 `generator`\|`group`\|`series`；Editorial/Gallery/Autocut 仅作英文**显示名**，禁止作 type；见 mxmai_business_naming |
| 2026-07-29 | **C1 修订**：output = 合同→本 scope 主生成接口（写作 LLM / 媒体路由）；`skipOutputLlm` 仅跳文本 LLM；group 遍历在 output；禁止主合成挂 post。见 pipeline skill §2.1 |
