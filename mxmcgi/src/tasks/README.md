## mxmcgi Task v2：业务任务动态工程化总览

> **固定前置链实现说明**（与代码一致）：见 [`README_TASK_V2_FIXED.md`](./README_TASK_V2_FIXED.md)。

> 本文是「单一 Task 层」的设计文档，目标：  
> - 把 **提示词模版 + 业务表单 + 知识库 + 输入/输出处理 + 存储格式** 完整统一到一个可配置体系中；  
> - 支持 Admin 在提示词中使用 `${styles}` 这类占位符，由表单驱动传参；  
> - 提供一个遵循 **JSON Schema** 的 `form-config v2` 接口，让前端可以**完全依赖这个接口渲染任意业务 Task 的表单**；  
> - 不涉及 Smartflow/Smartchain，那是「多 Task 编排」层，本文只关心单 Task。

---

### 1. 核心抽象：TaskDefinition + TaskTemplate

#### 1.1 TaskDefinition（任务定义）

对应「一个可被前端发起的业务任务」，例如：

- 写作大纲：`scope=writing`, `taskType="outlines"`
- 口播稿：`scope=writing`, `taskType="voice-scripts"`
- 生图：`scope=graph`, `taskType="photograph"`
- 音频：`scope=audio`, `taskType="music"`
- 视频：`scope=video`, `taskType="storyboard-to-video"`

**数据落点**（不强制新表，先复用 `prompt_engineering_config`，再按需拆表）：

- `scope`: `'writing' | 'graph' | 'audio' | 'video' | ...'`
- `type`: 业务大类（如 `outlines`、`voice-scripts`、`photograph`）
- `subtype`: 细分（如 `tech-article`、`story-novel`、`short-video-storyboard`）
- `rules_i18n` / `output_format_i18n`: 系统提示词 + 输出结构提示
- `extra`: **TaskTemplate 配置（见下）**

> 任务路由层（`routes/writing.ts`、`routes/media.ts`、`routes/video.ts` 等）只需要知道：  
> 「当前请求对应哪个 `(scope, type, subtype)` TaskDefinition」，然后把请求委托给 Task 引擎。

#### 1.2 TaskTemplate（放在 extra 中）

`extra` 里承载本任务的「动态工程」定义，统一结构大致为：

```ts
interface TaskTemplate {
  // 1）表单定义（JSON Schema v2）
  formSchema: JsonSchemaV2;

  // 2）Prompt 模板（支持占位符）
  prompt: {
    systemTemplate: string;       // 系统提示词片段，可包含 ${styles} 等
    userTemplate?: string;        // 可选，对用户输入进行再包裹
    outputFormatTemplate: string; // 输出结构/格式说明
  };

  // 3）知识库与上下文
  knowledge?: {
    useKnowledge: boolean;
    defaultKnowledgeBaseIds?: string[];
    strategy?: 'global' | 'per_section' | 'none';
  };

  // 4）存储格式（单 Task 级）
  storage?: TaskStorageConfig;    // 写作/图像/音频/视频各自有专门的 extension union
}
```

**Task v2 固定前置链**（见 `task-v2-prelude.ts`，不再使用可配置 `inputPipeline` / `outputPipeline`）：  
schema 校验 → 敏感词（`prompt`）→ **写作/大纲：kbRecall/webSearch 字段解析** → 若 `knowledge.useKnowledge` 且配置了 `defaultKnowledgeBaseIds` 则召回并合并进 `params.prompt` → `renderPromptFromTemplate` → 余额 → 创建并执行任务。

#### kbRecall / webSearch 字段（写作 scope）

Admin 在 `formSchema.properties` 中为字段设置 `x-ui-type: kbRecall` 或 `webSearch`。用户提交 object，prelude 执行后该字段变为格式化摘要字符串，可在 `unifiedTemplate` 用 `${fieldName}` 引用。示例见行业日报 / 选题长文等 writing bundle 中的 `webSearch` / `kbRecall` 字段。

**注意**：这里的「TaskTemplate」是**单任务级别**的，不是 Smartflow。多 Task 串联仍由 Smartflow/Smartchain 另行设计。

---

### 2. JSON Schema v2：表单统一描述

#### 2.1 form-config v2 接口形态（只读配置）

新接口示例（按模块拆路由，最终汇总到 gateway）：

- `GET /api/v2/tasks/form-config?scope=writing&taskType=outlines&subtype=tech-article`

返回结构（简化）：

