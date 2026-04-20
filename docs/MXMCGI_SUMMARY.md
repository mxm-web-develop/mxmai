# MXMCGI 模块分析总结报告

> 分析时间：2026-04-09
> 项目路径：`/Users/mxm_pro/Desktop/codes/supermxmai/mxmcgi`

---

## 一、模块完整接口清单

所有接口均通过 `src/index.ts` 统一挂载，以下按路由前缀分组。

### 1.1 `/graph` — 图片生成

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/graph/models` | 获取所有可用图模型列表 | — |
| GET | `/graph/getformOptions` | 获取摄影/设计/绘画类型的表单选项（需 `photograph\|design\|painting` + `type` + `lang`） | — |
| POST | `/graph/photograph` | 生成摄影风格图片（异步任务，含余额预检） | `x-user-id` |
| POST | `/graph/design` | 生成设计图片（异步任务，含余额预检） | `x-user-id` |
| POST | `/graph/painting` | 生成绘画风格图片（异步任务，含余额预检） | `x-user-id` |
| POST | `/graph/:modelName` | 按模型名生成图片（通用异步任务） | `x-user-id` |

**请求参数示例（photograph/design/painting）:**
```json
{
  "type": "portrait|landscape|3d|illustration|...",  // 必需，子类型
  "prompt": "描述文字",                              // 必需
  "aspect_ratio": "1:1|16:9|...",                     // 可选
  "storeToMinio": true,                               // 可选，默认 true
  "storageConfig": { "bucket": "...", "pathTemplate": "..." }
}
```

**返回格式：**
```json
{
  "success": true,
  "data": {
    "taskId": "task_xxx",
    "status": "pending",
    "createdAt": "2026-04-09T..."
  }
}
```

---

### 1.2 `/audio` — 音频生成

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/audio/models` | 获取可用音频模型列表 | — |
| POST | `/audio/:modelName` | 按模型名生成音频（异步任务） | `x-user-id` |

---

### 1.3 `/video` — 视频生成

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/video/models` | 获取可用视频模型列表 | — |
| GET | `/video/getformOptions` | 获取视频表单选项（支持 `mode=sora-2\|sora-2-deer`） | — |
| POST | `/video/generate` | 统一视频生成入口（chunk 分镜模式） | `x-user-id` |
| POST | `/video/:modelName` | 按模型名生成视频（异步任务，支持 Runway 图片/视频转视频） | `x-user-id` |

---

### 1.4 `/upload` — 文件上传

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| POST | `/upload/temp` | 上传临时文件到 MinIO，返回访问 URL | `x-user-id` |
| POST | `/upload/assets` | 上传用户资产文件到 MinIO | `x-user-id` |

---

### 1.5 `/api/v1/cgi-tasks` — CGI 任务管理（核心）

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| POST | `/api/v1/cgi-tasks` | 创建异步任务（通用，支持 text/image/video/audio） | `x-user-id` |
| GET | `/api/v1/cgi-tasks` | 查询当前用户任务列表（支持分页、状态/类型过滤） | `x-user-id` |
| GET | `/api/v1/cgi-tasks/:taskId` | 查询单个任务详情（含角色信息解析） | `x-user-id` |
| DELETE | `/api/v1/cgi-tasks/:taskId` | 删除任务（普通用户软删除，Admin 硬删除） | `x-user-id` |
| POST | `/api/v1/cgi-tasks/:taskId/cancel` | 取消任务 | `x-user-id` |
| POST | `/api/v1/cgi-tasks/:taskId/recover` | 恢复卡住的任务（仅 processing 状态） | `x-user-id` |
| POST | `/api/v1/cgi-tasks/:taskId/retry` | 重试失败任务 | `x-user-id` |
| GET | `/api/v1/cgi-tasks/admin` | Admin：查询所有用户任务（支持更多过滤条件） | Admin |
| GET | `/api/v1/cgi-tasks/by-user/:userId` | 按用户 ID 查询任务列表 | Admin |

**查询参数（列表）：**
- `type`: `text|image|video|audio`
- `status`: `pending|queued|processing|completed|failed|cancelled`
- `model`: 模型名
- `limit` / `offset`: 分页
- `startDate` / `endDate`: 时间范围

---

### 1.6 `/system` — 系统管理

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/system/admin/stats` | Admin：系统统计（用户数、任务数、每日趋势、Top 用户） | Admin |
| GET | `/system/prompt-config` | 获取提示词配置列表 | — |
| POST | `/system/prompt-config` | 创建提示词配置 | Admin |
| PUT | `/system/prompt-config/:id` | 更新提示词配置 | Admin |
| DELETE | `/system/prompt-config/:id` | 删除提示词配置 | Admin |
| GET | `/system/admin/providers/routing` | 查看/编辑 Provider 路由配置 | Admin |
| GET | `/system/admin/providers/stats` | Provider 使用统计 | Admin |
| GET | `/system/admin/providers/billing` | Provider 账单查询 | Admin |
| POST | `/system/admin/providers/test` | 测试 Provider 连通性 | Admin |
| GET | `/system/admin/providers/config-options` | 获取 Provider 可选模型列表 | Admin |

