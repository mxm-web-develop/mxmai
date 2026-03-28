---
name: configurable-generation-pipeline
overview: 将写作、生图、音频、视频的提示词与前后处理逻辑，从硬编码重构为由 Admin 在 prompt_engineering_config 中完全可配置的流程引擎。
todos:
  - id: survey-existing-flows
    content: 梳理 writing/graph/audio/video 当前硬编码的 prompt 拼接、知识库策略、输出/存储逻辑及代码位置
    status: pending
  - id: design-flowconfig-schema
    content: 设计并实现统一的 GenerationFlowConfig/StorageConfig/PipelineStepConfig 类型与从 prompt_engineering_config.extra 的解析规则
    status: pending
  - id: refactor-writing-to-flowconfig
    content: 重构 writing-service 及相关 wtconfigs，使写作流程完全由 FlowConfig 驱动且无代码 fallback
    status: pending
  - id: refactor-graph-to-flowconfig
    content: 重构图像生成服务，将 prompt 拼接、9 宫格规则与图片格式转换改为 FlowConfig 驱动
    status: pending
  - id: refactor-audio-video-to-flowconfig
    content: 为音频与视频生成实现 FlowConfig 驱动的输入/输出/存储流水线
    status: pending
  - id: extend-admin-promptconfig-ui
    content: 扩展 Admin PromptConfig 页面以编辑各模态的 extra.flow 配置，包括 storage 和 pipeline
    status: pending
  - id: remove-runtime-fallbacks
    content: 移除写作/图像/视频中对 wtconfigs/subtype-rules/storyboard 模板的运行时 fallback，只保留为 seed 数据源并补充配置缺失错误处理
    status: pending
isProject: false
---

## 目标

- **统一抽象一个“生成流程配置”层**（Generation Flow / Pipeline Config），覆盖 `writing`、`graph`、`audio`、`video` 四个业务域。
- **所有 Prompt 相关、知识库策略、结构规则、模型入参拼接、输出结构提示、文件保存格式**，都从 Admin 配置驱动，**不再允许代码内 fallback**。
- 为后续新增业务类型（比如新的写作类型、新的图像/视频任务）提供一套统一可扩展的配置入口和运行时装配机制。

## 总体设计思路

- **数据层统一**：继续使用 `prompt_engineering_config` 表作为“流程配置主表”，通过 `scope`（writing/graph/audio/video）、`type`（业务大类）、`subtype`（细分类型/模板）区分不同业务。
- **extra 字段扩展为 FlowConfig**：在 `extra` 中定义各模态通用 + 各自特有的配置段，例如：
  - `prompt: { rules_i18n, output_format_i18n, structure_prompt_i18n, system_tags... }`
  - `knowledge: { use_knowledge, default_knowledge_base_ids, query_strategy, ... }`
  - `input_pipeline: [{ step: 'merge_user_prompt', template: '...', when: ... }, { step: 'extract_from_json', path: '...', ... }]`
  - `output_pipeline: [{ step: 'ensure_grid_count', grid: 9 }, { step: 'strip_markdown', ... }]`
  - `storage: { format, mime, extension, filename_template, bucket, path_template }`
- **服务层只依赖 FlowConfig API，不直接感知 DB 细节**：在 `mxmcgi/src/prompts` 新增一个 FlowConfig 解析器（例如 `getGenerationFlowConfig(scope, type, subtype)`），内部基于 `prompt_engineering_config` 构造强类型的配置对象；`writing-service`、`graph-service`、音频/视频服务只通过该对象驱动自身逻辑。
- **严格模式**：若某个 `(scope, type, subtype)` 在 DB 中不存在配置或配置缺失关键字段，直接抛错（HTTP 5xx / 配置错误），**不再回退 wtconfigs / 硬编码模板**。

## 具体实施步骤

### 步骤 1：梳理现有各模态的“硬编码流程”

- **写作（writing）**
  - 阅读并整理：
    - `[mxmcgi/src/core/writing/writing-service.ts](mxmcgi/src/core/writing/writing-service.ts)` 中：
      - Prompt 组装逻辑（rules + 用户 prompt + output_format + 结构模板）。
      - 知识库增强：`retrieveKnowledge` / `enhancePromptWithKnowledge` 的使用位置与条件。
      - 大纲结构类型的处理：`getStructurePromptTemplate` / `getAvailableStructureTypes` 的使用路径。
      - 结果格式化与存储：`formatDocument`、`StorageFormat`、MinIO 存储信息。
    - `[mxmcgi/src/core/writing/wtconfigs/*.ts](mxmcgi/src/core/writing/wtconfigs)`：
      - 各写作类型 `WritingTypeConfig` 的 `rules`/`outputformat`。
      - `SUBTYPE_RULES_MAP` 中按 subtype 的补充规则。
      - `storyboard-scripts` 的 JSON 输出模板、`CHUNK_MAX_CHARS` 等。
    - `[mxmcgi/src/prompts/resolver.ts](mxmcgi/src/prompts/resolver.ts)` 中 DB + fallback 的解析路径。
