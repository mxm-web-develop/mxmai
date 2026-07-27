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
- **先订通用数据面，再订 scope 扩展**；写死债核对完再一起修（见当日笔记）
- **执行模式**：`executionMode: "mxm-warp"`；旧单 core 仍兼容
- **合同**：`state.contract` 为 enrich/output 主输入；通用 mapping 待实现
- 已删：`pipeline-llm-plugin`；产品名钉「知识库」；Web 符号已迁 `KnowledgeBase`/`KnowledgeFolder*`（HTTP 路径仍 virtual-folder-index）

## 运维约定（2026-07-14）
- **改完即部署香港**：用户侧代码/配置改完后，默认同步发布香港主力（`pnpm deploy:hk`）；含 Admin 前端时再跟 `pnpm deploy:admin-china -- --skip-build`。业务 bundle 变更另跑对应 seed（如 `bash scripts/seed-graph-album-production.sh`）。