---

### 1.7 `/media` — 媒体内容访问

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/media/graph/:taskId` | 通过任务 ID 获取生成的图片（直接返回图片二进制） | `x-user-id` |
| GET | `/media/video/:taskId` | 通过任务 ID 获取生成的视频 | `x-user-id` |
| GET | `/media/audio/:taskId` | 通过任务 ID 获取生成的音频 | `x-user-id` |
| GET | `/media/music/:taskId` | 通过任务 ID 获取生成的音乐（与音频相同形态） | `x-user-id` |
| GET | `/media/writing/:taskId` | 通过任务 ID 获取写作内容（支持 Markdown/TXT/PDF） | `x-user-id` |
| PUT | `/media/writing/:taskId` | 更新写作内容（支持大纲 JSON 更新 / 文本覆盖 / MinIO 存储覆盖） | `x-user-id` |
| GET | `/media/asset` | 通过 bucket + key 访问用户上传资源 | `x-user-id` |

---

### 1.8 `/knowledge` — 知识库管理

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| POST | `/knowledge/bases` | 创建知识库 | `x-user-id` |
| GET | `/knowledge/bases` | 列出知识库（默认返回用户私有 + 所有公开知识库） | `x-user-id` |
| GET | `/knowledge/bases/:id` | 获取知识库详情（支持 ID 或 name） | — |
| PUT | `/knowledge/bases/:id` | 更新知识库 | `x-user-id` |
| DELETE | `/knowledge/bases/:id` | 删除知识库 | `x-user-id` |
| POST | `/knowledge/bases/:id/upload` | 上传文件到知识库（同步，适合中小文件，最多10个） | `x-user-id` |
| POST | `/knowledge/bases/:id/upload-task` | 上传文件到知识库（异步大文件任务） | `x-user-id` |
| GET | `/knowledge/bases/:id/documents` | 列出知识库文档（含 chunk 统计、embedding 状态） | `x-user-id` |
| GET | `/knowledge/bases/:id/detail` | 获取知识库详细信息（含文件分组、chunk 详情） | `x-user-id` |
| POST | `/knowledge/bases/:id/search` | 搜索知识库（支持 hybrid / vector / keyword 模式） | `x-user-id` |
| DELETE | `/knowledge/documents/:id` | 删除单个文档 chunk | `x-user-id` |
| DELETE | `/knowledge/bases/:id/files/:fileId` | 删除知识库中某个文件的所有 chunks | `x-user-id` |
| GET | `/knowledge/admin/public-bases` | Admin：列出所有公开/内置公用知识库 | Admin |
| GET | `/knowledge/admin/defaults` | Admin：列出所有默认知识库绑定 | Admin |
| PUT | `/knowledge/admin/defaults` | Admin：设置默认知识库 | Admin |
| DELETE | `/knowledge/admin/defaults/:scope/:category/:subType` | Admin：移除默认知识库绑定 | Admin |

---

### 1.9 `/writing` — 写作/文章生成

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/writing/models` | 获取可用 LLM/写作模型列表 | — |
| POST | `/writing/completion/:modelName` | 按模型名直接生成（支持流式 `outputFormat=stream`） | `x-user-id` |
| POST | `/writing/outline` | 生成写作大纲（支持流式和异步任务两种模式） | `x-user-id` |
| POST | `/writing/generate` | 生成文章（支持流式和异步任务，默认异步） | `x-user-id` |
| POST | `/writing/suno/lyrics` | 通过 DeerAPI 提交 Suno 歌词生成任务 | `x-user-id` |
| POST | `/writing/sync-to-task` | 将 stream 生成的文本同步到任务系统 | `x-user-id` |
| GET | `/writing/document` | 读取 MinIO 中的写作文档 | `x-user-id` |
| GET | `/writing/getformOptions` | 获取写作类型的表单选项 | — |

