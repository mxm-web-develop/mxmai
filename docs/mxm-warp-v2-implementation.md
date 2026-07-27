# mxm-warp v2 实现方案（开发用）

> 依据：`docs/mxm-warp-v2-对齐记录.md`  
> 分支：`feature/mxm-warp-v2`  
> **本路径不要求兼容旧 formSchema / 旧 pre→core→post 心智**；旧业务仍走原 Task V2，直至迁移。

## 启用方式

业务 `extra.executionMode: "mxm-warp"`，且 `taskTemplate` 提供：

- `contractSchema`（扁平字段 + `x-zone`）
- `prompt.unifiedTemplate`（仅 output）
- `pipeline: { pre?, enrich?, post? }`

## 运行时合同

```ts
{
  meta: { version, scope, taskKey, subtype, taskId, label? },
  basic: {},
  business: {},
  sources: { websource?: unknown, /* 知识库条目等 */ },
  assets: {},
  enrich_search: { /* 方案 */ result?: unknown }
}
```

`state.contract` 挂在 TaskContext.state。

## 五段

1. **pre** — 可配步（空则跳过）；联网结果约定写入 `sources.websource`
2. **input** — 按 contractSchema 组装分区；LLM 回填 basic；若 enrich 含 `webSearch→enrich_search`，**必须**写出 `enrich_search.query`（缺则按 basic/sources 合成兜底）
3. **enrich** — 可配步；可写 `enrich_search.result`、专家 text 填 business
4. **output** — 业务 Prompt + **完整合同 JSON**（不插值、不压缩）→ 交付
5. **post** — 可配步

## 代码位置

`mxmcgi/src/tasks/mxm-warp/`

| 文件 | 职责 |
|------|------|
| `contract-types.ts` | 合同类型 |
| `contract-from-schema.ts` | x-zone 分区组装 |
| `unit-series.ts` | taskKey → unit/series 查表 |
| `input-stage.ts` / `output-stage.ts` | 固定段 |
| `warp-runner.ts` | 五段编排；可配段懒加载旧 pipeline registry |
| `llm-adapter.ts` | runByModelKey 适配 |
| `execute-warp-task.ts` | 任务侧一键执行 |

## 接入点

| 入口 | 行为 |
|------|------|
| `task-engine.runTaskV2Single` | `executionMode=mxm-warp`：跳过旧 prelude/插值；text 同步直接跑五段；异步写入 `businessPipelineState.executionMode` |
| `deferred-media-pipeline` | 检测到 warp 则跳过旧 deferred pre（避免 pre 双跑） |
| `writing-task` `generate` | 检测到 warp 则 `executeMxmWarpTask`，不再 `generateWriting` + 旧 post |

## 示例包（未激活）

`mxmcgi/src/tasks/examples/writing-editorial-warp-demo-daily.business.json`

## 网络检索节点（`step: webSearch`）

平台通用节点；业务差异用 `queryTemplate` 或命名 `queryBuilder`（插件），勿改核心 runner。见 ADR `docs/adr/pipeline-reusable-steps.md`。

节点级配置（挂在 `pipeline.pre` / `pipeline.enrich`）：

| params | 含义 |
|--------|------|
| `query` | 固定查询串 |
| `queryTemplate` | 模板插值：`${params.x}` / `${contract.a.b}` |
| `queryFrom` | 从路径取值：`params.topic` / `contract.basic.topic` / `contract.enrich_search.query` |
| `queryBuilder` | 命名策略插件（如 `industryTrend`）；优先于 template |
| `target` | `sources.websource`（默认，pre）或 `enrich_search.result`（enrich） |
| `depth` | `quick` \| `standard` \| `deep` |
| `maxResults` | 条数上限 |
| `resultMaxChars` | 结果文本长度上限 |
| `resultClean` | `true`/`false`/对象：剔低质域名、剥离导航样板、URL 去重；`industryTrend` 默认开启 |
| `dimensions` | 检索维度数组（通用路径；缺省 `news`+`general`） |
| `timeRange` | `day` \| `week` \| `month` \| `year` |
| `startDate` / `endDate` | YYYY-MM-DD 绝对窗（优先于相对 timeRange） |
| `includeDomains` | 域名白名单 |
| `language` | `zh` \| `en` \| `all` |

实现：`mxmcgi/src/tasks/mxm-warp/web-search-step.ts`；`industryTrend`：`query-builders/industry-trend.ts`。
