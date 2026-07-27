# Video 业务配置与 Smartflow

与 [GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md](./GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md) 对齐：Video 仅通过 **Task V2 + Admin 配置** 上架，无 `CGI_VIDEO_MODE`、无代码内写死模型。

## 1. 数据落在哪里

| 层级 | 存储 | 作用 |
|------|------|------|
| 任务模板 | `prompt_engineering_config` | `formSchema` + `prompt.unifiedTemplate` + `storage` |
| 路由 | `video_scope_config` | `task_key` + `sub_type` → `provider` + `model_key` |
| 物理模型 | `provider_models` | `upstream_model` + **`protocol`** |
| 计费 | `business_pricing` | `charge_metric: video_seconds` 等 |

## 2. 推荐入口

| 客户端 | 接口 |
|--------|------|
| Web / Admin 测试 | `POST /api/v2/tasks/run`（`scope=video`） |
| 表单 | `GET /api/v2/tasks/form-config?scope=video&taskKey=...` |
| 移动端（兼容） | `POST /api/v1/cgi/video/generate`（内部转 Task V2） |
| 已废弃 | `POST /api/v1/cgi/video/:modelName` → **410** |

## 3. Provider protocol（Admin 配置）

| protocol | 说明 |
|----------|------|
| `prediction_video` | Atlas 等：generateVideo + prediction 轮询，完成时须返回 HTTPS `mediaUrls` |

### Atlas Seedance 2.0 / 2.0 Mini（单物理模型，三子接口）

Admin `upstream_model` 建议填基座 **`bytedance/seedance-2.0`** 或 **`bytedance/seedance-2.0-mini`**（或任意一种带后缀的路径）；运行时由 `atlascloud/seedance-video.ts` 自动切换：

| 模式 | Atlas endpoint | 触发条件 |
|------|----------------|----------|
| `text-to-video` | `.../text-to-video` | 无参考图 |
| `image-to-video` | `.../image-to-video` | 单张参考图 / `subtype` 含 `i2v` |
| `reference-to-video` | `.../reference-to-video` | 多张参考图、参考视频/音频，或 `subtype` 含 `r2v` |

表单可显式指定 `atlas_video_mode` / `video_mode`：`text-to-video` | `image-to-video` | `reference-to-video`。

| 变体 | upstream 基座 | 说明 |
|------|---------------|------|
| 标准版 | `bytedance/seedance-2.0` | 全画质，支持 4K |
| Mini 经济版 | `bytedance/seedance-2.0-mini` | 约半价（~$0.045/s），业务 `generator/fragment-mini` |

参考：[Seedance 2.0 Image-to-Video](https://www.atlascloud.ai/models/bytedance/seedance-2.0/image-to-video?tab=api) · [Seedance 2.0 Mini](https://www.atlascloud.ai/models/bytedance/seedance-2.0-mini/image-to-video?tab=api)

### 电商上架图动效短片（示例 bundle）

- 业务：`video/commercial/eshop-i2v`
- 定位：**接 graph/eshop 上架静帧**，只做分镜/运镜/品牌表达；**不要求**单独上传模特图或服装 SKU
- **两种输入模式（二选一）**：
  - **单首帧**（默认）：`hero_still_images` → `image-to-video`；Smartflow 上一节点 `mediaUrls[0]` 自动填入
  - **宫格分镜**（可选）：`storyboard_grid` + 单张 2×2/3×3/4×4 源图 → 白缝识别裁切 → `reference-to-video`；模板插值 `${storyboard_prompt}`
- Bundle：`mxmcgi/src/tasks/examples/video-commercial-eshop-model-show.business.json`
- Smartflow（上架图→短片）：`mxmcgi/src/smartflow/examples/eshop-model-video-v1.smartflow.json`

导入后请在 Admin 配置：

1. `provider_models`：`provider=atlascloud`，`upstream_model=bytedance/seedance-2.0`，`protocol=prediction_video`
2. `video_scope_config`：`(commercial, eshop-i2v)` → 上一步 `model_key`
3. `business_pricing`：`charge_metric=video_seconds`

```bash
cd mxmcgi
pnpm run apply:bundle -- src/tasks/examples/video-commercial-eshop-model-show.business.json
```

| protocol | 说明 |
|----------|------|
| `deer_video_job` | Deer Sora 等：job 轮询；无 `video_url` 时 Provider 内调 `/content` |
| `openai_video` | OpenAI videos API |
| `replicate_video` | Replicate prediction |

参数映射见 `mxmcgi/src/core/video/provider-param-map.ts`（`duration` / `reference_images` / `resolution` 等）。

### 宫格分镜图（Grid Storyboard）

任意 Video 业务可在 `formSchema` 增加 `storyboard_grid` 字段（`x-ui-type: gridStoryboardImages`）：

- 用户开启后**仅上传 1 张**宫格/分镜源图，选择 `2x2` / `3x3` / `4x4`
- 服务端在 `startVideoTask` 均匀裁切（`splitGridLayoutImage`），顺序左上→右下
- 裁切块临时上传 R2 **`systemtemp`**（`R2_SYSTEMTEMP_BUCKET`），写入 `reference_images`，强制 `reference-to-video`
- 支持逐格 `purpose` 描述 → 运行时生成 `storyboard_prompt` 供 `unifiedTemplate` 插值
- 可选首帧 / 尾帧格位（`first_frame_index` / `last_frame_index`）
- 任务终态（completed / failed / cancelled）自动删除临时 R2 对象

示例 bundle：`mxmcgi/src/tasks/examples/video-storyboard-grid.business.json`（`video/storyboard/grid-r2v`）

核心代码：`mxmcgi/src/core/video/video-grid-storyboard.ts`

## 4. 运行时链路

```
POST /api/v2/tasks/run
  → task-engine（loadTaskDefinition、resolveVideoModel、计费预检）
  → task-executor → startVideoTask（video-task.ts）
  → runByModelKey(scope=video) → Provider
  → MinIO + 计费
```

## 5. Bundle 导入

示例模板（**不含**固定 routing，需你在 Admin 补 `video_scope_config` + `provider_models`）：

- `mxmcgi/src/tasks/examples/video-short-default.business.json`
- `mxmcgi/src/tasks/examples/video-storyboard-grid.business.json`（宫格分镜）

```bash
cd mxmcgi
pnpm run apply:bundle -- src/tasks/examples/video-short-default.business.json
```

## 6. Smartflow 短剧 MVP

示例流（分镜列表 → 逐镜 video business）：

- `mxmcgi/src/smartflow/examples/short-drama-batch-v1.smartflow.json`

导入后需在 Admin 配置：

1. `writing/storyboard-scripts` + `short-video-storyboard`（或自定义 subtype）
2. `video/short/default`（或你在 start 节点填写的 `video_task_key` / `video_subtype`）的路由与物理模型

## 7. 与 Graph 的差异

| 项 | Graph | Video |
|----|-------|-------|
| 执行入口 | `graph-task.ts` | `video-task.ts` |
| 阶段 | prompt + image | 通常单阶段生成 |
| 计费 | 按张 | 按秒 |
