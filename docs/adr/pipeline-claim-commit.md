# ADR: 管道 claim / commit 数据平面

## Status

Accepted (2026-07-30)

## Context

此前对齐：大材料进 `state.evidence`，合同只留结构真源；每步只领取本步需要的字段，产出写回对应路径——**禁止** `${state.contract}` 整包在管道/LLM 间传来传去。

落地曾停在「投喂前再 `buildContractView` 削一刀」，默认仍 `inputMapping.contract = ${state.contract}`，调试与 token 成本仍爆。

## Decision

### 1. 双仓不变

| 仓 | 角色 |
|----|------|
| `state.contract` | 结构真源（basic / business / selection / assets / 检索指针） |
| `state.evidence` | 检索等大材料缓存（按 key） |

### 2. nestedText（尤其 expert）声明式领取

步 `params`：

| 字段 | 含义 |
|------|------|
| `claimPaths` | 字符串数组。从合同领取路径，如 `basic.main_topic`、`selection`、`assets.cards` |
| `evidenceKeys` | 证据仓 key 白名单 |
| `evidenceMaxChars` | 证据包字符预算 |
| `commitPaths` | 可选；产出 JSON 只写回这些 `business.*` 键。缺省= `field_specs[].name` |
| `field_specs` | expert 待填字段（亦作默认 commit 白名单） |

组装给 text 业务的 `contract` **仅为 claim 拼出的迷你合同**，不是整仓拷贝。

### 3. 禁止整包（运行时 · 硬门禁）

- 若配置了非空 `claimPaths`：忽略 `inputMapping.contract = ${state.contract}` 的整包解析，改走 claim。
- 若未配置 `claimPaths` 且 mapping 为整包合同（expert）：**抛错**，要求显式 `claimPaths`（及可选 `evidenceKeys` / `evidenceMaxChars`）。
- 临时逃生：`allowWholesaleContract: true` 时降级为仅 `basic + selection + assets`（仍打 warn），不得默认附带 enrich 全文。
- 新业务 / 日报 enrich expert / `mapSections`：**必须**显式 `claimPaths`。
- **Output Core Skill**：默认 `evidenceMaxChars=0`（成稿消费 business，不重灌检索原文）。

### 3.1 长文 L2/L3

- 平台 step `mapSections`：对 `business.body_sections` 等数组 fan-out nestedText 后 merge。
- 行业日报：structure（claim）→ **mapSections 分段 body** → sidecar 实体/引语 → output 组装；禁止单次 nestedText 交付整本日报。

### 3.2 产出预算策略

- 成稿路径默认 `thinking: disabled`；Agent **工具轮次**才 `adaptive`。
- `finish_reason=length`：关思考重试 → continue 续写 → 再失败才报错。
- `pipelineTrace[].budget` 记录 completion_tokens / had_reasoning / truncated / continued。

### 4. Admin UX

业务管理 → 执行管线 → nestedText：

- **领取字段**、**写回字段**、**证据 key**：多选，选项来自  
  - 合同 schema（`x-zone: basic|business`）  
  - 系统键：`selection` / `assets` / `assets.cards` / …  
  - 证据：`websource` / `enrich_result` / `enrich_supplement` / …

### 5. 首测业务

`writing/generator/industry-daily` 的 `industry-daily-structure` / `industry-daily-body`。

## Consequences

- 管道 step 仍是平台原语；业务差异在 params（对齐 pipeline-reusable-steps）。
- 调试 snapshot 仍可存全仓（Admin debug）；**LLM 入参**只含 claim + 预算内 evidence。
- 旧 bundle 无 claimPaths 时靠降级不立刻全挂；新配置应以 claim 为准。

## Industry-daily 落地（2026-07-30 优化）

- basic 去掉 `topic_count` / `writing_folder_id`；business 去掉 closing / tone_directives / audience_note / 不进成稿内参。
- 语气真源：`basic.analysis_stance`（随 `subjective_analysis`）。
- enrich：主线深搜 + 补充搜后，`queriesFrom=selection.topics` 副线轻搜（`enrich_search.result_side`）；单话题自动跳过。
- structure/body：claim/commit + evidence 含 `enrich_result_side`。
