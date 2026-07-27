# 视频剪辑 MVP — 端到端说明 v3

> 与实现对齐：`mxmcgi/src/core/video-edit/` + `text-video-edit-script.business.json`

## 目标流程

```
text/plan/video-edit-script
  → LLM 输出 OpenReel ProjectFile v1.0.0 JSON（含 clip.metadata.mxm*）
  → post manualReview (kind=video-timeline) → 暂停 awaiting_review
  → VideoTimelineReviewModal 编辑时间轴 / 模式 / 素材
  → approve → post nestedVideo (video/edit/render)
  → dispatchVideoEdit → concat → 最终 MP4
```

## 三种渲染模式（mxmRenderMode）

| 模式 | 后端实现 | MVP 说明 |
|------|----------|----------|
| `ai-video-gen` | `runTaskV2Single(scope=video)` Seedance text-to-video | 审核 UI 显示 prompt + 时长 |
| `static-image` | `static-image-renderer.ts` ffmpeg 静帧 hold | 虚拟文件夹选图，**不做 i2v** |
| `gsap-html-animation` | `gsap-renderer.ts` → `GSAP_RENDER_ENDPOINT` | 审核 UI 按段调 `text/plan/gsap-scene` |

## 业务 Bundle

| 业务 | taskKey | 说明 |
|------|---------|------|
| 规划 · 视频剪辑脚本 | `text/plan/video-edit-script` | 主入口，post pipeline 含审核 + nestedVideo |
| 规划 · 科普视频分镜 | `text/plan/science-pop-video-script` | **口播音频驱动**：pre ffprobe 时长 → 分镜 JSON → 审核 → 渲染 |
| 规划 · GSAP 场景 | `text/plan/gsap-scene` | 审核阶段按段生成 HTML+timeline |
| 视频 · 剪辑渲染 | `video/edit/render` | internal dispatcher，provider=internal |

入库：

```bash
cd mxmcgi && pnpm run seed:video-edit-businesses
```

## 审核 API

- `GET /api/v2/tasks/:id/review-draft` — 加载 ProjectFile JSON 草稿
- `POST /api/v2/tasks/:id/approve-review` — `reviewJson` 传完整 ProjectFile
- `POST /api/v2/tasks/:id/review/generate-gsap-scene` — 入参 `clipId`, `brief`, `gateId`

## 前端组件

```
web/src/components/video-timeline-review/
├── VideoTimelineReviewModal.tsx
├── TimelinePanel.tsx
├── SegmentPreview.tsx
├── ClipInspector.tsx
└── useVideoEditScript.ts
```

`ManualReviewModal` 在 `kind === 'video-timeline'` 时分发到专用弹层。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `GSAP_RENDER_ENDPOINT` | — | GSAP 渲染微服务，如 `http://localhost:4010` |
| ffmpeg | PATH | static-image / concat 依赖系统 ffmpeg |

启动 GSAP 渲染服务（可选）：

```bash
cd mxmcgi && npx tsx src/services/gsap-render-server.ts
```

## 本地验收清单

1. `pnpm dev:all-with-web`
2. Admin 确认已 seed（含 `text-science-pop-video-script`）
3. **Text 页**选择「规划 · 科普视频分镜（口播驱动）」
4. 从音频任务选口播 mp3 → 填主题 + 选择剪辑风格/生成方案
5. 提交 → 暂停人工审核 → 时间轴弹层可见
6. 调整段模式/选图/生成 GSAP → 通过审核 → 自动渲染 MP4

## MVP 已知限制

- 时间轴不支持多轨拖拽排序、关键帧编辑器
- GSAP 服务端渲染依赖 Puppeteer 环境
- 无 post 成片二次审核
- `static-image` 仅 ffmpeg hold，未实现 i2v
