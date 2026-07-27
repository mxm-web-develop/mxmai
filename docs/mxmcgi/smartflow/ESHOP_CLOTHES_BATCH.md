# Eshop 服装批量 Smartflow

工作流 ID：`eshop-clothes-batch-v1`（画布常用）/ `eshop-clothes-batch-v2`（同结构，独立 id）

| 版本 | 说明 |
|------|------|
| v1.3.0+ | `start.input[]` 与 `formSchema` 对齐：`referenceImages`、`eshopGarmentBatch`、`number`、`selection` 等；**禁止用 json 代替复杂字段** |
| `_planning_images` | 不在 input[] 中声明，运行页/引擎自动派生 |

## 目标

**1 组模特参考 + N 款服装（每款 1～3 张图）→ N 个 `graph/eshop/clothes` 任务并发创建**

与 Task V2 内 `parallel_count` 的区别：

| 能力 | 说明 |
|------|------|
| `parallel_count` | 同一 SKU、同一 params，多图变体 |
| 本 Smartflow | N 个不同 `garment_images`，各一条独立 Task V2 |

> **LLM 按款规划**：通过 **business 节点**引用 `text/plan/eshop-garment-batch`（须先 `seed:text-plan-eshop-garment-batch`），禁止裸 `model` 节点。

## 前置

```bash
cd mxmcgi && pnpm run seed:graph-eshop-clothes
pnpm run seed:text-plan-eshop-garment-batch
# 同步当前画布用的 v1 到 DB（推荐）
cd mxmcgi && pnpm run seed:eshop-smartflow-batch-v1
# 或 v2
pnpm run seed:eshop-smartflow-batch
```

## Bundle 导入 / 导出

与业务 `mxm-business-bundle` 类似，使用 **`mxm-smartflow-bundle`** JSON：

| 方式 | 命令 / 操作 |
|------|-------------|
| CLI | `pnpm run apply:smartflow-bundle -- *.smartflow.json` |
| 页面 | Smartflow → 导出 bundle / 导入 bundle |
| 规范 | `.cursor/skills/mxmai_smartflow_bundle/SKILL.md` |

## Start 入参

工作流 start 节点支持两种入参声明（**优先 `formSchema`**）：

| 方式 | 运行页 | Open API 文档 |
|------|--------|---------------|
| `formSchema` + `uiSchema` | 与 Task V2 相同的 `SchemaForm`（参考图、枚举、必填） | 与业务发布相同：`fieldHints`、`referenceImageSlots` |
| `input[]`（legacy） | 简易 text/json 表单 | 粗粒度 type 映射 |

本流程 start 节点已配置 `formSchema`（见 `src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json`）。**运行时以 DB 为准**；改 JSON 后须 seed/导入 bundle。开放 API 发布后，第三方调用：

```json
POST /api/v1/open/{slug}/run
{ "input_data": { "model_images": [...], "garments": [...], ... } }
```

文档字段说明与 Graph 页 `graph/eshop/clothes` 语义对齐；body 键为 `input_data` 而非 Task V2 的 `params`。

## Start `input_data` 契约（legacy 索引）

```json
{
  "model_images": [{ "content": "https://...", "type": "main-subject" }],
  "garments": [
    {
      "label": "SKU-A",
      "images": [{ "content": "https://...", "type": "outfits" }],
      "shoot_preset": "beach_sunny_pier",
      "garment_material": "cotton",
      "prompt": ""
    }
  ],
  "model_participation": "default",
  "output_grid": "1x1",
  "shoot_preset_mode": "auto",
  "shoot_preset_fixed": "studio_soft_gray",
  "shoot_preset_fallback": "studio_soft_gray",
  "garment_material_fallback": "use_reference_only",
  "style_images": [],
  "environment_images": [],
  "prompt": ""
}
```

- `_planning_images`：**运行期派生**（Web 表单与 mxmcgi 引擎均会由 `model_images` + 各 SKU 首图组装），**不应**出现在 v2 的 `start.input[]`；Open API 也可自行传入覆盖
- `shoot_preset_mode`：`auto`（LLM 规划 + SKU 可选 override + fallback）或 `fixed`（全部使用 `shoot_preset_fixed`）
- 各 SKU 可选 `shoot_preset` / `garment_material` / `prompt`，优先级：**SKU 手工 > LLM 规划 > 全局回退**