---

### 1.10 `/api/v1/characters` — 角色管理

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/api/v1/characters` | 获取角色列表（支持分类/标签/搜索过滤） | `x-user-id` |
| POST | `/api/v1/characters` | 创建角色 | `x-user-id` |
| GET | `/api/v1/characters/:id` | 获取角色详情（含媒体 URL） | `x-user-id` |
| PUT | `/api/v1/characters/:id` | 更新角色 | `x-user-id` |
| DELETE | `/api/v1/characters/:id` | 删除角色 | `x-user-id` |
| POST | `/api/v1/characters/:id/link-image-task` | 关联图片任务到角色 | `x-user-id` |
| POST | `/api/v1/characters/:id/link-audio-task` | 关联音频任务到角色 | `x-user-id` |
| POST | `/api/v1/characters/save-from-writing` | 从写作任务保存角色到角色库 | `x-user-id` |
| POST | `/api/v1/characters/save-from-outline` | 从大纲保存角色到角色库 | `x-user-id` |
| POST | `/api/v1/characters/generate` | 使用 LLM 批量生成角色 | `x-user-id` |

---

### 1.11 `/api/v2/tasks` — Task V2 任务系统

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/api/v2/tasks/form-config` | 获取 Task 表单配置（scope/taskKey/subtype） | — |
| GET | `/api/v2/tasks/form-config/list` | 列出当前 scope 下所有 taskKey/subtype 组合 | — |
| POST | `/api/v2/tasks/run` | 运行 Task V2 任务 | `x-user-id` |
| GET | `/api/v2/tasks/definitions` | 列出所有任务定义 | — |

---

