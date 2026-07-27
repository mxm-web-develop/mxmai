# ADR: 管线节点必须跨业务可复用

## Status

Accepted (2026-07-25)

## Context

Task V2 / mxm-warp 管线注册了约 20 个 step。平台意图是 Admin 可配、禁写死业务逻辑（对齐记录 C1/C4），但行业日报能力曾内联进通用节点（尤其 `webSearch.queryBuilder=industryTrend`、`extractHotTopics`、`interactiveCard` 闸门、enrich 查询兜底），导致其它业务难以干净复用。

## Decision

1. **管线 step 是平台原语**。业务差异只允许出现在：
   - 节点 `params` / `fieldMapping` / `when`
   - 命名策略插件（如 `webSearch.queryBuilder`）
   - `formSchema` / `createGuide`
   - `nestedText` 指向的独立 `text/*` 业务
2. **禁止**在 step 实现里 `if (taskKey === …)` / `if (subtype === 'industry-daily')`，或写死某业务字段枚举为唯一路径。
3. **节点分层**：
   - **平台节点**（`webSearch`、`extractHotTopics`、`nestedText`、`manualReview`、`interactiveCard`…）：跨业务复用；参数表完整、Admin 可配。
   - **垂类节点**（`buildSciencePopTimeline`、`albumImageBatch`…）：允许按场景命名，内部仍须策略/`fieldMapping`，禁止再耦合其它业务名。
4. **`queryBuilder` 插件约定**：`webSearch` 核心只做检索 I/O + 通用 params 透传；业务专用拼查询注册为命名 builder（如 `industryTrend`），挂在 `mxmcgi/src/tasks/mxm-warp/query-builders/`。

## Consequences

- 新业务挂 `webSearch` 只需改节点配置，无需改 `web-search-step.ts`。
- Code review：拒绝「仅某业务可用」却挂通用 step 名的 PR。
- Agent 执行面见 `.cursor/skills/mxmai_business_pipeline/SKILL.md`「节点可复用约束」。

## Deferred debt

| 项 | 说明 |
|----|------|
| `interactiveCard` 闸门 | 仍硬编码 `industry`/`date_mode` 依赖；下轮改为 DSL / `x-required-when` |
| `nestedText` 按 textKey 特判 | 视频/图集若干分支；下轮用 params hooks |
| Schema `x-ui-type: webSearch` vs 合同 `webSearch` | 双路径并存，暂不合并 |