- **生图（graph）**
  - 查看：
    - 图像路由/服务，例如 `[mxmcgi/src/core/graph/graph-service.ts](mxmcgi/src/core/graph/graph-service.ts)`、`[mxmcgi/src/routes/media.ts](mxmcgi/src/routes/media.ts)` 等。
      - 确认：
        - 当前如何拼接用户 prompt/negative prompt
        - 关于 9 宫格、尺寸、batch-size 等写死逻辑
        - 生成完成后，对图片的编码与格式转换（jpg/jpeg/png/webp）代码位置
    - `clientServer/graph` 下的规则辅助（与写作类似）。
- **音频（audio）**
  - 追踪：
    - 音频任务路由与核心逻辑：`[mxmcgi/src/routes/media.ts](mxmcgi/src/routes/media.ts)` / `audio` 相关 service。
    - 查找现有是否有任何“提示词模板 / 参数拼接”；若确实为“直传 user prompt + params”，则记为当前基线。
- **视频（video）**
  - 追踪：
    - 视频任务的路由、服务：如 `[mxmcgi/src/core/graph/graph-task.ts](mxmcgi/src/core/graph/graph-task.ts)` 中与视频相关的任务实现，`deerapi` 视频模型调用路径等。
    - 重点确认：
      - 目前从 JSON（如分镜脚本）中提取哪些字段传给视频模型？
      - 有无对 prompt / 描述 / 时间线做拼接或转换？

> 交付物：一份简要文档列出现有每个模态的“流程步骤清单”与对应代码位置，作为后续配置化的对照表。

### 步骤 2：设计统一的 FlowConfig Schema（代码内类型 + DB extra 约定）

- 在 `[mxmcgi/src/prompts/resolver.ts](mxmcgi/src/prompts/resolver.ts)` 或新建 `[mxmcgi/src/prompts/flow-config.ts](mxmcgi/src/prompts/flow-config.ts)` 中定义：

```ts
export interface StorageConfig {
  format: 'text' | 'markdown' | 'html' | 'json' | 'image' | 'audio' | 'video';
  mime?: string;
  extension?: string;
  bucket?: string;
  filenameTemplate?: string;   // 如 voice_${date}_${uuid}.txt
  pathTemplate?: string;       // 如 voice/${userId}/${date}/
}

export interface PromptSectionConfig {
  rules: string;          // 系统提示词主体
  outputFormat: string;   // 输出结构/格式要求
  structurePrompt?: string; // 可选：三段式 / AIDA / 英雄之旅等结构要求
}

export interface KnowledgeConfig {
  useKnowledge: boolean;
  defaultKnowledgeBaseIds?: string[];
  strategy?: 'global' | 'per_section' | 'none';
}

export interface PipelineStepConfig {
  step: string;             // 如 'merge_prompt', 'extract_json', 'ensure_grid', 'strip_markdown'
  when?: Record<string, any>; // 可选条件
  params?: Record<string, any>;
}

export interface GenerationFlowConfig {
  scope: 'writing' | 'graph' | 'audio' | 'video';
  type: string;
  subtype?: string | null;
  prompt: PromptSectionConfig;
  knowledge?: KnowledgeConfig;
  inputPipeline?: PipelineStepConfig[];
  outputPipeline?: PipelineStepConfig[];
  storage?: StorageConfig;
  extra?: Record<string, any>; // 各模态特殊字段，如 storyboard 模板
}
```

- 定义从 `prompt_engineering_config.extra` 解析到 `GenerationFlowConfig` 的规范：
  - 在 Admin 约定 JSON 结构与上述接口保持兼容（并允许部分字段省略 -> 使用代码内安全默认，例如 storage.format 的默认值）。
  - 明确哪些字段是 **必填**（如 `prompt.rules`、`storage.format`）以实现“无配置即报错”。

### 步骤 3：实现 FlowConfig 解析层（严格模式，无 fallback）