### 1.12 `/api/v1/smartflows` — Smartflow 工作流

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/api/v1/smartflows` | 获取 Smartflow 列表（支持 public/userId 过滤） | — |
| GET | `/api/v1/smartflows/:id` | 获取单个 Smartflow 详情 | — |
| POST | `/api/v1/smartflows` | 创建 Smartflow（含 schema 校验） | `x-user-id` |
| PUT | `/api/v1/smartflows/:id` | 更新 Smartflow（含 schema 校验） | `x-user-id` |
| DELETE | `/api/v1/smartflows/:id` | 删除 Smartflow | `x-user-id` |
| POST | `/api/v1/smartflows/:id/execute` | **执行 Smartflow**（`input_data` + `mode=test\|run`） | `x-user-id` |

---

### 1.13 `/api/v1/smartflow-tasks` — Smartflow 执行管理

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| GET | `/api/v1/smartflow-tasks` | 获取执行记录列表（支持 smartflowId 过滤） | `x-user-id` |
| GET | `/api/v1/smartflow-tasks/:id` | 获取执行详情 | `x-user-id` |
| POST | `/api/v1/smartflow-tasks/:id/cancel` | 取消执行 | `x-user-id` |

---

### 1.14 `/demo` — Smartflow Demo 接口

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| POST | `/demo/photography-analysis-v2` | 执行摄影风格分析 V2 Demo（模拟返回，非真实 AI 调用） | — |

---

## 二、当前已实现的业务功能

### ✅ 已上线可用

| 功能模块 | 状态 | 说明 |
|----------|------|------|
| 图片生成（Graph） | ✅ 上线 | photograph / design / painting 三大类型，异步任务，含余额预检 |
| 视频生成（Video） | ✅ 上线 | Sora 2 / Runway，支持 chunk 分镜生成，异步任务 |
| 音频生成（Audio） | ✅ 上线 | 异步任务，支持 PPIO 等 provider |
| 写作/文章生成 | ✅ 上线 | outline / generate 双模式，支持流式输出 |
| Suno 歌词生成 | ✅ 上线 | 通过 DeerAPI 提交歌词生成任务 |
| 角色管理（Character） | ✅ 上线 | CRUD + 图片/音频任务关联 + LLM 生成 |
| 知识库（Knowledge） | ✅ 上线 | 完整 KB CRUD、文档上传、向量搜索、默认绑定 |
| 文件上传 | ✅ 上线 | MinIO 存储，支持临时文件/资产文件 |
| 媒体访问 | ✅ 上线 | 按 taskId 访问图片/视频/音频/写作内容 |
| CGI 任务管理 | ✅ 上线 | 创建/查询/取消/恢复/重试/删除 |
| Task V2 系统 | ✅ 上线 | 表单配置驱动的任务定义系统 |
| Smartflow | ✅ 上线 | CRUD + 执行引擎（已实现7种节点类型） |
| 系统管理 | ✅ 上线 | Admin 路由配置/统计/账单，Provider 连通性测试 |
| 余额预检 | ✅ 上线 | 写作/图片生成前自动检查用户余额 |
| 敏感词检查 | ✅ 上线 | 各业务线（写作/图片/角色/Suno）均有部署 |

### 🚧 开发中 / 部分实现

| 功能 | 状态 | 说明 |
|------|------|------|
| Smartflow Model 节点 - video / sound | 🚧 部分 | `executeImageModel` / `executeTextModel` / `executeEmbeddingModel` 已实现，video 和 sound 模型类型尚未实现 |
| Smartflow Tools 节点 - Python 代码执行 | 🚧 部分 | `code_executor` 仅支持 Node.js，Python 需要额外运行时 |
| Smartflow 流式执行 | 🚧 规划中 | 当前为同步执行，无流式 SSE 支持 |
| Smartflow 多轮对话 | 🚧 规划中 | 仅有 `conversation_id` 字段，尚无多轮状态管理 |
| Provider 多模型路由 | 🚧 完善中 | 通过 `provider_model_catalog` 动态驱动，但部分路由仍硬编码 fallback |
| 写作内容 Base64 压缩存储 | 🚧 已用 | `PUT /media/writing/:taskId` 中有 base64 检测逻辑，但非强制压缩 |

---

## 三、Smartflow 开发进度

### 3.1 已实现的节点类型

| 节点类型 | Type Key | 实现文件 | 状态 |
|----------|----------|----------|------|
| 开始节点 | `start` | `executors/startExecutor.ts` | ✅ 完整 |
| 结束节点 | `end` | `executors/endExecutor.ts` | ✅ 完整 |
| 业务节点 | `model` | `executors/modelExecutor.ts` | ✅ 部分（text/image/embedding 可用，video/sound 未实现） |
| 工具节点 | `tools` | `executors/toolsExecutor.ts` | ✅ 基本完整（5种工具） |
| 条件判断节点 | `condition` | `executors/conditionExecutor.ts` | ✅ 完整 |
| 变量节点 | `variable` | `executors/variableExecutor.ts` | ✅ 完整（6种操作） |
| 循环节点 | `loop` | `executors/loopExecutor.ts` | ✅ 完整（2种模式） |

### 3.2 各节点详解

#### Start 节点
定义工作流输入接口，将 `input_data` 注入执行上下文。

```json
{
  "id": "start",
  "type": "start",
  "name": "开始",
  "input": [
    { "name": "photography_type", "type": "text", "content": "" },
    { "name": "style", "type": "text", "content": "classical" }
  ],
  "expected_outputs": [
    { "type": "text", "name": "final_prompt", "required": true }
  ],
  "smartflow_name": "工作流名称"
}
```

#### Model 节点（业务节点）
调用 AI 模型生成内容。

```json
{
  "id": "analyze_cultural_style",
  "type": "model",
  "name": "分析古典风格",
  "model_type": "text",        // text | image | embedding | video | sound
  "model": "gpt-5-nano",
  "prompt": "请分析以下信息：\n用户所在地：{{input.location}}\n...",
  "params": {
    "temperature": 0.7,
    "max_tokens": 1500
  }
}
```

**model_type 支持情况：**
- `text` ✅ — 调用 `mxmCGIHttpClient.textGeneration()`
- `image` ✅ — 调用 `mxmCGIHttpClient.imageGeneration()`
- `embedding` ✅ — 调用 `mxmCGIHttpClient.embeddingGeneration()`
- `video` 🚫 — 返回 `not yet implemented` 错误
- `sound` 🚫 — 返回 `not yet implemented` 错误

#### Tools 节点
执行外部工具调用。

```json
{
  "id": "web_search_node",
  "type": "tools",
  "name": "网络搜索",
  "tool_type": "web_search",   // web_search | web_scraper | embedding | http_request | code_executor
  "tool_params": {
    "query": "{{input.query}}",
    "num_results": 5
  }
}
```

| tool_type | 功能 | 备注 |
|-----------|------|------|
| `web_search` | 网络搜索 | 实际调用 `mxmCGIHttpClient.textGeneration('search', ...)` |
| `web_scraper` | 网页内容提取 | 原生 fetch + HTML 解析，支持 text/links 策略 |
| `embedding` | 向量嵌入 | 调用 `mxmCGIHttpClient.embeddingGeneration()` |
| `http_request` | HTTP 请求 | 支持 GET/POST/PUT/PATCH |
| `code_executor` | 代码执行 | 仅 Node.js（`vm` 模块），Python 不可用 |

#### Condition 节点
条件分支，if/else-if/else 结构。

```json
{
  "id": "check_length",
  "type": "condition",
  "name": "长度检查",
  "if": "{{input.count}} > 10",      // 条件表达式
  "then": "node_id_for_true",        // 满足条件时跳转节点 ID
  "else_if": [
    { "condition": "{{input.count}} > 5", "then": "node_for_medium" }
  ],
  "else": "node_id_for_false"
}
```

条件表达式支持 `{{variable.path}}` 变量引用。

#### Variable 节点
数据抽离、转换、聚合（6种操作）。

```json
{
  "id": "extract_title",
  "type": "variable",
  "name": "提取标题",
  "operation": "select",            // select | assign | map | filter | reduce | merge
  "source_node": "generate_prompt",
  "source_path": "output.title",
  "output_name": "article_title",
  "default_value": "未命名"
}
```

| operation | 功能 | 示例 |
|-----------|------|------|
| `select` | 从上游节点提取字段 | `source_node` + `source_path` 指向目标数据 |
| `assign` | 直接赋值，支持表达式 | 可用 `expression` 字段执行 JS 表达式 |
| `map` | 对数组每个元素做映射 | `expression` 如 `item.title`，自动 `item`/`index` 可用 |
| `filter` | 对数组过滤 | `expression` 如 `item.price > 100` |
| `reduce` | 数组累积操作 | `expression` 如 `accumulator + item.value`，需指定 `initial_value` |
| `merge` | 合并多个源数据 | 合并 `source_node` 输出 + `source_path` + `iterable` 列表 |

#### Loop 节点
循环迭代（2种模式）。

```json
{
  "id": "process_items",
  "type": "loop",
  "name": "处理列表",
  "loop_mode": "iteration",         // iteration | loop
  "iterable": "{{input.items}}",
  "item_variable": "item",           // 循环变量名
  "index_variable": "idx",           // 索引变量名
  "loop_nodes": ["node1", "node2"], // 子图中要执行的节点 ID 列表
  "collect_output": true,
  "output_variable": "results",
  "break_condition": "{{item.price}} < 0",
  "max_iterations": 100
}
```

| loop_mode | 说明 |
|-----------|------|
| `iteration` | `for item in list` 模式，遍历 `iterable` 数组 |
| `loop` | `while condition` 模式，根据条件表达式循环 |

**循环子图执行机制：** 从 `loop_nodes` 数组中按顺序执行子节点，构建临时邻接表，调用 `ExecutorFactory` 逐个执行。

#### End 节点
输出映射与验证。

```json
{
  "id": "end",
  "type": "end",
  "name": "结束",
  "output_mapping": {
    "final_prompt": "{{generate_final_prompt.output.text}}",
    "metadata": "{{start.output}}"
  },
  "validate_outputs": true,
  "nullable_outputs": ["metadata"]
}
```

### 3.3 测试模式 vs 运行模式

`POST /api/v1/smartflows/:id/execute` 请求体：

```json
{
  "input_data": { ... },
  "mode": "run",           // "test" | "run"（目前代码中 mode 参数被接收但未实际区分处理）
  "conversation_id": "..."
}
```

**当前实现说明：**
- `mode` 参数在路由层被接收并传入 `engine.execute()`，但实际 `SmartflowEngine.execute()` 内部目前对 `test` 和 `run` 模式**没有做区分处理**（两者行为相同）
- 两种模式的区别主要体现在**使用场景语义**上：
  - `test`（测试）：用于调试，开发者验证工作流逻辑
  - `run`（运行）：正式执行，可能关联计费/日志等
- Demo 接口 `/demo/photography-analysis-v2` 返回模拟数据，不触发真实 AI 调用

**执行仓储支持双实现：**
- `InMemorySmartflowExecutionRepository` — 仅内存，重启丢失，适合开发调试
- `SupabaseSmartflowExecutionRepository` — 持久化到 `smartflow_executions` 表，默认使用

### 3.4 预定义工作流

目前仅有 **1 个**预定义工作流：

| ID | 名称 | 节点数 | 状态 |
|----|------|--------|------|
| `photography-analysis-v2` | 摄影风格分析与Prompt生成 V2 | 6个（start → 3个model → end） | ✅ 已激活 |

该工作流分析用户文化背景 → 找类似摄影师 → 分析暖色调人像 → 生成最终 AI 摄影 Prompt，全链路使用 `gpt-5-nano` 模型。

---

## 四、数据库表设计

### 4.1 `cgi_tasks`（CGI 任务主表）

**路径：** `mxmcgi.sql` → `mxmdata/src/database/schemas/mxmcgi.sql`

```sql
CREATE TABLE cgi_tasks (
  id              VARCHAR(64) PRIMARY KEY,          -- 任务 ID（如 task_xxx）
  user_id         VARCHAR(64) NOT NULL,             -- 用户 ID
  task_type       VARCHAR(50) NOT NULL,             -- text|image|video|audio|writing|...
  model_name      VARCHAR(100) NOT NULL,             -- 模型名称
  model_provider  VARCHAR(50),                      -- replicate|ppio|deerapi|...
  status          VARCHAR(50) DEFAULT 'pending',    -- pending|queued|processing|completed|failed|cancelled|network_error
  progress        INTEGER DEFAULT 0,                -- 0-100
  error_message   TEXT,
  input_data      JSONB NOT NULL,                    -- 完整输入参数
  prompt          TEXT,                             -- 提示词（快速查询用）
  output_data     JSONB,                            -- 生成结果 { mediaUrls, metadata }
  result_format   VARCHAR(20) DEFAULT 'base64',     -- base64 | minio
  storage_info    JSONB,                            -- MinIO 存储信息 { keys, bucket, urls }
  metadata        JSONB,                            -- 扩展元数据（storeToMinio/label/idempotencyKey 等）
  queued_at       TIMESTAMP,
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  deleted_at      TIMESTAMP                        -- 软删除标记
);
```

**索引：** `user_id`, `status`, `task_type`, `model_name`, `created_at`, `(user_id, status)`

---

### 4.2 `generation_tasks`（旧版生成任务通知表）

**路径：** `mxmnotify.sql` → `mxmdata/src/database/schemas/mxmnotify.sql`

> ⚠️ **注意：** 此表为遗留/通知系统使用，当前代码主流使用 `cgi_tasks` 作为任务存储。

```sql
CREATE TABLE generation_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  task_type    VARCHAR(50) NOT NULL,              -- graph | text
  model_name   VARCHAR(100) NOT NULL,
  status       VARCHAR(50) DEFAULT 'pending',
  prompt       TEXT NOT NULL,
  params       JSONB,
  result       JSONB,                             -- { image_urls } 或 { text }
  error_message TEXT,
  started_at   TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
