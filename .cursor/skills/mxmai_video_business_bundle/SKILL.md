---
name: mxmai-video-business-bundle
description: 在 SuperMXMai 中新增或更新 Video 子业务（formSchema + unifiedTemplate + 路由/计费），通过 mxm-business-bundle 导入。适用于短视频、分镜成片、Seedance/Sora 等需走 Task V2（scope=video）的配置化上架。
---

# Video 子业务上架（mxmai）

> **命名规范（必读）**：[`.cursor/skills/mxmai_business_naming/SKILL.md`](../mxmai_business_naming/SKILL.md)  
> video 大分类 taskKey 仅三态：`generator`（创作 / Synthesis）| `group`（编组 / Autocut）| `series`（系列 / Series）。例：`video/group/autocut`。**禁止**再以 `synthesis`/`autocut`/`commercial`/`eshop` 作 **type**（新上架）。`parallel_count` 按业务按需，非默认。

> 架构说明：[`mxmcgi/docs/VIDEO_BUSINESS_CONFIG_AND_SMARTFLOW.md`](../../../mxmcgi/docs/VIDEO_BUSINESS_CONFIG_AND_SMARTFLOW.md)  
> 示例 bundle（无固定模型）：[`mxmcgi/src/tasks/examples/video-short-default.business.json`](../../../mxmcgi/src/tasks/examples/video-short-default.business.json)  
> 淘宝模特展示短片（含可选宫格分镜）：[`video-commercial-eshop-model-show.business.json`](../../../mxmcgi/src/tasks/examples/video-commercial-eshop-model-show.business.json)

> 宫格分镜成片：[`video-storyboard-grid.business.json`](../../../mxmcgi/src/tasks/examples/video-storyboard-grid.business.json)

**可选执行管线**（前置 / 人工审核 / 后置，**非必须**）：视频业务通常 **无 pipeline**；分步编排优先 Smartflow。若单任务内需 pre/post，见 [`.cursor/skills/mxmai_business_pipeline/SKILL.md`](../mxmai_business_pipeline/SKILL.md)。**主渲染 / 主生成接口在 output**（`group` 遍历 clip 亦然）；勿把主成片链长期挂 post。

## 1. 数据落在哪里

| 层级 | 存储 | 作用 |
|------|------|------|
| 任务模板 | `prompt_engineering_config` | `extra.taskTemplate`：`formSchema`、`unifiedTemplate`、`storage` |
| 路由 | `video_scope_config` | `task_key` + `sub_type` → `provider` + `model` |
| 物理模型 | `provider_models` | `model_key`、`upstream_model`、**`protocol`** |
| 计费 | `business_pricing` | `charge_metric: video_seconds` |

## 2. formSchema 建议字段

- `prompt`（必填）
- `duration`（秒，enum 或 min/max，**勿写死 4/8/12**）
- `ratio`、`resolution`、`reference_images`
- `generate_audio`（可选）
- `parallel_count`（**按需**，1～99；非每个 video 业务都要）
- `total_duration_seconds`（计费，隐藏，与 duration 同步）
- `storyboard_grid`（可选，`x-ui-type: gridStoryboardImages`）— 单张宫格源图裁切为多 `reference_images`；模板可插值 `${storyboard_prompt}`

### 宫格分镜字段约定

```json
{
  "storyboard_grid": {
    "type": "object",
    "x-ui-type": "gridStoryboardImages",
    "x-supports-last-frame": true,
    "properties": {
      "enabled": { "type": "boolean" },
      "layout": { "enum": ["2x2", "3x3", "4x4"] },
      "source_image": { "type": "object" },
      "cells": { "type": "array" },
      "first_frame_index": { "type": "integer" },
      "last_frame_index": { "type": "integer" }
    }
  }
}
```

环境变量：`R2_SYSTEMTEMP_BUCKET`（默认 `systemtemp`）、可选 `R2_SYSTEMTEMP_PUBLIC_URL`。

## 3. Admin 必配（本 skill 不 seed 具体模型）

1. **物理模型**：`provider_models`，`scope=video`，设置 `protocol`（如 `prediction_video`、`deer_video_job`）
2. **业务路由**：`video_scope_config`，`(video, taskKey, subtype)` → 上一步的 `model_key`
3. **计价**：`business_pricing`，按秒或按次

## 4. 导入 bundle

```bash
cd mxmcgi
pnpm run apply:bundle -- src/tasks/examples/video-short-default.business.json
```

## 5. 验证

- Web「视频」页：`useTaskV2FormConfig({ scope: 'video' })`
- `POST /api/v2/tasks/run` 返回 `taskId`，完成后 `mediaUrls` 为可播放 URL
- 修改 `video_scope_config` 切换 provider，无需改代码

## 6. Smartflow

- 使用 **business 节点**，`business_scope: video`，不要用已废弃的 `model` + `model_type: video` 直调 `/video/:modelName`
- 短剧示例：`mxmcgi/src/smartflow/examples/short-drama-batch-v1.smartflow.json`
