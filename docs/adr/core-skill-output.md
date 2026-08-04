# ADR: Core Skill（output / text 节点包）

## Status

Accepted (2026-07-29)

## Context

mxm-warp 的 output 与 text 子业务长期以巨石 `unifiedTemplate`（或 group 旁路 `itemManuscript.systemPrompt`）+ 全量合同 JSON 一次 LLM 调用交付。可升级空间薄、token 浪费、Admin 与运行时 Prompt 语义分裂（unifiedTemplate / itemManuscript / nestedText 模板）。

## Decision

1. **编排仍是声明式管道**（Warp `pre → input → enrich → output → post`）。`nestedText` = 按名 invoke 某个 text skill，禁止 output skill 自由发现其它 skill。
2. **LLM 节点能力包**对齐 Anthropic Agent Skill 目录心智，存于 `taskTemplate.extra.skillPack`（虚拟文件树）：
   - `SKILL.md`（可编）
   - `references/*`（可编，**除** `references/contract*`）
   - `scripts/*`（可编，**除** `scripts/invoke-{generator|group|series}.*`）
3. **只读文件**：
   - `references/contract.md`：由 `contractSchema` 生成，仅 Schema 变更时重生。
   - `scripts/invoke-*.mjs`：平台按宿主 `taskKey`（generator / group / series）生成，声明主生成调用方案。
4. **运行时回填合同**属数据平面，注入 executor；不进入可编合同 ref。
5. **垂直切片**：首波仅迁名单内 writing/audio 宿主及 bundle 内相关 text；未迁业务继续 `unifiedTemplate`。
6. **Group**：执笔规范以 Core Skill 的 `SKILL.md` 为真源；`itemManuscript.systemPrompt` 仅作迁移兼容回退。
7. **双平面（全业务适用）**：
   - **文本平面**：Core Skill 拼装 LLM（`SKILL` + `loadReferences` + **合同切片**）。
   - **媒体平面**：生图/视频等 Provider 继续消费 `params.referenceImage` / `referenceImages` 槽（像素通路），**不**经 skill 文本包传二进制。
   - **桥接**：basic 表单的挂卡与参考媒体经 `resolveFolderCardAssets` 写入 params 后，由 `promoteParamsAssetsToContract` 提升到 `contract.assets`：
     - `assets.cards`：文风/风格/角色/知识摘要（`writing_summary` 等）
     - `assets.media`：参考图 URL 摘要（含各 `referenceImages` 槽）
     - `assets.folders`：folder id 可追溯
   - Skill 切片 **必须包含 `assets`**，使写作成稿能读到挂卡；生图仍以媒体平面为准。
8. **UX 约定**：用户上传/选择走 basic 的 `folderCard` / `referenceImages`；Admin 可 schema default 硬写；禁止把图塞进 `rules.md` 当「引入」。
9. **大上下文 / 大产出（Harness，声明式，非自由 Agent）**：
   - **先分清**：`max_tokens` 截断是**输出上限**；输入过大是**上下文**。对策不同。
   - **L0 调参**：nestedText / output 的 `generateParams.maxTokens` 按模型能力配置（M3 可至 64k～128k），避免假性「上下文爆炸」。
   - **L1 减负**：`loadReferences` 条件挂载 + 合同切片 + `assets` 摘要；禁止把全量 websource 原文反复塞进每个 nestedText。
   - **L2 管道拆分（首选 harness）**：大任务拆成多个 **声明式** nestedText / 子 skill（如 structure → 按章 body → assemble），由 Warp enrich 编排；每步只吃本步需要的合同切片。
   - **L3 步内 map**：单步对数组字段（`body_sections[]`、镜头列表）做 **fan-out 子调用 + merge**（平台 step，非模型自规划）。
   - **L4 视频**：时间线按 `chunkSeconds` 分块（已有 timeline 思路）→ 每块 skill → 合并时间轴；素材仍走媒体平面。
   - **不默认**上自由多轮 Agent；仅当 L2/L3 写不全分支时，再给单节点可选 `skillExecMode: assemble | map-sections | agent-tools`。

## Consequences

- Admin「Output Prompt」在切片业务上改为 Core Skill 左树右编。
- `warp-runner` output：有 `skillPack` 时走 skill executor。
- 外部 skill 的 references/scripts 思路可迁入自定义区；任意 shell 不开放。
- 后续 graph/video 迁 Core Skill 时：skill 只产文案/约束；参考图仍走媒体平面 + `assets.media` 摘要可给多模态 LLM（若需要）。
- 视频剪辑上下文更大时，优先 **L2 管道拆分 + L4 分块**，而不是单次 LLM 吃全片。

## 10. 证据缓存（Evidence）与合同真源分离

检索等大块材料**不是**合同永久真源：

| 平面 | 存哪 | 内容 |
|------|------|------|
| 合同 `state.contract` | basic / business / assets / enrich_search.query / 检索**指针** | 结构真源；websource/result 仅 `query/hitCount/digest/evidenceKey` |
| 证据 `state.evidence` | 按 taskId 的 digest + 限长 payload | webSearch 全文摘要；工具步（extractHotTopics）读 payload |
| 持久化 | `businessPipelineState.evidence`（与 warp 暂停续跑同源） | 跨 worker / 人审不丢 |
| LLM 投喂 | `contractView` + `evidencePack`（预算截断） | nestedText / Core Skill；output 默认短证据或不附语料 |

**禁止**再把全量 websource 焊进每个 nestedText 的 `${state.contract}`。

**领取 / 写回（claim / commit）**：nestedText 步应用 `claimPaths` + `evidenceKeys` 显式领取；expert 产出按 `commitPaths` / `field_specs` 白名单写回 business。详见 [`pipeline-claim-commit.md`](./pipeline-claim-commit.md)。

## 11. Admin 调试 · 操作监控室

业务列表「操作 → 调试」打开全屏监控室：`options.adminPipelineDebug=true`，与用户同链路执行，`pipelineTrace[]` 保存每步完整 raw `inputSnapshot` / `outputSnapshot`（硬顶防 jsonb 爆炸）。

## Slice list

见 `mxmcgi/src/tasks/skill/slice.ts`。