```jsonc
{
  "scope": "writing",
  "taskType": "outlines",
  "subtype": "tech-article",

  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "title": "写作需求",
        "minLength": 1
      },
      "styles": {
        "type": "string",
        "title": "写作风格",
        "enum": ["严谨科技", "轻松科普", "故事叙述"],
        "x-enum-labels": ["严谨科技文", "轻松科普", "故事化叙述"]
      },
      "maxDepth": {
        "type": "integer",
        "title": "大纲深度",
        "minimum": 1,
        "maximum": 4,
        "default": 3
      }
    },
    "required": ["prompt", "styles"]
  },

  "uiSchema": {
    // 非必须，前端可选使用：控件类型、布局等
  }
}
```

约束：

- **完全遵循 JSON Schema**，必要时以 `x-` 前缀扩展前端特有字段（如 `x-enum-labels`）。
- 所有可参与模板替换的字段（如 `styles`）都由 JSON Schema 定义，**不再在代码里硬编码参数名**。

#### 2.2 前端渲染逻辑

- 前端只需要：
  - 调用 `GET /api/v2/tasks/form-config` 获取 schema；
  - 使用通用 JSON Schema Form 渲染（或自建 Form 渲染器），不再关心业务细节；
  - 提交时，直接把 `formValues` 作为任务参数发到 `POST /api/v2/tasks/run`。

---

### 3. Task 运行时：从表单到 Prompt 的统一管线

#### 3.1 run-task v2 接口

统一入口（示意）：

- `POST /api/v2/tasks/run`

请求：

```jsonc
{
  "scope": "writing",
  "taskType": "outlines",
  "subtype": "tech-article",
  "params": {
    "prompt": "写一篇 AI Agent 架构科普大纲",
    "styles": "严谨科技",
    "maxDepth": 3
  },
  "options": {
    "stream": false
  }
}
```

服务端主流程（伪代码）：

```ts
const definition = await loadTaskDefinition(scope, taskType, subtype); // 来自 prompt_engineering_config
const template: TaskTemplate = parseTaskTemplate(definition.extra);

validateWithJsonSchema(template.formSchema, params); // 直接用 schema 校验

// 1）固定前置链（敏感词、知识库），见 runFixedTaskV2Prelude
let ctx = await runFixedTaskV2Prelude({ scope, taskKey, subtype, params, userId, state: {} }, template);

// 2）基于模版 + 参数生成最终 Prompt（若 state.finalPrompt 已设则优先）
const { finalPrompt } = renderPromptFromTemplate({ ... });
const finalPromptEnhanced = ctx.state.finalPrompt?.trim() ? ctx.state.finalPrompt : finalPrompt;

// 3）余额预检 → 创建任务 → executeTask（写作大纲等）
// 4）outputPipeline 未接入执行路径；结果处理由各 Task 执行器负责
// 5）storage 等后续扩展
const storageInfo = await saveTaskOutput(template.storage, processed, ctx);

return { taskId, result: processed, storage: storageInfo };
```

**renderPromptFromTemplate(template, ctx)** 的关键点：

- `systemTemplate`、`userTemplate`、`outputFormatTemplate` 都可以包含 `${字段名}` 占位符；
- 这些字段名严格来源于 JSON Schema 定义的 `properties`；
- 用一个简单的模版引擎（如 `string.replace(/\$\{(\w+)\}/g, ...)` 或 handlebars 等）填充：

```ts
const vars = { ...params, userId, taskId, now, ... } // 可按需扩展
const system = interpolate(template.systemTemplate, vars);
const user  = template.userTemplate ? interpolate(template.userTemplate, vars) : params.prompt;
const output = interpolate(template.outputFormatTemplate, vars);
```

最终写作类 Prompt 拼装类似：

```txt
【系统规则】
<system>

【用户需求】
<user>

【输出结构要求】
<output>
```

---

### 4. 用「大纲（outlines）」完整走一遍 v2 流程

#### 4.1 Admin 配置示意：styles 模版 + 表单可选项

以 **科技大纲** 为例（`scope=writing, type=outlines, subtype=tech-article`）：