- 在 `[mxmcgi/src/prompts/flow-config.ts](mxmcgi/src/prompts/flow-config.ts)` 中实现：
  - `getGenerationFlowConfig(scope, type, subtype, lang)`：
    - 使用 `RepositoryFactory.createPromptEngineeringConfigRepository().findByKey(...)` 读取记录。
    - 若不存在 / `is_active=false` / 缺少关键字段：
      - 直接抛出 `ConfigurationError`（自定义错误类型），在路由层返回 5xx + 明确错误消息（例如“写作类型 voice-scripts 未配置生成流程”）。
    - 将 `rules_i18n`、`output_format_i18n` 映射到 `prompt.rules` / `prompt.outputFormat`。
    - 从 `extra` 中解析 `knowledge`、`inputPipeline`、`outputPipeline`、`storage` 等字段；做类型校验与默认值填充。
- 更新 `prompts/resolver.ts`：
  - `getWritingRulesAndFormatResolved` 和 `getPromptFullConfig` 迁移为对 `getGenerationFlowConfig('writing', ...)` 的轻量包装；去掉原先对 `wtconfigs` 的 fallback 调用。

### 步骤 4：写作（writing）重构为 FlowConfig 驱动

- 在 `[mxmcgi/src/core/writing/writing-service.ts](mxmcgi/src/core/writing/writing-service.ts)` 中：
  - **Prompt 组装**：
    - 用 `getGenerationFlowConfig('writing', params.writing_type || 'articles', params.outline_type ?? null)` 拿到 `flow.prompt`。
    - 系统 Prompt = `flow.prompt.rules` + 可选结构模板（如根据 `flow.extra.structure_type` 或 `structurePrompt` 拼入）+ 用户 prompt + `flow.prompt.outputFormat`。
  - **知识库**：
    - 用 `flow.knowledge` 决定：
      - 是否执行 `retrieveKnowledge`；
      - 使用哪些 `defaultKnowledgeBaseIds`。
  - **输入流水线（inputPipeline）**：
    - 根据 `inputPipeline` 依次执行步骤，例如：
      - `merge_outlines`: 把大纲 nodes 展开。
      - `apply_structure_type`: 附加 outline 结构要求。
      - `add_character_context`: 角色信息格式化后拼入提示。
  - **输出与存储**：
    - 使用 `flow.storage.format` / `mime` / `extension` 调用 `formatDocument`，并生成文件名 / 路径。
    - 不再在代码里硬编码“口播用 txt、分镜用 json”等，而是从配置读取。
- 清理：
  - `wtconfigs` 中关于 `rules` / `outputformat` 的 runtime 使用，只保留给 seed 脚本；
  - `SUBTYPE_RULES_MAP` 仅用于初始化 DB，运行时不再被引用。

### 步骤 5：生图（graph）流程工程化

- 在图像服务（例如 `[mxmcgi/src/core/graph/graph-service.ts](mxmcgi/src/core/graph/graph-service.ts)` 或相应文件）中：
  - 引入 `getGenerationFlowConfig('graph', graphType, subtype)`：
    - **Prompt 拼接**：
      - 配置中定义：如何组合用户的 `prompt`/`negativePrompt`/参数为最终发给模型的 `GenerateParams`：
        - 如 inputPipeline steps：`[{ step: 'merge_prompt', params: { template: '用户提示: {{prompt}}\n风格: {{style}}' }], { step: 'apply_negative', ... }]`。
    - **输出结构要求（例如 9 宫格）**：
      - 在 `outputPipeline` 中定义 `ensure_grid`: `{ step: 'ensure_grid', params: { grid: 9 } }`，图像服务根据此决定生成数量 / 拼图逻辑。
    - **图片编码与格式转换**：
      - 使用 `flow.storage.format='image'` + `extension='jpg' | 'jpeg' | 'png' | 'webp'`，在保存到 MinIO 前执行统一的 `convertImageFormat` 函数。
      - 如有 9 宫格拼接，也作为 `outputPipeline` 的一个 step 处理：生成拼接后的单图 + 原始多图是否保留由配置决定。

### 步骤 6：音频（audio）流程工程化

