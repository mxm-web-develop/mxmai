# ADR: writing/group/deck · 结构化 slides IR → PPTX sidecar

## Status

Accepted (2026-08-03)

## Context

需要在 Task V2 `writing/group` 上支持多页强布局 PPT（品牌设计、产品文档等）。外部调研了 [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master)（MIT）：其价值在「受限 SVG 中间语言 + DrawingML 原生深度」，但完整 Skill 绑定 Claude Code 串行手写 SVG，且 `attribution_guard` 阻止整包 fork。

旧草案 [`docs/PPT_PDF_INTEGRATION_DESIGN.md`](../PPT_PDF_INTEGRATION_DESIGN.md)（2026-04）提议独立 `/generation/pptx` + PPT Provider；当前平台已形成 **mxm-warp 五段 + 通用 post step + PDF sidecar**，不宜再平行建一套。

## Decision

1. **业务**：单一 `writing/group/deck`；场景用 `basic.usage_direction` 区分（设计师规范 / 产品宣传手册 / 融资提案 / 课程讲义 / 品牌手册 / 自定义），不拆多 subtype。
2. **合同**：
   - `basic`：使用方向（`usage_direction`）、`source_material`（上传/粘贴）、详细 `brief`；**不**采集演示标题 / 受众 / 设计风格（标题由材料归纳，视觉气质由使用方向推断）
   - `business.slides[]`：group 主列，一页一对象（内容 + `layout_hint` + 轻量 `page_style`）
3. **管线**：
   - pre：双闸门（使用方向+资料 → nestedText 推荐方案 → 选定方案）
   - input：按方案 **确定性** 展开 `slides` 空壳（不 LLM）
   - enrich：至多 2 次 LLM（视觉系统 + `groupItemBatch` 填页）
   - output：`groupOutput` 定稿平台 IR（**禁止** LLM 产出 SVG）
   - post：平台 step **`renderPptx`** → MinIO → `presentationStorage` sidecar（本业务不挂 markdownToPdf）
4. **编译**：独立 **PPTX Compiler 微服务**（FastAPI，默认 `:4010`）异步接收 job，线程池并发编译；`renderPptx` 经 HTTP 提交并轮询下载。未配置 `PPTX_COMPILER_URL` 时本地 spawn CLI 兜底。页内仍按 order 串行写形状。不 vendor ppt-master Skill / attribution_guard。
5. **不**把 PPTX 渲染做成 LLM Provider；不在前端编译 PPTX。

## Consequences

- 新业务只需 bundle + 现有 warp 节点配置；`renderPptx` 跨业务可复用（params 指向 slides 路径）。
- 主产物仍为 Markdown 大纲摘要；**PPTX 为 sidecar**（本业务不默认出 PDF）。
- 页数硬上限与方案闸门控制成本；SVG 串行约束若换引擎时仍适用。

## References

- `.cursor/skills/mxmai_writing_business_bundle/SKILL.md`
- `.cursor/skills/mxmai_business_pipeline/SKILL.md`
- `docs/adr/pipeline-reusable-steps.md`
- repo-intel：`output/2026-08-03-supermxmai/ppt-master-evaluation.md`