## 节点拓扑

```
start → plan_garments → parse_plan → assemble_tasks → loop_batch → end
              ↳ loop_batch 循环体：run_eshop (business graph/eshop/clothes)
```

- `plan_garments`：business `text/plan/eshop-garment-batch`，传入 `referenceImage={{input._planning_images}}` 与 garments 等
- `parse_plan`：`json_parse`，`source_path: syncResult.text`
- `assemble_tasks`：`map` + `plan_tasks_from: {{parse_plan.parsed.garment_tasks}}`，合并规划与 input
- `loop_batch`：`parallel_iterations: true`，`max_concurrency: 3`，`on_iteration_error: collect_errors`
- `run_eshop`：`item_variable=task`，params 引用 `{{variables.task.*}}`，**必须**配置 `graph` / `eshop` / `clothes`

## 合法枚举

### shoot_preset（26 项）

`studio_white_seamless`, `studio_soft_gray`, `studio_warm_beige`, `studio_concrete_industrial`, `studio_pastel_backdrop`, `studio_dual_tone_corner`, `studio_window_side_light`, `indoor_minimal_loft`, `indoor_luxury_hotel_lobby`, `indoor_cafe_window`, `indoor_art_gallery_white`, `beach_sunny_pier`, `beach_sandy_shoreline`, `beach_golden_sunset`, `coastal_rocky_cliff`, `resort_poolside`, `nature_meadow_park`, `nature_lakeside_promenade`, `nature_forest_dappled`, `urban_street_day`, `urban_street_night`, `urban_rooftop_golden`, `urban_subway_concourse`, `urban_old_alley`, `urban_glass_facade`, `urban_riverside_boardwalk`

### garment_material（21 项）

`use_reference_only`, `cotton`, `cotton_linen`, `linen`, `silk_satin`, `chiffon_georgette`, `denim`, `wool_knit`, `cashmere`, `leather_suede`, `faux_leather`, `mesh_lace`, `tulle_organza`, `velvet`, `corduroy`, `tweed`, `down_puffy`, `functional_shell`, `sequin_embellished`, `synthetic_blend`, `metal_trim`

## 失败回退

| 场景 | 行为 |
|------|------|
| SKU 未指定 shoot_preset | `assemble_tasks` 使用 `shoot_preset_fallback`（fixed 模式用 `shoot_preset_fixed`） |
| SKU 未指定 garment_material | 使用 `garment_material_fallback` |
| 并发过高 | `max_concurrency` 默认 3，可在 Loop 节点调整 |
| 某款 business 失败 | `on_iteration_error: collect_errors`（默认），Loop 仍成功，results 含失败行 |

### Loop 迭代失败策略（`on_iteration_error`）

| 策略 | `results` | Loop 节点 success | 说明 |
|------|-----------|-------------------|------|
| `collect_errors` | 全部 index（含失败） | true | **默认**，适合批量上架 |
| `skip` | 仅成功行 | true | 只关心成功 SKU |
| `fail_fast` | 失败前已完成行 | false | 一款失败整批失败 |

结构化 `loop_batch.output` 示例：

```json
{
  "results": [
    { "index": 0, "success": true, "taskId": "...", "mediaUrls": ["https://.../out.png"] },
    { "index": 1, "success": false, "error": "Sub-graph execution failed" }
  ],
  "total_items": 2,
  "success_count": 1,
  "failed_count": 1,
  "on_iteration_error": "collect_errors",
  "parallel_iterations": true
}
```

> `results` 为结构化行数组（非 business 原始 output）。**graph 等异步业务**：business 节点会等待任务完成并校验 `mediaUrls` 已落库，Loop 成功行含 `mediaUrls`（非仅 taskId）。End 映射 `{{loop_batch.results}}` 即该数组。

## 与 Graph 页单任务区别

- Graph 页：单 SKU 表单，`parallel_count` 做同参变体
- 本 Smartflow：多 SKU 批量，每款独立 taskId，结果在 `loop_batch.output.results` 中查看

## 验收

1. 预组装 1 条 `garment_tasks` → Loop → 1 个 taskId
2. 3 款服装 + 相同模特 → 3 个 task 在相近时间创建
3. 各任务 `requestParams` 含正确 `garment_images` 与全局 `model_images`
