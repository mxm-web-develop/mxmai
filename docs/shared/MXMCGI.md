# mxmcgi - AI多媒体生成业务模块

## 一、模块概述与核心功能

mxmcgi 负责统一管理所有“创作/生成”类能力，对接不同的大模型或工作流引擎（DeerAPI、Flux、ComfyUI、本地部署等），并以任务的形式向前端与其他业务模块暴露能力。核心目标：

- **任务管理**：创建 / 查询 / 取消生成任务，支持排队、限流与并发控制。
- **多模型提供商**：通过策略模式对不同提供商做抽象封装，可随时扩展新的 provider。
- **多媒体类型支持**：目前支持 **文本生成** (`text`) 和 **图片生成** (`graph`) 两大类型。
  - **文本生成**：通过 `/api/v1/cgi/text` 路由，支持流式输出和 JSON 输出
  - **图片生成**：通过 `/api/v1/cgi/graph` 路由，支持多种图片生成模型和进度监控
- **任务调度与进度跟踪**：支持 `queued / processing / completed / failed / cancelled` 等状态，并记录进度、耗时。
- **结果管理**：生成的文件写入对象存储（MinIO/S3），元数据入库，可供历史记录、项目详情等功能查询。
- **成本计算**：根据模型、参数、推理时长等写入 `cost` 字段，为计费与配额做准备。

---

## 二、数据库表设计

```sql
-- 生成任务主表
CREATE TABLE generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id UUID,
  task_no VARCHAR(64) UNIQUE NOT NULL,        -- 业务编号：GEN20240115123456

  media_type VARCHAR(20) NOT NULL,            -- text | graph (图片生成)
  task_type VARCHAR(50),                      -- image_generation / video_generation 等

  model_provider VARCHAR(50) NOT NULL,        -- deerapi / flux / comfyui / local ...
  model_name VARCHAR(100),
  model_config JSONB,

  status VARCHAR(20) DEFAULT 'queued',        -- queued / processing / completed / failed / cancelled
  progress INTEGER DEFAULT 0,                 -- 0-100
  error_message TEXT,
  error_code VARCHAR(50),

  input_data JSONB NOT NULL,                  -- 完整输入（prompt + 参数）
  prompt TEXT,

  output_data JSONB,                          -- 生成结果（媒体 URL、元数据等）
  media_urls TEXT[],

  estimated_time INTEGER,
  actual_time INTEGER,
  queued_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  cost DECIMAL(10, 6) DEFAULT 0.000000,
  cost_breakdown JSONB,

  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_generation_tasks_user_id ON generation_tasks(user_id);
CREATE INDEX idx_generation_tasks_status ON generation_tasks(status);
CREATE INDEX idx_generation_tasks_media_type ON generation_tasks(media_type);
CREATE INDEX idx_generation_tasks_provider ON generation_tasks(model_provider);
CREATE INDEX idx_generation_tasks_created_at ON generation_tasks(created_at DESC);

-- 生成步骤表（多阶段任务）
CREATE TABLE generation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  step_order INTEGER NOT NULL,
  step_type VARCHAR(50) NOT NULL,             -- script / storyboard / character / music / video ...

  model_provider VARCHAR(50),
  model_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',       -- pending / processing / completed / failed
  progress INTEGER DEFAULT 0,
  error_message TEXT,

  input_data JSONB,
  output_data JSONB,
  media_urls TEXT[],

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_generation_steps_task ON generation_steps(task_id);
CREATE INDEX idx_generation_steps_order ON generation_steps(task_id, step_order);

-- 媒体资产表（统一查询入口）
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  task_id UUID REFERENCES generation_tasks(id) ON DELETE CASCADE,
  step_id UUID REFERENCES generation_steps(id) ON DELETE SET NULL,

  type VARCHAR(20) NOT NULL,                  -- text | graph (图片生成)
  title VARCHAR(255),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size BIGINT,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  metadata JSONB,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

> 说明：所有表不直接设置跨服务外键（如 `user_id`）以保持服务自治，必要时通过 `mxmdata` 提供的仓库接口做校验。

---

## 三、模型提供商架构设计

### 3.1 设计目标

- **策略模式**：以 `ModelProvider` 接口抽象不同厂商，避免业务层硬编码。
- **多模型、多媒体支持**：一个提供商可支持多个媒体类型；同一类型也可由多个提供商承接。
- **可扩展**：新增 provider 只需实现接口 + 在工厂注册。
- **异步与同步兼容**：`generate` 返回任务 ID，可同步得到结果，也可通过回调或轮询查询。

### 3.2 接口定义

```typescript
// mxmcgi/src/providers/ModelProvider.ts
export interface ModelProvider {
  readonly provider: string;      // deerapi / flux / comfyui / local ...
  readonly name: string;          // 显示名称

