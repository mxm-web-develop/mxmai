## Task v2：业务生成主路径（当前标准）

**唯一推荐入口**：`GET /api/v2/tasks/form-config`、`GET /api/v2/tasks/form-config/list`、`POST /api/v2/tasks/run`，以及任务生命周期 **`GET/DELETE /api/v2/tasks`、`GET /api/v2/tasks/admin`、`POST …/cancel|recover|retry`**（原 `/api/v1/cgi-tasks` 已移除；Gateway 对 `/api/v2/tasks` 已单独代理）。

### 原则

- **scope 固定、taskKey / subtype 由 Admin 动态配置**：运行时通过 `loadTaskDefinition` 读 `prompt_engineering_config` 的 `extra.taskTemplate`。
- **配置缺失即失败**：v2 不做隐性默认业务模板回退（graph 的 rules 亦仅读 DB，见 `getGraphRulesResolved`）。
- **旧 HTTP**：`/api/v1/cgi/graph/*`（mxmcgi `/graph/*`）已 **410 Gone**，客户端须改用 v2；移动端未改动的客户端会收到 410。

### Graph 业务 checklist

1. Admin：`scope=graph`，`type` = `photograph` | `design` | `painting`（即 taskKey），`subtype` = 子业务（如 `portrait`、`taobaonvzhuang-2`）。
2. `extra.taskTemplate`：`formSchema` + `prompt.unifiedTemplate`（或 Markup）。
3. **主 briefing**：以 **`unifiedTemplate`**（及可选 `promptTextTaskKey` 的 text/format）为事实来源；DB **`rules_i18n` 列全 scope 弃用**，仓库写入恒为 `{}`。
4. 若需 text/format 转写最终生图 prompt：`extra.promptTextTaskKey`（如 `text/format/gpt-image-2`）。
5. `graph_scope_config`：解析物理模型与 provider。

### Template 占位符格式注意

`unifiedTemplate` 只支持 `${var}` 和 `{{var}}` 两种占位符。Admin 富文本编辑器（`PromptTempDesigner`）在保存时通过 `parseTemplateMarkup()` 将 HTML `<template>` 标签转为 `${var}`。

**防御机制**：后端 `renderPromptFromTemplate()` 在插值前会自动调用 `sanitizeTemplateTagPlaceholders()` 将残留的 `<template placeholder="var">` 标签转为 `${var}`，防止占位符泄漏导致用户输入丢失。详见 `GRAPH_BUSINESS_CONFIG_AND_SMARTFLOW.md` §3.2.1。

### 写作 / 视频 / 音频

- Web 与网关已统一走 `/api/v2/tasks`；mxmcgi 已移除 `POST /writing/outline`、`POST /writing/generate`、`GET /writing/getformOptions`（裸写作生成请用 v2）。graph 对旧 `/graph` 为 410。
- 详细前置链（敏感词、知识库）：见 [`README_TASK_V2_FIXED.md`](./README_TASK_V2_FIXED.md)。

---

## 业务线可配置化 checklist（Task v2）

将某条业务线接入 Task v2 时：

1. **TaskTemplate**：`prompt_engineering_config.extra` 含完整 `taskTemplate`。
2. **task-engine**：`runTaskV2` 为 `params` 注入 `useConfiguredPrompt: true` 与路由解析得到的 `logicalModel`（见 [`task-engine.ts`](./task-engine.ts)）。
3. **Executor**：`task-executor` 按 `task.type` 分派 `startGraphTask` / `startWritingTask` 等。
4. **业务 service**：`useConfiguredPrompt === true` 时以模板产出为准；graph 的 prompt 生成另受 `promptTextTaskKey` 与 **unifiedTemplate** 约束（见 `graph-service.ts`）。