```

---

### 4.3 `notifications`（通知表）

**路径：** 同 `mxmnotify.sql`

```sql
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  task_id    UUID REFERENCES generation_tasks(id),
  type       VARCHAR(50) NOT NULL,               -- task_completed|task_failed|system
  title      VARCHAR(255) NOT NULL,
  content    TEXT,
  data       JSONB,
  is_read    BOOLEAN DEFAULT false,
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 4.4 `smartflows`（工作流定义表）

**路径：** `mxmagent_smartflow.sql`

```sql
CREATE TABLE smartflows (
  id          VARCHAR(255) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  icon        VARCHAR(500),
  tags        TEXT[],
  schema      JSONB NOT NULL,                   -- { nodes: [], edges: [], settings: {} }
  status      VARCHAR(20) DEFAULT 'draft',       -- draft|active|inactive|deprecated
  version     VARCHAR(50) DEFAULT '1.0.0',
  author_id   VARCHAR(255),
  is_public   BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

**schema JSONB 结构：**
```json
{
  "version": "2.0.0",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "name": "开始",
      "input": [...],
      "expected_outputs": [...],
      "position": { "x": 100, "y": 100 }
    }
  ],
  "edges": [
    { "from": "node_a", "to": "node_b", "when": "condition", "type": "conditional" }
  ],
  "variables": {},
  "settings": {
    "timeout": 120,
    "retry_count": 1,
    "error_handling": "continue"
  }
}
```

---

### 4.5 `smartflow_executions`（工作流执行实例表）

**路径：** `mxmagent_smartflow.sql`

```sql
CREATE TABLE smartflow_executions (
  id             VARCHAR(255) PRIMARY KEY,
  smartflow_id   VARCHAR(255) NOT NULL,
  conversation_id VARCHAR(255),
  user_id        VARCHAR(255) NOT NULL,
  status         VARCHAR(20) DEFAULT 'pending',  -- pending|running|completed|failed|cancelled
  progress       INTEGER DEFAULT 0,
  input_data     JSONB DEFAULT '{}',
  output_data    JSONB,
  error_message  TEXT,
  flow_chain     JSONB,                          -- 节点执行链
  started_at     TIMESTAMP,
  completed_at   TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);
