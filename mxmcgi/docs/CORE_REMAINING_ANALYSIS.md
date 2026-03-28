# core 迁移后剩余代码分析

## 已迁出 core 的模块（当前状态）

| 原路径 | 现路径 | 说明 |
|--------|--------|------|
| core/knowledge | **src/knowledge** | 知识库服务、embedding、file-parser、knowledge-task |
| core/prompt-config-resolver | **src/prompts** | 提示词解析（按业务 key 从 DB/代码取 rules、outputFormat） |
| core/task | **src/task** | 任务管理、执行器、存储、恢复、通知、支付客户端 |

---

## core 内尚未迁移的代码（按职责分类）

### 1. 模型 / Provider 相关（规划迁到 src/models）

| 路径 | 说明 |
|------|------|
| **core/providers/** | 整目录：Provider 工厂、deer/ppio/replicate/official 实现、model-routing、provider-keys、provider-stats、types。与 models/registry、DB `provider_models` 强相关，规划迁到 `src/models/providers`。 |
| **core/audio/** | 各音频模型适配层（minimax-*、suno-music 等），多为委托 models 的薄封装，规划与 `src/models` 下已有 audio 合并或迁入 models。 |
| **core/video/** | video-service（业务编排）+ sora-2、runway 等适配层；适配层规划迁 models，video-service 可保留或归入业务层。 |
| **core/graph/** 中模型适配 | nano-banana、seedream-4、seedream-4-volc、flux-*、ideogram-v2a、recraft-crisp-upscale 等，已委托 models，规划迁入 models 或删除 core 内重复。 |
| **core/text/** | 各 LLM 的 generate 封装（claude、gemini、gpt、qwen、deepseek 等）。规范中 text 已废弃，规划收口到 models/writing 或移除。 |
| **core/utils/** 中 API 客户端 | deerapi-client、ppio-client、official-client、replicate-client，被 providers 或 models 使用，规划随 providers 迁到 models 或保留为 src/utils。 |

### 2. 提示词 / 配置相关（规划迁到 src/prompts）

| 路径 | 说明 |
|------|------|
| **core/writing/wtconfigs/** | 写作类型 rules、outputformat、formOptions、WRITING_MODEL_SELECTION 等，规划迁到 `src/prompts/writing`。 |
| **core/graph/graphconfigs/** | 图文各类型 rules、getFormOptions、getGraphTypeOptions、generateDefault*Knowledge 等，规划迁到 `src/prompts/graph`。 |
| **core/shared/formOptions.ts** | 表单/字段类型，被 writing 与 graph 配置使用，可随 prompts 迁到 `src/prompts` 或 `src/shared`。 |

### 3. 业务编排与领域（保留在 core 或迁到业务目录）

| 路径 | 说明 |
|------|------|
| **core/writing/**（除 wtconfigs） | writing-service、writing-task、model-selector、business-key、knowledge-enhancer、document-formatter、outline-structure-types、storyboard-chunk-utils、type、sensitive-words。业务编排 + 写作领域逻辑，可长期保留在 core 或迁到 `src/writing`。 |
| **core/graph/**（除 graphconfigs、模型适配） | graph-service、graph-task、reference-image、grid9-*、type。图文业务编排与工具，可保留在 core 或迁到 `src/graph`。 |
| **core/character/** | character-service、type、index。角色领域，可保留在 core 或迁到 `src/character`。 |
| **core/video/video-service.ts** | 视频统一入口与编排，可保留在 core 或与 video 业务一起迁出。 |
| **core/video/videoconfigs/** | 视频表单配置等，可随 prompts 或保留。 |

### 4. 通用工具（保留在 core 或迁到 src/utils）

| 路径 | 说明 |
|------|------|
| **core/utils/**（除 API 客户端） | data-store、image-input、image-processor、grid9-splitter、sensitive-check 等，可保留在 core 或迁到 `src/utils` 供多模块共用。 |

### 5. 文档与说明（非代码）

| 路径 | 说明 |
|------|------|
| **core/README.md** | 建议更新为当前架构（task/knowledge/prompts 已迁出、业务与模型分离）。 |
| **core/providers/*.md**、**core/graph/*.md**、**core/writing/WRITING_DESIGN.md** 等 | 设计/说明文档，可随对应模块迁移或保留在 core。 |

---

## 汇总：core 当前仍包含的内容

- **providers/**：整目录（模型与上游调用的桥梁）
- **audio/**：全部音频模型适配
- **video/**：video-service + 各视频模型适配 + videoconfigs
- **graph/**：graph-service、graph-task、graphconfigs、各图模型适配、reference-image、grid9、type
- **writing/**：writing-service、writing-task、wtconfigs、model-selector、business-key、knowledge-enhancer、document-formatter、outline-structure-types、storyboard-chunk-utils、type、sensitive-words
- **character/**：整目录
- **utils/**：全部工具（含各 API 客户端）
- **shared/**：formOptions
- **text/**：各 LLM 封装（规范已标废弃）

**已迁出**：knowledge → src/knowledge；prompt 解析 → src/prompts；task → src/task。  
**尚未迁移**：模型/provider、提示词配置本体（wtconfigs/graphconfigs）、业务编排与领域、utils/shared、text。