- 在音频相关服务（比如 `audio` 任务执行、`Suno` 等）中：
  - 目前缺少拼接工程，可在 FlowConfig 中定义：
    - `prompt.rules`：歌词/旁白的系统提示词（例如风格、韵律要求）。
    - `output_format`：若需要结构化输出（如 JSON 歌词），在此指定；否则为“纯文本歌词”要求。
    - `inputPipeline`：
      - 例如 `extract_lyrics_from_json`、`merge_title_and_prompt` 等步骤。
    - `storage`：
      - 决定最终存哪种格式：`mp3`、`wav` 等（如果底层模型输出统一格式，可以配置“是否做转码”）。
- 将目前写死在 `parseSunoLyricsJson` 等工具里的规则，迁移为 `outputPipeline` / `extra` 参数驱动的可配置逻辑（保留 parser 作为工具，但行为由配置控制）。

### 步骤 7：视频（video）流程工程化

- 在视频任务执行路径（调用 `deerapi` 视频模型、处理分镜 JSON）中：
  - 用 `getGenerationFlowConfig('video', videoType, subtype)`：
    - `inputPipeline`：
      - 如 `extract_storyboard_chunks_from_json`：从写作分镜 JSON 中读取 chunks，映射到模型字段（场景描述、时长、seed 等）。
      - 根据配置决定是否合并多段、是否裁剪字段。
    - `prompt`：
      - 决定是否在每个 chunk 前后附加全局风格说明、平台规范等。
    - `storage`：
      - 定义输出容器格式（mp4/webm 等）、文件命名规则、封面图生成策略（可以挂在 `outputPipeline` 中，例如 `generate_thumbnail`）。

### 步骤 8：Admin PromptConfig 界面扩展

- 在 Web 前端 `[web/src/pages/PromptConfig.tsx](web/src/pages/PromptConfig.tsx)` 中：
  - 扩展表单：
    - 为 `extra` 增加可视化编辑能力：
      - 基本字段：`use_knowledge`、`default_knowledge_base_ids`。
      - `storage` 配置区域：下拉选择 format、extension，文本框配置 filename/path 模板。
      - 简单的 JSON 编辑区或分组表单来维护 `inputPipeline` / `outputPipeline` steps（第一版可以先用 JSON 文本框，后续再做 UI 化）。
  - 确保 Admin 能对 `writing`/`graph`/`audio`/`video` 的类型和子类型分别维护记录。

### 步骤 9：移除 fallback 与回归测试

- 删除/禁用以下运行时代码路径：
  - `getWritingTypeRules` / `getWritingTypeOutputFormat` 在 resolver 中的调用。
  - `SUBTYPE_RULES_MAP` 在 runtime 的直接引用（保留在 seed 脚本中）。
  - `getStoryboardChunkOutputFormat` 被当作“无 DB 时回退”的逻辑。
- 为每个 `(scope, type, subtype)` 写一两条 **配置缺失用例**：
  - 当删掉对应 `prompt_engineering_config` 记录时，请求应返回明确的“配置缺失”错误，而不是静默用默认模板。
- 回归测试：
  - 写作：大纲 + 正文 + 分镜 + 口播。
  - 生图：单图 + 多图 + 9 宫格。
  - 音频：歌词生成 + 音频生成（若有）。
  - 视频：基于分镜 JSON 的视频生成。

## 受影响的主要模块（高层）

- **后端 mxmcgi**：
  - `src/prompts/resolver.ts`（与 `prompt_engineering_config` 对接）
  - 新增：`src/prompts/flow-config.ts`（统一 FlowConfig 解析）
  - 写作：`src/core/writing/writing-service.ts`、`src/core/writing/wtconfigs/`**、`src/core/writing/outline-structure-types.ts`
  - 图像：`src/core/graph/`**、`src/routes/media.ts` 里与图片相关的部分
  - 音频：音频相关 service / 路由（`src/routes/media.ts` 或专门 audio 模块）
  - 视频：视频任务执行与调用 DeerAPI 的 provider 逻辑
  - Seed 脚本：`src/scripts/seed-prompt-engineering-config.ts`
- **数据层 mxmdata**：
  - `src/adapters/supabase/SupabasePromptEngineeringConfigRepository.ts`（若需要对 extra 做轻量校验）
- **前端 web**：
  - `src/pages/PromptConfig.tsx`（Admin 配置界面，支持编辑新增加的 extra 字段）

## 后续可选优化

- 将 `PipelineStepConfig.step` 注册为一个可扩展的枚举 + 工厂，避免字符串散落、方便未来新增步骤。
- 增加一个“Dry-run 配置检查”脚本：遍历所有 `(scope,type,subtype)`，验证 FlowConfig 字段完整性并输出报告，防止线上运行时报配置缺失错误。