```

**flow_chain JSONB 结构示例：**
```json
[
  {
    "node_id": "analyze_cultural_style",
    "node_name": "分析古典风格",
    "node_type": "model",
    "state": "completed",
    "input": { "location": "中国", ... },
    "output": { "text": "..." },
    "timestamp": 1712659200000,
    "duration": 1500
  }
]
```

---

### 4.6 `knowledge_bases` / `knowledge_base_documents`（知识库表）

**路径：** `knowledge_base.sql`

| 表名 | 用途 |
|------|------|
| `knowledge_bases` | 知识库基本信息、配置、统计 |
| `knowledge_base_documents` | 文档 chunks，含 content / embedding 向量 |
| `knowledge_base_defaults` | scope/category/sub_type → knowledge_base_id 的默认绑定 |
| `provider_models` | 动态模型注册（支持启用/禁用/路由覆盖） |
| `provider_routing` | 业务维度（scope+type）→ provider/model 的路由规则 |
| `provider_api_keys` | 各 provider 的 API Key 管理 |
| `provider_usage` | 调用量记录（用于计费和统计） |
| `provider_balances` | 各 provider 账户余额 |

---

## 五、关键待解决问题

### 5.1 Smartflow Model 节点 — video / sound 类型未实现

`modelExecutor.ts` 中 `executeTextModel` / `executeImageModel` / `executeEmbeddingModel` 已实现，但 video 和 sound 返回 `not yet implemented` 错误。

**影响：** 无法构建含视频生成或语音生成的 Smartflow 工作流。

**建议：** 参考 `videoGenerate` 服务和 `audio` 路由实现，在 `ModelExecutor` 中补充 video/sound 的 provider 调用逻辑。

---

### 5.2 Smartflow Tools — Python 代码执行不可用

`code_executor` 仅支持 `nodejs`（通过 Node.js 内置 `vm` 模块），Python 代码执行返回错误。

**建议：** 如需 Python 运行时，考虑引入 `child_process.spawn('python3', ...)` 或独立的 Python WASM 环境（如 Pyodide）。

---

### 5.3 Smartflow test / run 模式未区分

`POST /api/v1/smartflows/:id/execute` 中 `mode` 参数被接收但未实际区分处理。

**建议：** 在 `SmartflowEngine.execute()` 中根据 mode 决定：
- `test`：不写数据库（仅内存）、不触发计费、可返回 mock 数据
- `run`：完整持久化、触发计费、写入 `provider_usage`

---

### 5.4 generation_steps / media_assets 表不存在

需求文档或早期规划中提到的 `generation_steps`（任务步骤表）和 `media_assets`（媒体资产表）在当前数据库中不存在。`cgi_tasks` 表通过 `output_data` + `storage_info` 字段承担了这部分职责。

**现状：**
- 任务步骤通过 `flow_chain` 字段在 `smartflow_executions` 中追踪
- 媒体资产通过 `storage_info` 在 `cgi_tasks` 中管理

**如需独立表：** 建议新建迁移 SQL 表，通过 `task_id` 关联到 `cgi_tasks`。

---

### 5.5 流式输出与任务系统的协同

写作模块（`/writing/outline` 和 `/writing/generate`）支持流式 SSE 输出，但流式模式下任务结果是异步写入的（通过 `sync-to-task` 接口手动同步）。存在数据一致性风险：流式中断时任务可能处于不完整状态。

**建议：** 增加流式中途断开的自动补偿机制，或强制要求流式模式也创建任务并实时更新进度。

---

### 5.6 敏感词检查 — 回退逻辑脆弱

敏感词获取 `getSensitiveWordsForSlot()` 失败时直接跳过检查（`catch e` → continue），可能导致绕过敏感词审核。

**建议：** 敏感词服务不可用时应返回错误，而非静默跳过，保证安全边界。

---

### 5.7 MinIO 连接错误的用户体验

媒体访问路由（`/media/*`）在 MinIO 连接失败时返回 503 错误，但客户端无法区分「文件不存在」和「存储服务不可用」。

**建议：** 增加 `X-Storage-Status` 等响应头，或返回更具体的错误码结构。

---

### 5.8 角色库与写作任务的关联数据膨胀

`cgi_tasks.result.metadata` 中可能存储完整的 `characters` 数组（角色画像），每次任务查询都完整返回，在角色数量多时可能影响性能。

**现状已有缓解：** `character_ids` 引用模式（保存到角色库后只存 ID），但回退路径（`hasCharacterIds && !hasCharacters`）仍需从 CharacterService 查询填充。

---

## 附录：文件结构速查

```
mxmcgi/src/
├── routes/                    # API 路由层
│   ├── graph.ts               # 图片生成
│   ├── audio.ts               # 音频生成
│   ├── video.ts               # 视频生成
│   ├── writing.ts             # 写作/文章
│   ├── character.ts           # 角色管理
│   ├── knowledge.ts           # 知识库
│   ├── cgi-tasks.ts           # CGI 任务管理
│   ├── media.ts               # 媒体内容访问
│   ├── upload.ts              # 文件上传
│   ├── system.ts              # 系统管理
│   └── health.ts              # 健康检查
├── smartflow/                # Smartflow 工作流系统
│   ├── routes/
│   │   ├── smartflow.ts       # CRUD + 执行
│   │   ├── tasks.ts           # 执行记录管理
│   │   └── demo.ts            # Demo 模拟
│   └── core/
│       ├── engine/
│       │   ├── engine.ts       # 执行引擎
│       │   ├── repository.ts  # Smartflow 持久化（Supabase）
│       │   └── executionRepository.ts  # 执行记录持久化
│       ├── executors/
│       │   ├── index.ts       # ExecutorFactory
│       │   ├── startExecutor.ts
│       │   ├── endExecutor.ts
│       │   ├── modelExecutor.ts
│       │   ├── toolsExecutor.ts
│       │   ├── conditionExecutor.ts
│       │   ├── variableExecutor.ts
│       │   └── loopExecutor.ts
│       ├── variables/
│       │   └── resolver.ts    # 变量解析器
│       ├── models/
│       │   └── types.ts       # 核心类型定义
│       └── photographyV2.ts   # 预定义工作流
├── task/
│   ├── task-executor.ts       # 异步任务执行器
│   ├── task-manager.ts        # 任务管理器
│   ├── task-recovery.ts       # 任务恢复服务
│   ├── database-storage.ts    # DB 存储适配器
│   └── types.ts               # 任务类型定义
├── tasks/                     # Task V2 系统
│   ├── routes.ts
│   ├── task-engine.ts
│   └── task-definition.ts
├── core/                      # 核心业务逻辑
│   ├── graph/                 # 图片生成核心
│   ├── video/                 # 视频生成核心
│   ├── writing/               # 写作核心
│   └── ...
├── models/                    # 模型/Provider 管理
│   ├── providers.ts           # Provider 工厂
│   ├── provider-model-catalog.ts
│   ├── run.ts                 # 按模型 key 执行
│   └── ...
├── statistics/                # 账单/计费
│   └── billing-service.ts
├── knowledge/                 # 知识库服务
├── characters/                # 角色服务
├── clientServer/              # 前后端共享配置
│   ├── graph/                 # Graph 表单选项
│   └── writing/               # Writing 表单选项
└── index.ts                   # 入口，Express app 挂载
```

---

*报告生成完毕。如需进一步深入某一模块的分析，请告知。*