```jsonc
{
  "scope": "writing",
  "type": "outlines",
  "subtype": "tech-article",

  "rules_i18n": {
    "zh": "你是一位专业的大纲写作助手，擅长为科技类文章设计结构清晰的大纲。"
  },
  "output_format_i18n": {
    "zh": "【输出格式要求】...（编号、层级规则省略）"
  },

  "extra": {
    "formSchema": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "title": "写作需求",
          "minLength": 1
        },
        "styles": {
          "type": "string",
          "title": "写作风格",
          "enum": ["tech-strict", "tech-friendly", "story"],
          "x-enum-labels": ["严谨科技", "轻松科普", "故事化叙述"]
        },
        "maxDepth": {
          "type": "integer",
          "title": "大纲深度",
          "minimum": 1,
          "maximum": 4,
          "default": 3
        }
      },
      "required": ["prompt", "styles"]
    },

    "prompt": {
      "systemTemplate": "你是一位专业的大纲写作助手，擅长为科技类主题创作清晰、逻辑严密的大纲结构。\n\n【写作风格】本篇文章要严格遵循 ${styles} 风格写作。\n\n【大纲设计原则】...（省略现有 outlinesConfig.rules 中的细则）",
      "userTemplate": "【用户需求】\n${prompt}",
      "outputFormatTemplate": "【大纲格式要求】...（来自现有 outlinesConfig.outputformat，可继续细化）"
    },

    "knowledge": {
      "useKnowledge": true,
      "defaultKnowledgeBaseIds": ["kb_tech_base"]
    },

    "storage": {
      "extension": "json",
      "mime": "application/json",
      "bucket": "writing-outlines",
      "filenameTemplate": "outline_${date}_${uuid}.json",
      "pathTemplate": "outlines/${userId}/${date}/"
    }
  }
}
```

> 这里的 `${styles}` 就是你提到的「模版提示词传参」，值来自 JSON Schema 表单字段 `styles`。

#### 4.2 前端交互

1. 前端调用：  
   `GET /api/v2/tasks/form-config?scope=writing&taskType=outlines&subtype=tech-article`  
   -> 拿到 `formSchema`，渲染出「写作需求 + 写作风格 + 大纲深度」表单。
2. 用户选择：
   - `prompt = "写一篇介绍企业落地 AI Agent 的科普文章大纲"`
   - `styles = "tech-strict"`（严谨科技）
   - `maxDepth = 3`
3. 前端提交：  
   `POST /api/v2/tasks/run`，附上 params。

#### 4.3 后端生成 Prompt 的实际样子（示例）

插值后 system 段大致长这样（省略部分）：

```txt
你是一位专业的大纲写作助手，擅长为科技类主题创作清晰、逻辑严密的大纲结构。

【写作风格】本篇文章要严格遵循 tech-strict 风格写作。

【大纲设计原则】
1. 层次清晰...
...
```

完整 Prompt（传给 `runByModelKey('writing', ...)`）类似：

```txt
你是一位专业的大纲写作助手，擅长为科技类主题创作清晰、逻辑严密的大纲结构。

【写作风格】本篇文章要严格遵循 tech-strict 风格写作。
...（design 原则/技巧省略）

【用户需求】
写一篇介绍企业落地 AI Agent 的科普文章大纲

【大纲格式要求】
...（编号/层级规则）
```

模型输出的大纲由现有 `generateOutline` / 任务执行器解析为结构并落库；可配置 `outputPipeline` 未接入。

---

### 5. 与现有实现的关系

1. **不影响旧接口**：  
   - 旧的 `writing` / `graph` 路由继续沿用现有 wtconfigs + prompts.resolver 逻辑；  
   - 新的 `tasks v2` 接口（`form-config` + `run`）走 TaskDefinition + TaskTemplate 流程。

2. **现有 rules/outputformat 的迁移方式**：  
   - `outlinesConfig.rules` / `outlinesConfig.outputformat` 等内容，可以作为初始模版注入 `prompt.systemTemplate` / `prompt.outputFormatTemplate`；  
   - 迁移完成后，wtconfigs 在 runtime 只用于 seed，不再作为 fallback。

3. **模版参数与表单字段的统一来源**：  
   - 所有 `${变量}` 必须在 `formSchema.properties` 里有定义；  
   - Task 引擎不会凭空引入新的字段名，确保 Admin/前端/后端三方对参数集合完全一致。

4. **后续扩展到 graph/audio/video**：  
   - graph：`formSchema` 定义风格/尺寸/9 宫格等选项；生图主链路仍见 `graph-service`，与 Task v2 模板化可逐步对齐；  
   - audio：`formSchema` 定义 TTS 参数、情感、节奏；`prompt.systemTemplate`/TTS 特殊规则统一放 Template 中；  
   - video：`formSchema` 定义分镜来源（taskId）、目标分辨率等；`prompt` 负责全局风格说明，`storage` 决定 mp4/webm。

本 README 只描述 **Task v2 抽象与大纲业务的完整样例**，后续其他业务可以在此基础上逐一迁移。 