  supportsMediaType(mediaType: MediaType): boolean;

  generate(params: GenerateParams): Promise<GenerateResult>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
  cancelTask(taskId: string): Promise<void>;
  getAvailableModels(mediaType: MediaType): Promise<ModelInfo[]>;
  calculateCost?(params: GenerateParams): Promise<number>;
}

export interface GenerateParams {
  mediaType: MediaType;
  model: string;
  prompt: string;
  negativePrompt?: string;
  parameters?: Record<string, any>;   // width / height / steps / duration / fps / seed / etc.
  callbackUrl?: string;
}

export interface GenerateResult {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  mediaUrls?: string[];
  progress?: number;
  estimatedTime?: number;
  error?: { code: string; message: string };
}
```

### 3.3 默认提供商实现

```typescript
// DeerAPI（云端主力）
export class DeerAPIProvider implements ModelProvider {
  readonly provider = 'deerapi';
  readonly name = 'DeerAPI';

  constructor(private config: DeerAPIConfig) {}

  supportsMediaType(mediaType: MediaType) {
    return ['photo','video','music','illustration','text','voice'].includes(mediaType);
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const endpoint = this.resolveEndpoint(params.mediaType);
    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        ...params.parameters,
      }),
    });
    const data = await response.json();
    return {
      taskId: data.task_id,
      status: data.status,
      mediaUrls: data.media_urls,
      progress: data.progress,
      estimatedTime: data.estimated_time,
    };
  }

  // getTaskStatus / cancelTask / getAvailableModels 实现思路类似，通过 REST API 访问
}

// Flux（偏图像）与 ComfyUI（本地 workflow）、LocalModelProvider（自托管模型）实现方式同理，
// 重点是：supportsMediaType 精确声明支持范围，generate 内部调用各自 API。
```

### 3.4 提供商工厂与媒体映射

```typescript
export class ModelProviderFactory {
  private providers = new Map<string, ModelProvider>();

  constructor() {
    this.register('deerapi', new DeerAPIProvider(getDeerAPIConfig()));
    this.register('flux', new FluxProvider(getFluxConfig()));
    this.register('comfyui', new ComfyUIProvider(getComfyUIConfig()));
    this.register('local', new LocalModelProvider(getLocalModelConfig()));
  }

