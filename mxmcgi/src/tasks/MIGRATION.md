## Task v2 迁移策略（不影响旧接口）

目标：在旧接口稳定运行的前提下，引入 `/api/v2/tasks/*` 并逐步迁移业务，最终可选择把旧接口变为薄壳代理。

### 0. 原则

- **并行不替换**：v2 新接口与旧的 `/writing`、`/graph`、`/media` 等接口并行存在。
- **scope 固定、taskKey 动态**：代码只认识 `scope`，`taskKey`（以及可选 `subtype`）由 Admin 动态创建。
- **配置缺失即失败**：v2 走严格模式，不做 wtconfigs/prompts.resolver fallback，避免“看似成功其实走默认”的隐性风险。

### 1. 第一阶段：只做写作 outlines 试点

- 在 Admin 中新增一条 `prompt_engineering_config`：`scope=writing, type=<taskKey>`（例如 `writing-outlines`），写入 `extra.taskTemplate`。
- 前端（或 Postman）调用：
  - `GET /api/v2/tasks/form-config?scope=writing&taskKey=<taskKey>`
  - `POST /api/v2/tasks/run` 生成结果并落盘（storage 可先启用 json）。
- 对比旧接口输出（`POST /writing/outline`），验证 prompt 模版变量与 schema 校验行为是否符合预期。

### 2. 第二阶段：扩展到 writing 的其他 taskKey

- 逐步把 `voice-scripts`、`storyboard-scripts`、`articles` 等类型迁移为 v2 的 `taskKey` 配置。
- v2 的执行器仍可复用现有模型路由（`模型通道管理`）机制：`taskKey -> provider+physicalModel`。
- 旧接口不改，业务逐步切换到 v2。

### 3. 第三阶段：扩展到 graph/audio/video

- 为每个 scope 增加 executor（仍然只按 scope 分派，不按 taskKey switch）。
- 引入更多 `pipeline step`（如 graph 的 prompt 拼接、9 宫格规则、图片格式转换）。

### 4. 收口（可选）

- 当某个旧接口的业务全部迁移完成后，可将旧接口实现改为“薄壳代理”，内部转发到 v2 引擎（保持外部兼容）。

---

## 业务线可配置化 checklist（以大纲为例）

将某条业务线接入 Task v2、做到「全链由 TaskTemplate 配置驱动」时，按以下四步检查：

1. **TaskTemplate**
   - 该业务在 DB 中有对应 `prompt_engineering_config`，`extra.taskTemplate` 含：
     - `formSchema`、`prompt.systemTemplate` / `userTemplate` / `outputFormatTemplate`（或 *Markup）；
     - 按需配置 `inputPipeline`（如 `sensitiveCheck`、`knowledgeRetrieve`）。

2. **task-engine**
   - 该 scope 在 `runTaskV2` 中创建任务时：
     - 写入 **`params.useConfiguredPrompt: true`**（仅 v2 写入，不进入 formSchema）；
     - **executeTask 传 `modelName: routingKey`**（如 `writing-outlines`、`writing-articles`、`graph-xxx`），确保由对应 `startXxxTask` 处理；
   - 物理模型在 createTask 时用 `model: routingKey` 记录，实际调用 LLM 时在业务 service 内通过 `selectModelWithRouting` 等解析。

3. **Executor**
   - task-executor 根据 `modelName.startsWith('writing-')` / `graph-` 等分派到 `startWritingTask` / `startGraphTask` 等；保证 routingKey 与现有约定一致即可，无需改分派逻辑。

4. **业务 service**
   - 对应的 `generateXxx`（如 `generateOutline`）在收到 **`params.useConfiguredPrompt === true`** 时：
     - **仅用 `params.prompt`** 调 LLM，不做自建 prompt 拼接；
     - 不在此处再做知识库检索（v2 的 inputPipeline 已执行）；
   - 否则保留原逻辑，兼容老 API（如 `POST /api/v1/writing/outline`）。

**大纲示例**：v2 大纲请求 → task-engine（routingKey + useConfiguredPrompt）→ task-executor → startWritingTask → generateOutline（useConfiguredPrompt 时用 params.prompt）→ 同一套 JSON 解析与落库，前端用 metadata.outline / metadata.text 展示。

