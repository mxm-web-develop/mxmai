# Claude Code Memory Index

## 参考文档
- [harness-engineering](harness-engineering.md) — Anthropic 长任务 Agent 架构模式

## 任务记录
- [tasks](tasks.md) — 任务追踪

## 日期归档
- [2026-07-20](2026-07-20.md) — mxm-warp 架构、管线写死债
- [2026-07-16](2026-07-16.md)
- [2026-07-14](2026-07-14.md)
- [2026-04-25](2026-04-25.md)
- [2026-04-09](2026-04-09.md)
- [2026-04-08](2026-04-08.md)
- [2026-03-23](2026-03-23.md)
- [2026-03-19](2026-03-19.md)
- [2026-03-10](2026-03-10.md)

## mxm-warp（进行中 · 2026-07-20）

- **阶段**：`pre → input → enrich → output → post`（勿用 taskKey 拼 step 名）
- **数据平面（2026-07-30）**：`claimPaths` / `commitPaths` / `evidenceKeys` 为 nestedText 默认领取写回；禁止整包 `${state.contract}`。ADR：`docs/adr/pipeline-claim-commit.md`。
- **行业日报管线经验（2026-07-31）**：砍掉 enrich 里 structure → mapSections → body 嵌套 LLM，主笔直出后结构明显更好。证据链保留；同质大势检索改为复用 pre 发现池。设计准则写入 `.cursor/skills/mxmai_business_pipeline/SKILL.md` §1.1。
- **行业日报高保真数据（2026-07-31）**：股票/加密/财经 enrich 增 `domainDataQuery` → `enrich_search.market_snapshot`（`cn-market` 免费 A 股指数、CoinGecko、Finnhub）；主笔优先专业源数字，新闻只作事件叙事。评估「未提供篇幅档」是读错 `requestParams.params`，已修 `extractEvalRunContextFromTask`。
- **audio/speak 已清（2026-07-31）**：规范仅 `generator|group|series`。已删 `audio-speak-*` example、seed 入口；`deactivate:legacy-audio-speak` 停业务+禁路由。现行典例：`audio/generator/voice-over-test`、`audio/group/multi-voice`。
- **seek 文风库（2026-07-31）**：48 张笔法卡 `mxmcgi/src/tasks/writing-style-presets/seek-voice-presets.json`；UI 可显示「××式」，`resolveVoiceForModel` 只下发无姓名 craft+自拟参考段。管线：interactiveCard → expandSeekVariants → webSearch → mapSections(`text/transform/seek-voice-stylize`) → 人审 → groupOutput 并发文集。
- **模型思考（2026-07-31）**：成稿 `thinking` 须在业务「模型配置」显性开关（`generateParams.parameters.thinking`）；禁止 provider / catalog 隐式默认。Admin Pricing Tab 有「模型思考」Select；length 关思考重试仍可作恢复手段。
- **执行模式**：`executionMode: "mxm-warp"`；旧单 core 仍兼容
- **合同**：`state.contract` 瘦真源 + `state.evidence` 大材料；LLM 只吃 claim 迷你合同 + 预算内 evidencePack
- 已删：`pipeline-llm-plugin`；产品名钉「知识库」；Web 符号已迁 `KnowledgeBase`/`KnowledgeFolder*`（HTTP 路径仍 virtual-folder-index）

## 运维约定
- **2026-07-14 起**：用户侧代码/配置改完后，默认同步发布香港主力（`pnpm deploy:hk`）；含 Admin 前端时再跟 `pnpm deploy:admin-china -- --skip-build`。业务 bundle 变更另跑对应 seed（如 `bash scripts/seed-graph-album-production.sh`）。
- **2026-07-28 调整**：副机 Admin 停止同步，**不再跑 `pnpm deploy:admin-china`**。Admin 静态仅随香港 `deploy:hk -- --web-only` 发到香港（`mxm-ai.com`）。副机 `8.136.186.242` 仅保留 H5（`pnpm deploy:h5-china` 仍正常）。大陆用户 Admin 入口暂时经香港；如需再开大陆 Admin 边缘，单独评估。