  register(id: string, provider: ModelProvider) {
    this.providers.set(id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unsupported model provider: ${id}`);
    return provider;
  }

  getProvidersForMediaType(mediaType: MediaType) {
    return Array.from(this.providers.values()).filter(p => p.supportsMediaType(mediaType));
  }
}

## 三、API 路由结构

mxmcgi 通过以下路由暴露能力：

### 3.1 文本生成路由 (`/api/v1/cgi/text`)

- **路径**: `/api/v1/cgi/text`
- **支持模型**: `gpt-5-nano`, `claude-4.5-sonnet`, `deepseek-r1`, `gemini-2.5-flash`, `gemini-3-pro`
- **功能**: 文本生成、多模态理解（文本+图片）、流式输出
- **获取模型列表**: `GET /api/v1/cgi/text/models`
- **生成文本**: `POST /api/v1/cgi/text/:modelName`

### 3.2 图片生成路由 (`/api/v1/cgi/graph`)

- **路径**: `/api/v1/cgi/graph`
- **支持模型**: `seedream-4`, `flux-fast`, `ideogram-v2a`, `nano-banana`, `flux-kontext-fast`, `recraft-crisp-upscale`
- **功能**: 文本生成图片、图片编辑、图片放大、多参考图片生成
- **获取模型列表**: `GET /api/v1/cgi/graph/models`
- **生成图片**: `POST /api/v1/cgi/graph/:modelName`

### 3.3 模型提供商支持

当前支持的提供商（Provider）：
- **replicate**: 主要提供商，支持所有文本和图片模型
- **ppio**: 部分模型支持（如 `nano-banana`）
- **deer**: 部分模型支持

通过 `?provider=replicate` 查询参数可以指定使用的提供商。
```

> **扩展流程**：实现 `NewProvider implements ModelProvider` → 在工厂 `register('newprovider', ...)` → 配置默认映射 → 可立即被任务服务调用。

---

## 四、服务流程与任务生命周期

### 4.1 GenerationService 主要流程

```typescript
export class GenerationService {
  constructor(
    private providerFactory: ModelProviderFactory,
    private taskRepo: IGenerationRepository,
    private notificationPublisher: NotificationPublisher,
  ) {}

  async createTask(userId: string, dto: CreateTaskDto) {
    const mapping = MEDIA_MODEL_MAPPING[dto.mediaType];
    const providerId = dto.provider ?? mapping.defaultProvider;
    const provider = this.providerFactory.get(providerId);

    const task = await this.taskRepo.create({
      user_id: userId,
      media_type: dto.mediaType,
      task_type: dto.taskType,
      model_provider: providerId,
      model_name: dto.model ?? mapping.defaultModel,
      input_data: dto.input,
      status: 'queued',
      prompt: dto.input.prompt,
    });

    // 异步调用模型（可放入任务队列）
    const result = await provider.generate({
      mediaType: dto.mediaType,
      model: task.model_name,
      prompt: dto.input.prompt,
      parameters: dto.input.parameters,
      callbackUrl: `${process.env.API_BASE_URL}/api/v1/generation/callback/${task.id}`,
    });

    await this.handleProviderResult(task.id, result);
    return task;
  }

  async handleProviderResult(taskId: string, result: GenerateResult) {
    await this.taskRepo.update(taskId, {
      status: result.status,
      progress: result.progress ?? 0,
      output_data: result.mediaUrls ? { media_urls: result.mediaUrls } : null,
      completed_at: result.status === 'completed' ? new Date() : null,
    });

    await this.notificationPublisher.publishAsyncStatus({
      module_type: 'mxmcgi',
      task_id: taskId,
      task_status: result.status,
      metadata: { media_urls: result.mediaUrls },
    });
  }
}
```

### 4.2 生命周期状态

1. **queued**：任务入库，等待 provider 接单或排队。
2. **processing**：provider 反馈“生成中”或服务主动更新。
3. **completed**：生成完毕，写入 `media_assets`，触发通知。
4. **failed**：记录错误信息，允许重试。
5. **cancelled**：用户主动取消，调用 provider 的 `cancelTask`。

### 4.3 回调与轮询

- **回调模式**：部分 provider 支持 webhook，命中 `callbackUrl` 后更新任务。
- **轮询模式**：定时任务 / 用户手动查询 `GET /tasks/:id/status`，内部调用 `getTaskStatus`。

---

## 五、API 接口规范

### 5.0 基础路径

mxmcgi 服务提供两类 API：

1. **直接模型调用 API**（推荐用于快速集成）：
   - 文本生成：`/api/v1/cgi/text`
   - 图片生成：`/api/v1/cgi/graph`

2. **任务管理 API**（用于异步任务和状态跟踪）：
   - 基础路径：`/api/v1/generation`

### 5.0.1 直接模型调用 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/cgi/text/models` | 获取所有文本模型列表 | ❌ |
| POST | `/api/v1/cgi/text/:modelName` | 调用指定文本模型生成 | ❌ |
| GET | `/api/v1/cgi/graph/models` | 获取所有图片模型列表 | ❌ |
| POST | `/api/v1/cgi/graph/:modelName` | 调用指定图片模型生成 | ❌ |

### 5.0.2 任务管理 API（待实现）

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/generation/tasks` | 创建生成任务 | ✅ |
| GET | `/api/v1/generation/tasks` | 获取任务列表 | ✅ |
| GET | `/api/v1/generation/tasks/:id` | 获取任务详情 | ✅ |
| GET | `/api/v1/generation/tasks/:id/status` | 轮询任务状态 | ✅ |
| DELETE | `/api/v1/generation/tasks/:id` | 取消/删除任务 | ✅ |
| GET | `/api/v1/generation/providers` | 获取模型提供商列表 | ✅ |
| GET | `/api/v1/generation/providers/:provider/models` | 获取指定 provider 的模型 | ✅ |
| POST | `/api/v1/generation/tasks/:id/estimate` | 费用估算 | ✅ |
| GET | `/api/v1/generation/media` | 获取生成的媒体资产 | ✅ |

### 5.1 支持的模型列表

#### 文本生成模型（Text Models）

| 模型名称 | 说明 | 提供商 | 流式输出 |
|---------|------|--------|---------|
| `gpt-5-nano` | OpenAI 快速文本生成模型 | replicate | ✅ |
| `claude-4.5-sonnet` | Anthropic 对话模型 | replicate | ✅ |
| `deepseek-r1` | DeepSeek 推理模型 | replicate | ✅ |
| `gemini-2.5-flash` | Google 快速混合模型 | replicate | ✅ |
| `gemini-3-pro` | Google 高级推理模型 | replicate | ✅ |

#### 图片生成模型（Graph Models）

| 模型名称 | 说明 | 提供商 | 进度监控 |
|---------|------|--------|---------|
| `seedream-4` | ByteDance 统一图片生成模型（支持 4K） | replicate | ✅ |
| `flux-fast` | Flux 1.1 Pro 快速图片生成 | replicate | ❌ |
| `ideogram-v2a` | Ideogram 插图生成（擅长文字图片） | replicate | ❌ |
| `nano-banana` | Google Gemini 3 Pro 图片预览 | replicate | ✅ |
| `flux-kontext-fast` | Flux Kontext 快速图片编辑 | replicate | ❌ |
| `recraft-crisp-upscale` | Recraft 高质量图片放大 | replicate | ❌ |

### 5.2 API 请求示例

#### 5.2.1 文本生成模型

##### GPT-5 Nano

```bash
POST /api/v1/cgi/text/gpt-5-nano
Content-Type: application/json

{
  "prompt": "写一篇关于人工智能的文章",
  "max_completion_tokens": 2000,
  "temperature": 0.7,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "system_prompt": "你是一个专业的写作助手",
  "image_input": ["https://example.com/image.jpg"],  // 可选：多模态输入
  "outputFormat": "json",  // 或 "stream" 流式输出
  "enableCollection": true,  // 流式输出时是否累积完整文本
  "negativePrompt": "避免使用专业术语"  // 可选
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `max_completion_tokens` (可选): 最大完成 token 数
- `temperature` (可选): 温度参数 (0-2)，默认 1
- `top_p` (可选): 核采样 (0-1)，默认 1
- `frequency_penalty` (可选): 频率惩罚 (-2 到 2)，默认 0
- `presence_penalty` (可选): 存在惩罚 (-2 到 2)，默认 0
- `system_prompt` (可选): 系统提示词
- `image_input` (可选): 输入图片数组（base64 或 URL），支持多模态
- `outputFormat` (可选): `"json"` 或 `"stream"`，默认 `"json"`
- `enableCollection` (可选): 流式输出时是否累积完整文本，默认 `true`
- `negativePrompt` (可选): 负面提示词

**响应示例（JSON 模式）**：
```json
{
  "success": true,
  "model": "gpt-5-nano",
  "result": {
    "text": "生成的完整文本内容...",
    "mediaUrls": ["生成的文本"],
    "usage": {
      "prompt_tokens": 50,
      "completion_tokens": 200,
      "total_tokens": 250
    }
  }
}
```

##### Claude 4.5 Sonnet

```bash
POST /api/v1/cgi/text/claude-4.5-sonnet
Content-Type: application/json

{
  "prompt": "分析这张图片的内容",
  "max_tokens": 8192,
  "max_image_resolution": 0.5,
  "system_prompt": "你是一个专业的图像分析专家",
  "image": "https://example.com/image.jpg",  // 可选：单张图片输入
  "temperature": 0.7,
  "outputFormat": "stream",  // 支持流式输出
  "enableCollection": true
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `max_tokens` (可选): 最大输出 token 数，默认 8192，最大 8192
- `max_image_resolution` (可选): 最大图片分辨率（百万像素），默认 0.5，最大 2
- `system_prompt` (可选): 系统提示词
- `image` (可选): 输入图片（base64 或 URL），单张图片
- `temperature` (可选): 温度参数
- `outputFormat` (可选): `"json"` 或 `"stream"`，默认 `"json"`
- `enableCollection` (可选): 流式输出时是否累积完整文本，默认 `true`

##### DeepSeek R1

```bash
POST /api/v1/cgi/text/deepseek-r1
Content-Type: application/json

{
  "prompt": "解释量子计算的原理",
  "max_tokens": 20480,
  "temperature": 0.1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_p": 1,
  "system_prompt": "你是一个科学教育专家",
  "outputFormat": "json",
  "enableCollection": true
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `max_tokens` (可选): 最大输出 token 数，默认 20480
- `temperature` (可选): 温度参数，默认 0.1
- `presence_penalty` (可选): 存在惩罚，默认 0
- `frequency_penalty` (可选): 频率惩罚，默认 0
- `top_p` (可选): 核采样参数，默认 1
- `system_prompt` (可选): 系统提示词
- `outputFormat` (可选): `"json"` 或 `"stream"`，默认 `"json"`
- `enableCollection` (可选): 流式输出时是否累积完整文本，默认 `true`

##### Gemini 2.5 Flash

```bash
POST /api/v1/cgi/text/gemini-2.5-flash
Content-Type: application/json

{
  "prompt": "总结这篇文章的主要内容",
  "temperature": 1,
  "top_p": 0.95,
  "max_output_tokens": 65535,
  "system_instruction": "你是一个内容总结专家",
  "thinking_budget": 1000,  // 思考预算（0 禁用思考，更高的值允许更多推理）
  "image": "https://example.com/image.jpg",  // 可选：单张图片
  "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],  // 可选：多张图片
  "outputFormat": "stream",
  "enableCollection": true
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `temperature` (可选): 温度参数，默认 1，最大 2
- `top_p` (可选): 核采样，默认 0.95，最大 1
- `max_output_tokens` (可选): 最大输出 token 数，默认 65535，最大 65535
- `system_instruction` (可选): 系统指令（注意：不是 `system_prompt`）
- `thinking_budget` (可选): 思考预算（0 禁用思考，更高的值允许更多推理）
- `image` (可选): 输入图片（base64 或 URL），单张图片
- `images` (可选): 多张输入图片数组
- `outputFormat` (可选): `"json"` 或 `"stream"`，默认 `"json"`
- `enableCollection` (可选): 流式输出时是否累积完整文本，默认 `true`

##### Gemini 3 Pro

```bash
POST /api/v1/cgi/text/gemini-3-pro
Content-Type: application/json

{
  "prompt": "分析这些图片的相似之处",
  "temperature": 0.7,
  "top_p": 0.95,
  "top_k": 40,
  "max_tokens": 8192,
  "system_prompt": "你是一个图像分析专家",
  "image": "https://example.com/image.jpg",  // 可选：单张图片
  "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],  // 可选：多张图片
  "outputFormat": "json",
  "enableCollection": true
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `temperature` (可选): 温度参数
- `top_p` (可选): 核采样
- `top_k` (可选): Top-K 采样
- `max_tokens` (可选): 最大输出 token 数
- `system_prompt` (可选): 系统提示词
- `image` (可选): 输入图片（base64 或 URL），单张图片
- `images` (可选): 多张输入图片数组
- `outputFormat` (可选): `"json"` 或 `"stream"`，默认 `"json"`
- `enableCollection` (可选): 流式输出时是否累积完整文本，默认 `true`

#### 5.2.2 图片生成模型

##### Seedream 4

```bash
POST /api/v1/cgi/graph/seedream-4
Content-Type: application/json

{
  "prompt": "一只可爱的小猫坐在窗台上，阳光洒在它身上",
  "negativePrompt": "模糊，低质量",
  "size": "4K",  // 可选：'1K' | '2K' | '4K' | 'custom'
  "aspect_ratio": "16:9",  // 可选：宽高比，默认 'match_input_image'
  "width": 4096,  // 可选：自定义宽度（1024-4096），当 size='custom' 时使用
  "height": 4096,  // 可选：自定义高度（1024-4096），当 size='custom' 时使用
  "image_input": ["https://example.com/ref1.jpg", "https://example.com/ref2.jpg"],  // 可选：输入图片数组（1-10张），用于图片编辑或多参考生成
  "sequential_image_generation": "auto",  // 可选：'disabled' | 'auto'，是否启用序列图片生成
  "max_images": 5,  // 可选：最大生成图片数（1-15），当 sequential_image_generation='auto' 时使用
  "enableProgress": true  // 可选：是否启用进度监控（默认 true）
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `size` (可选): 图片尺寸，可选值：`'1K'` | `'2K'` | `'4K'` | `'custom'`
- `aspect_ratio` (可选): 宽高比，默认 `'match_input_image'`
- `width` (可选): 自定义宽度（1024-4096），当 `size='custom'` 时使用
- `height` (可选): 自定义高度（1024-4096），当 `size='custom'` 时使用
- `image_input` (可选): 输入图片数组（1-10张），用于图片编辑或多参考生成
- `sequential_image_generation` (可选): `'disabled'` | `'auto'`，是否启用序列图片生成
- `max_images` (可选): 最大生成图片数（1-15），当 `sequential_image_generation='auto'` 时使用
- `enableProgress` (可选): 是否启用进度监控，默认 `true`

**响应示例**：
```json
{
  "success": true,
  "model": "seedream-4",
  "result": {
    "image_urls": [
      "https://example.com/generated-image-1.jpg",
      "https://example.com/generated-image-2.jpg"
    ],
    "progress": "AsyncIterable<ProgressEvent>"  // 进度监控流（如果启用）
  }
}
```

##### Flux Fast

```bash
POST /api/v1/cgi/graph/flux-fast
Content-Type: application/json

{
  "prompt": "一个未来主义的城市，霓虹灯闪烁",
  "negativePrompt": "模糊，低质量",
  "aspect_ratio": "16:9",  // 可选：'1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  "num_outputs": 1,  // 可选：生成图片数量
  "output_format": "png",  // 可选：'png' | 'jpg' | 'webp'
  "safety_tolerance": 2  // 可选：安全过滤级别
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `aspect_ratio` (可选): 宽高比，可选值：`'1:1'` | `'3:2'` | `'2:3'` | `'3:4'` | `'4:3'` | `'4:5'` | `'5:4'` | `'9:16'` | `'16:9'` | `'21:9'`
- `num_outputs` (可选): 生成图片数量
- `output_format` (可选): 输出格式，可选值：`'png'` | `'jpg'` | `'webp'`
- `safety_tolerance` (可选): 安全过滤级别

##### Ideogram V2A

```bash
POST /api/v1/cgi/graph/ideogram-v2a
Content-Type: application/json

{
  "prompt": "一个包含文字 'Hello World' 的创意海报",
  "negativePrompt": "模糊，低质量",
  "aspect_ratio": "16:9",  // 可选：'1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  "resolution": "Auto",  // 可选：'Auto' | 自定义分辨率字符串
  "turbo": false,  // 可选：是否使用快速模式
  "magic_prompt_option": "AUTO",  // 可选：'AUTO' | 'ON' | 'OFF'
  "seed": 12345,  // 可选：随机种子 (0-2147483647)
  "style_type": "Design",  // 可选：'None' | 'Auto' | 'General' | 'Realistic' | 'Design' | 'Render 3D' | 'Anime'
  "num_images": 4  // 可选：生成图片数量 (1-8)
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `aspect_ratio` (可选): 宽高比，可选值：`'1:1'` | `'3:2'` | `'2:3'` | `'3:4'` | `'4:3'` | `'4:5'` | `'5:4'` | `'9:16'` | `'16:9'` | `'21:9'`
- `resolution` (可选): 分辨率，可选值：`'Auto'` 或自定义分辨率字符串
- `turbo` (可选): 是否使用快速模式，默认 `false`
- `magic_prompt_option` (可选): Magic Prompt 选项，可选值：`'AUTO'` | `'ON'` | `'OFF'`
- `seed` (可选): 随机种子 (0-2147483647)
- `style_type` (可选): 风格类型，可选值：`'None'` | `'Auto'` | `'General'` | `'Realistic'` | `'Design'` | `'Render 3D'` | `'Anime'`（注意：API 要求首字母大写格式）
- `num_images` (可选): 生成图片数量 (1-8)

##### Nano Banana

```bash
POST /api/v1/cgi/graph/nano-banana
Content-Type: application/json

{
  "prompt": "一只可爱的小猫坐在窗台上",
  "negativePrompt": "模糊，低质量",
  "aspect_ratio": "16:9",  // 可选：'1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  "image_size": "2K",  // 可选：'1K' | '2K' | '4K'
  "image": "https://example.com/image.jpg",  // 可选：图片 URL 或 base64（用于编辑）
  "image_urls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],  // 可选：多图 URL 列表
  "image_base64s": ["base64_string_1", "base64_string_2"],  // 可选：多图 base64 列表
  "enableProgress": true  // 可选：是否启用进度监控（默认 true）
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `aspect_ratio` (可选): 宽高比，可选值：`'1:1'` | `'3:2'` | `'2:3'` | `'3:4'` | `'4:3'` | `'4:5'` | `'5:4'` | `'9:16'` | `'16:9'` | `'21:9'`
- `image_size` (可选): 图片尺寸，可选值：`'1K'` | `'2K'` | `'4K'`
- `image` (可选): 图片 URL 或 base64（用于编辑）
- `image_urls` (可选): 多图 URL 列表
- `image_base64s` (可选): 多图 base64 列表
- `enableProgress` (可选): 是否启用进度监控，默认 `true`

##### Flux Kontext Fast

```bash
POST /api/v1/cgi/graph/flux-kontext-fast
Content-Type: application/json

{
  "prompt": "将这张图片的风格改为水彩画",
  "negativePrompt": "模糊，低质量",
  "aspect_ratio": "16:9",  // 可选：'1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  "input_image": "https://example.com/image.jpg",  // 可选：输入图片 URL 或 base64（用于编辑）
  "num_outputs": 1,  // 可选：生成图片数量
  "output_format": "png",  // 可选：'png' | 'jpg' | 'webp'
  "safety_tolerance": 2  // 可选：安全过滤级别
}
```

**完整参数说明**：
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `aspect_ratio` (可选): 宽高比，可选值：`'1:1'` | `'3:2'` | `'2:3'` | `'3:4'` | `'4:3'` | `'4:5'` | `'5:4'` | `'9:16'` | `'16:9'` | `'21:9'`
- `input_image` (可选): 输入图片 URL 或 base64（用于编辑）
- `num_outputs` (可选): 生成图片数量
- `output_format` (可选): 输出格式，可选值：`'png'` | `'jpg'` | `'webp'`
- `safety_tolerance` (可选): 安全过滤级别

##### Recraft Crisp Upscale

```bash
POST /api/v1/cgi/graph/recraft-crisp-upscale
Content-Type: application/json

{
  "prompt": "一个美丽的风景",  // 可选：放大模式可以不需要 prompt
  "negativePrompt": "模糊，低质量",
  "image_size": "square_hd",  // 可选：'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9'
  "style": "realistic_image",  // 可选：'realistic_image' | 'digital_illustration' | 'vector_illustration' | 'realistic_image/b_and_w' | 'digital_illustration/pixel_art' | 'vector_illustration/line_art' | 自定义字符串
  "colors": [{"r": 255, "g": 0, "b": 0}, {"r": 0, "g": 255, "b": 0}],  // 可选：颜色约束数组
  "num_images": 1,  // 可选：生成图片数量
  "input_image": "https://example.com/image.jpg"  // 可选：输入图片（用于编辑或放大）
}
```

**完整参数说明**：
- `prompt` (可选): 提示词（放大模式可以不需要）
- `negativePrompt` (可选): 负面提示词
- `image_size` (可选): 图片尺寸，可选值：`'square_hd'` | `'square'` | `'portrait_4_3'` | `'portrait_16_9'` | `'landscape_4_3'` | `'landscape_16_9'`
- `style` (可选): 风格，可选值：`'realistic_image'` | `'digital_illustration'` | `'vector_illustration'` | `'realistic_image/b_and_w'` | `'digital_illustration/pixel_art'` | `'vector_illustration/line_art'` | 自定义字符串
- `colors` (可选): 颜色约束数组，格式：`Array<{ r: number; g: number; b: number }>`
- `num_images` (可选): 生成图片数量
- `input_image` (可选): 输入图片（用于编辑或放大）

### 5.3 媒体类型说明

当前 mxmcgi 实际支持的媒体类型：

| 媒体类型 | 路由路径 | 说明 | 状态 |
|---------|---------|------|------|
| `text` | `/api/v1/cgi/text` | 文本生成 | ✅ 已实现 |
| `graph` | `/api/v1/cgi/graph` | 图片生成 | ✅ 已实现 |
| `music` | `/api/v1/cgi/music` | 音乐生成 | ⏳ 待实现 |
| `sound` | `/api/v1/cgi/sound` | 音频生成 | ⏳ 待实现 |
| `video` | `/api/v1/cgi/video` | 视频生成 | ⏳ 待实现 |

**注意**：
- 目前只有 `text` 和 `graph` 两种类型已完全实现
- `music`、`sound`、`video` 路由文件已创建但尚未实现
- 数据库表设计保留了扩展性，但实际使用时请使用已实现的类型

### 5.4 任务管理 API（待实现）

#### 5.4.1 创建生成任务（通过任务系统）

```bash
POST /api/v1/generation/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent_id": "agent-123",  // 可选
  "media_type": "graph",  // 'text' | 'graph' (目前仅支持这两种)
  "model_provider": "replicate",  // 可选：'replicate' | 'ppio' | 'deer'
  "model_name": "flux-fast",  // 可选：使用默认模型
  "task_type": "image_generation",  // 可选
  "input": {
    "prompt": "一只可爱的小猫",
    "parameters": {
      "aspect_ratio": "16:9",
      "num_outputs": 1
    }
  }
}
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "id": "task-uuid",
    "task_no": "GEN20240115123456",
    "media_type": "graph",
    "model_provider": "replicate",
    "model_name": "flux-fast",
    "status": "queued",
    "progress": 0,
    "estimated_time": 30,
    "created_at": "2025-01-15T12:34:56Z"
  }
}
```

#### 5.4.2 查询任务详情

```bash
GET /api/v1/generation/tasks/:id
Authorization: Bearer <token>
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "id": "task-uuid",
    "task_no": "GEN20240115123456",
    "agent_id": "agent-123",
    "media_type": "graph",
    "task_type": "image_generation",
    "model_provider": "replicate",
    "model_name": "flux-fast",
    "status": "completed",
    "progress": 100,
    "prompt": "一只可爱的小猫",
    "input_data": {
      "prompt": "一只可爱的小猫",
      "parameters": {
        "aspect_ratio": "16:9",
        "num_outputs": 1
      }
    },
    "output_data": {
      "media_urls": ["https://example.com/generated-image.jpg"],
      "metadata": {}
    },
    "media_urls": ["https://example.com/generated-image.jpg"],
    "cost": 0.04,
    "created_at": "2025-01-15T12:34:56Z",
    "started_at": "2025-01-15T12:34:57Z",
    "completed_at": "2025-01-15T12:35:10Z"
  }
}
```

### 5.5 获取可用模型列表

```bash
# 获取所有文本模型
GET /api/v1/cgi/text/models

# 获取所有图片模型
GET /api/v1/cgi/graph/models
```

**响应示例**：
```json
{
  "models": [
    {
      "name": "gpt-5-nano"
    },
    {
      "name": "claude-4.5-sonnet"
    },
    ...
  ]
}
```
