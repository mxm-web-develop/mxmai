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
2. 业务路由仍谈 **scope / taskKey(type) / subtype**；taskKey 双型本意是**合同形状**（单焦点 vs 可遍历），不是难易。
3. **改版推进顺序**：**C（执行引擎）→ A（运行时合同）→ B（业务定义物）**。
4. **业务包 ≠ 运行时合同**。
5. **C1 · 平台固定五段**：`pre → input → enrich → output → post`（可跳过空管道段）。
   - **pre / enrich / post**：Admin 管道可配；**禁止写死业务逻辑**。
   - **input**：按 Schema/`description` **简单回填**；不做角色/高复杂字段。
   - **output**：Admin Prompt（业务理解 + 角色）；吃齐前序数据再生成。
6. **C2**：input 只简单回填；复杂字段交 enrich 的 text(tools)。
7. **检索层次**：pre≈大话题/趋势；enrich≈面向业务内容的深检索。
8. **C3**：复杂 text(tools) 回填主要挂 **enrich**。
9. **C4**：步骤注册表沿用演进 + 阶段推荐用途 + 禁写死。
10. **C5**：空段跳过；失败默认失败任务；人工审核可配在 pre/enrich/post（用末步位置表达 input 前/output 前）。
11. **C6**：不以「用户填全跳过 input」为场景。
12. **A1**：运行时**一份合同**；basic 可问答且作复杂字段背景。
13. **A2**：basic vs 专业字段物理分区；input 填 basic；专业字段 enrich 专家 text。
14. **A3 · 合同顶层**（现行）：

    | 顶层键 | 含义 |
    |--------|------|
    | `meta` | 平台信封 |
    | `basic` | 大方向 |
    | `business` | 业务输出数据字段 |
    | `sources` | 检索沉淀为主（含 pre、知识库等） |
    | `assets` | 静态资源 |
    | `enrich_search` | 深搜工作区（input 写方案；enrich 可写 `result`；output 可读） |

15. **A4**：知识库 `@` 文在 `sources`、图在 `assets`，同一 **`refId`**（优先知识库稳定业务 ID）。
16. **A5 / pre 联网（修订）**：
    - **不需要** `basic.search`。
    - pre 若配置网络检索节点：查询配在**该节点**上；结果挂 **`sources.websource`**。
    - **体积**：结果可进合同；可在 **pre 网络检索节点上配置检索结果字段长度 limit**（节点级，非全局死写）。
17. **A6**：~~`basic.search`~~ → **废止**。
18. **A8/A9**：`meta` 最小集：`version`/`scope`/`taskKey`/`subtype`/`taskId` + 选填 `label`。
19. **A10**：可遍历靠 `taskKey` + unit/series **只查表不存 meta**；不强造 `business` 固定主数组键。
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
- unit/series 重复写入 meta。
- **`basic.search`**（已由 pre 节点配置 + `sources.websource` + `enrich_search` 取代）。

## ❓ 待对齐队列

### B · 当前

- B 检索与 Output 吃合同已收口；下一题可选：
- **B6**：input 回填时，「完整合同」组装顺序 / 必经校验（可选）
- **B7**：进入业务包示例骨架（仅结构、无臆造业务字段）是否现在要？
- （网络检索节点内部配置 → 专题延后）

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
