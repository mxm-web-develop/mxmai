# Graph Photograph 完整生成流程

## 流程概览

```
用户请求 → 路由层 → 任务创建 → 任务执行 → 提示词生成 → 图片生成 → 存储 → 返回结果
```

---

## 详细流程步骤

### 步骤 1: API 路由接收请求

**文件**: `mxmcgi/src/routes/graph.ts` (79-175行)

**输入**:
```typescript
POST /api/v1/cgi/graph/photograph
Headers: {
  'x-user-id': string  // 必需
}
Body: {
  type: 'portrait' | 'landscape' | 'cinematic' | 'commercial' | 'documentary',
  prompt: string,  // 必需
  // Portrait 相关参数（可选）
  style?: string,        // modern, vintage, fashion, etc.
  tone?: string,         // warm, cool, high-contrast, etc.
  environment?: string,  // indoor, outdoor, studio, etc.
  makeup?: string,       // natural, heavy, light, etc.
  pose?: string,         // standing, sitting, etc.
  lighting?: string,     // natural, soft, hard, etc.
  // 通用参数
  referenceImage?: string | string[],
  quality?: 'high' | 'fast',  // 默认 'high'
  aspect_ratio?: string,      // 如 '16:9', '9:16'
  storeToMinio?: boolean,     // 默认 true
  storageConfig?: { bucket: string, pathTemplate: string }
}
```

**处理逻辑**:
1. 验证 `x-user-id` header
2. 验证必需参数 (`type`, `prompt`)
3. 验证 `type` 是否在支持列表中
4. 设置默认 `storeToMinio = true`
5. 设置默认 `storageConfig`

**输出**:
```typescript
{
  taskId: string,
  status: 'pending',
  createdAt: string
}
```

**下一步**: 创建任务并异步执行

---

### 步骤 2: 创建任务

**文件**: `mxmcgi/src/routes/graph.ts` (127-140行)

**输入**:
```typescript
{
  type: 'graph',
  model: 'graph-photograph',
  provider?: ProviderType,
  params: {
    taskType: 'generate',
    graphType: 'photograph',
    ...用户传入的所有参数
  },
  userId: string,
  storeToMinio: boolean,
  storageConfig: object
}
```

**处理逻辑**:
- 调用 `taskManager.createTask()` 创建任务记录
- 任务状态初始为 `pending`

**输出**:
```typescript
{
  taskId: string,
  status: 'pending',
  createdAt: string
}
```

**下一步**: 异步执行任务（不阻塞响应）

---

### 步骤 3: 任务执行器分发

**文件**: `mxmcgi/src/core/task/task-executor.ts`

**输入**:
```typescript
{
  taskId: string,
  modelName: 'graph-photograph',
  provider?: ProviderType,
  params: { taskType, graphType, ...业务参数 },
  userId: string,
  storeToMinio: boolean,
  storageConfig: object
}
```

**处理逻辑**:
- 检测到 `type: 'graph'` 或 `modelName` 以 `graph-` 开头
- 调用 `startGraphTask(taskId)`

**输出**: 无直接输出，调用下一步

---

### 步骤 4: Graph 任务处理

**文件**: `mxmcgi/src/core/graph/graph-task.ts` (14-168行)

**输入**: `taskId: string`

**处理逻辑**:

#### 4.1 获取任务信息
```typescript
const task = await taskManager.getTask(taskId);
// task.requestParams 包含: { taskType, graphType, ...业务参数 }
```

#### 4.2 更新任务状态
- `pending` → `queued` (progress: 0)
- `queued` → `processing` (progress: 10, startedAt)

#### 4.3 解析参数
```typescript
const graphType = requestParams.graphType;  // 'photograph'
const graphParams = { ...requestParams };    // 排除 taskType, graphType, userId, provider
```

#### 4.4 调用核心服务生成图片
```typescript
const result = await generateGraph(
  graphType,      // 'photograph'
  graphParams,    // PhotographParams
  userId,
  provider
);
// 返回: { prompt: string, image_urls: string[], modelName: string }
```

#### 4.5 更新任务 metadata
```typescript
metadata: {
  model: result.modelName,              // 'nano-banana' 或 'seedream-4'
  'graph-type': 'graph-photograph',    // 业务类型
  generated_prompt: result.prompt       // 最终生成的提示词
}
```

#### 4.6 处理 MinIO 存储
- 检查 `storeToMinio` 和 `storageConfig`
- 如果有 base64 数据或启用存储，上传到 MinIO
- 更新进度为 90%
- 转换 base64 URLs 为 MinIO URLs

#### 4.7 保存任务结果
```typescript
{
  mediaUrls: string[],  // MinIO URLs 或原始 URLs
  metadata: {
    generated_prompt: string,
    graphType: 'photograph',
    type: 'portrait'
  },
  storageInfo?: {
    keys: string[],
    bucket: string,
    urls: string[]
  }
}
```

**输出**: 任务状态更新为 `completed`

---

### 步骤 5: 生成提示词（核心逻辑）

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (111-174行)

**函数**: `generateGraphPrompt()`

**输入**:
```typescript
{
  graphType: 'photograph',
  params: PhotographParams,
  userId?: string,
  provider?: ProviderType  // 默认 'deer'
}
```

**处理流程**:

#### 5.1 提取业务参数
```typescript
const businessParams = extractBusinessParams(params, 'photograph', 'portrait');
// 返回: { style, tone, environment, makeup, pose, lighting } (仅包含有值的参数)
```

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (49-64行)

#### 5.2 知识库召回（TODO - 暂未实现）
```typescript
let knowledgeContext = '';
// TODO: 后续实现系统内部知识库召回逻辑
// 召回策略（规划）:
// - 根据 style + tone + lighting + prompt 召回构图、机位、光线、风格、摄影师相关内容
// - 根据 prompt + environment + pose + makeup 召回背景、环境、姿势、妆容相关内容
// - 从系统知识库 graph-photograph-portrait 中检索
```

#### 5.3 检测输出语言
```typescript
const outputLanguage = detectOutputLanguage(userPrompt);
// 规则: 包含中文字符 → 'zh', 否则 → 'en'
```

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (16-19行)

#### 5.4 构建结构化用户需求（Portrait 专用）
```typescript
if (graphType === 'photograph' && type === 'portrait') {
  effectiveUserPrompt = buildPortraitUserPrompt(params, outputLanguage);
}
```

**文件**: `mxmcgi/src/core/graph/graphconfigs/photograph/portrait.ts` (51-160行)

**输入**: `PhotographParams`, `outputLanguage: 'zh' | 'en'`

**输出示例（中文）**:
```
你是一位时尚杂志肖像摄影师。
任务：一个优雅的女性
主体描述：一位人物主体（性别、年龄感与气质可根据业务场景自动补全），整体气质与用户需求和业务参数相匹配。
场景与构图：indoor，使用经典人像构图（如三分法），主体清晰，背景虚化，构图自然协调。
光线与氛围：soft，整体色调偏 warm，营造高级、立体的光影氛围。
色彩与风格：整体风格偏 modern，画面色彩统一，避免杂色干扰，突出人物气质。
表情与姿势：根据场景与人物设定，安排自然优雅的姿势与表情（例如：轻微微笑、自然放松的身体姿态），避免僵硬。
细节与质感：皮肤保留自然纹理与合理修饰，衣服褶皱与材质质感真实可信，头发与眼神细节清晰，整体画质专业级。
摄影师风格参考：如用户提供了参考摄影师或作品，可在风格上向其靠拢（例如：像时尚杂志封面一样的高级感），但避免直接抄袭。
输出规格：画面比例为 16:9，画面构图适合人像主体展示。
请在 500 字以内，根据以上要素整合为一段流畅的中文人像摄影提示词。
```

**如果有参考图**:
```
主体描述：参考 Image 1 作为人物主体，保持脸部、五官、发型、身材完全一致。
```

#### 5.5 构建提示词生成请求
```typescript
const promptGenerationRequest = buildPromptGenerationRequest(
  'photograph',
  'portrait',
  effectiveUserPrompt,
  businessParams,
  knowledgeContext,  // 当前为空
  outputLanguage
);
```

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (69-106行)

**构建逻辑**:
1. 获取特定类型的 rules（从 `graphconfigs/photograph/portrait.ts`）
2. 添加知识库内容（如果有）
3. 添加业务参数描述
4. 添加用户需求（结构化后的）
5. 添加输出要求（语言、格式）

**输出示例**:
```
你是一位顶级人像摄影师，擅长创作高质量的人像摄影作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的人像摄影提示词（prompt）。

【人像摄影专业要求】
1. 构图与机位：...
2. 光线与氛围：...
...

【用户选择的业务参数】
- style: modern
- tone: warm
- environment: indoor
- makeup: natural
- pose: standing
- lighting: soft

【用户需求】
你是一位时尚杂志肖像摄影师。
任务：一个优雅的女性
主体描述：...
...

【输出要求】
- 输出语言：中文
- 只输出最终图片生成提示词本身，不要包含其他说明文字：
```

#### 5.6 调用 LLM 生成提示词
```typescript
const textModelName = process.env.GRAPH_PROMPT_MODEL || 'gemini-3-pro';
const finalProvider = provider || 'deer';
const generatedPrompt = await generateText(textModelName, promptGenerationRequest, finalProvider);
```

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (24-44行)

**模型**: `gemini-3-pro` (默认)
**Provider**: `deer` (DeerAPI, 默认)

**输出**: 清理后的提示词字符串（移除引号、多余空格）

---

### 步骤 6: 生成图片

**文件**: `mxmcgi/src/core/graph/graph-service.ts` (179-225行)

**函数**: `generateGraphImage()`

**输入**:
```typescript
{
  graphType: 'photograph',
  params: PhotographParams,
  generatedPrompt: string,  // 步骤 5 生成的提示词
  provider?: ProviderType
}
```

**处理逻辑**:

#### 6.1 选择模型
```typescript
const modelName = quality === 'high' ? 'nano-banana' : 'seedream-4';
```

#### 6.2 准备图片参数
```typescript
let imageParams = {
  prompt: generatedPrompt,
  aspect_ratio: aspect_ratio
};

// 处理参考图
if (referenceImage) {
  if (modelName === 'nano-banana') {
    imageParams.image_urls = Array.isArray(referenceImage) ? referenceImage : [referenceImage];
  } else {  // seedream-4
    imageParams.image_input = Array.isArray(referenceImage) ? referenceImage : [referenceImage];
  }
}
```

#### 6.3 调用模型生成图片
```typescript
if (modelName === 'nano-banana') {
  const result = await nanoBanana.generate(imageParams, provider);
  return { image_urls: result.image_urls, modelName: 'nano-banana' };
} else {
  const result = await seedream4.generate(imageParams, provider);
  return { image_urls: result.image_urls, modelName: 'seedream-4' };
}
```

**模型映射**:
- `nano-banana`: Google Gemini 3 Pro (高质量)
- `seedream-4`: ByteDance Seedream 4 (快速)

**输出**:
```typescript
{
  image_urls: string[],  // Base64 URLs 或 HTTP URLs
  modelName: 'nano-banana' | 'seedream-4'
}
```

---

### 步骤 7: 存储到 MinIO

**文件**: `mxmcgi/src/core/graph/graph-task.ts` (83-140行)

**输入**:
```typescript
{
  image_urls: string[],  // 可能包含 base64
  storeToMinio: boolean,
  storageConfig: {
    bucket: string,
    pathTemplate: string  // '{userId}/graph/photograph/{timestamp}-{randomId}.{ext}'
  },
  userId: string
}
```

**处理逻辑**:
1. 检查是否有 base64 数据或启用存储
2. 调用 `storeFromGenerateResult()` 上传到 MinIO
3. 转换 base64 URLs 为 MinIO URLs
4. 修复可能的双冒号问题

**输出**:
```typescript
{
  keys: string[],      // MinIO object keys
  bucket: string,      // bucket 名称
  urls: string[]       // MinIO HTTP URLs
}
```

---

### 步骤 8: 更新任务结果

**文件**: `mxmcgi/src/core/graph/graph-task.ts` (142-154行)

**输入**:
```typescript
{
  mediaUrls: string[],  // MinIO URLs
  metadata: {
    generated_prompt: string,
    graphType: 'photograph',
    type: 'portrait'
  },
  storageInfo: {
    keys: string[],
    bucket: string,
    urls: string[]
  }
}
```

**处理逻辑**:
- 调用 `taskManager.setTaskResult()` 保存结果
- 任务状态自动更新为 `completed`

---

## 配置系统

### 规则配置（Rules）

**文件**: `mxmcgi/src/core/graph/graphconfigs/photograph/portrait.ts` (9-44行)

**内容**: 角色设定 + 专业规范，用于指导 LLM 生成提示词

**示例**:
```
你是一位顶级人像摄影师，擅长创作高质量的人像摄影作品。请严格根据用户需求、业务参数和知识库内容，设计一条用于 AI 图像生成的人像摄影提示词（prompt）。

【人像摄影专业要求】
1. 构图与机位：遵循三分法、黄金分割等经典构图原则...
2. 光线与氛围：根据用户选择的光线类型...
...
```

### 输出格式配置（Output Format）

**文件**: `mxmcgi/src/core/graph/graphconfigs/photograph/portrait.ts` (44行)

**内容**: 提示 LLM 输出应包含的要素

```
800字以内,要包含主体描述，场景与构图，光线与氛围，色彩与风格，细节与质感，摄影师风格参考等重要信息
```

### 参数配置

**文件**: `mxmcgi/src/core/graph/graphconfigs/photograph.ts` (101-107行)

**Portrait 类型参数**:
```typescript
['style', 'tone', 'environment', 'makeup', 'pose', 'lighting']
```

---

## 数据流图

```
用户请求
  ↓
路由层 (graph.ts)
  ├─ 验证参数
  ├─ 创建任务 (taskManager.createTask)
  └─ 异步执行 (taskExecutor.executeTask)
      ↓
任务执行器 (task-executor.ts)
  ├─ 检测 type: 'graph'
  └─ 调用 startGraphTask()
      ↓
Graph 任务处理 (graph-task.ts)
  ├─ 更新状态: pending → queued → processing
  ├─ 解析参数
  └─ 调用 generateGraph()
      ↓
核心服务 (graph-service.ts)
  ├─ generateGraphPrompt()
  │   ├─ 提取业务参数
  │   ├─ 知识库召回 (TODO)
  │   ├─ 检测输出语言
  │   ├─ 构建结构化用户需求 (portrait.ts)
  │   ├─ 构建提示词生成请求
  │   └─ 调用 LLM (gemini-3-pro via DeerAPI)
  │       ↓
  │   生成最终提示词
  │       ↓
  └─ generateGraphImage()
      ├─ 选择模型 (nano-banana / seedream-4)
      ├─ 准备参数 (prompt, aspect_ratio, referenceImage)
      └─ 调用图片生成模型 (via DeerAPI)
          ↓
      生成图片 (Base64 URLs)
          ↓
存储处理 (graph-task.ts)
  ├─ 检查 storeToMinio
  ├─ 上传到 MinIO (storeFromGenerateResult)
  └─ 转换 URLs
      ↓
保存结果 (taskManager.setTaskResult)
  ├─ 更新 metadata
  └─ 状态: completed
      ↓
返回给用户 (通过任务查询接口)
```

---

## 关键配置点

### 1. 提示词生成模型
- **模型**: `gemini-3-pro`
- **Provider**: `deer` (DeerAPI)
- **配置**: `process.env.GRAPH_PROMPT_MODEL` 或默认值

### 2. 图片生成模型
- **高质量**: `nano-banana` (Google Gemini 3 Pro)
- **快速**: `seedream-4` (ByteDance Seedream 4)
- **选择依据**: `params.quality` ('high' | 'fast')

### 3. 存储配置
- **默认启用**: `storeToMinio = true`
- **路径模板**: `{userId}/graph/photograph/{timestamp}-{randomId}.{ext}`
- **Bucket**: `process.env.CGI_STORAGE_BUCKET` 或 `'user-media'`

### 4. 语言检测
- **规则**: 用户 prompt 包含中文字符 → 输出中文，否则输出英文
- **实现**: `detectOutputLanguage()` 函数

---

## 待实现功能

### 知识库召回（TODO）

**位置**: `mxmcgi/src/core/graph/graph-service.ts` (122-125行)

**规划策略**:
1. **构图、机位、光线、风格、摄影师**:
   - 查询: `style + tone + lighting + prompt`
   - 知识库: `graph-photograph-portrait`
   - 召回数量: 10 chunks

2. **背景、环境、姿势、妆容**:
   - 查询: `prompt + environment + pose + makeup`
   - 知识库: `graph-photograph-portrait`
   - 召回数量: 10 chunks

3. **整合**:
   - 将召回内容拼接到 `knowledgeContext`
   - 传递给 `buildPromptGenerationRequest()`
   - LLM 根据 rules 和 outputformat 整合生成最终提示词

---

## 任务记录结构

### 创建时的 metadata
```typescript
{
  model: 'graph-photograph',
  provider: 'deer',
  userId: string,
  storeToMinio: boolean,
  storageConfig: object
}
```

### 执行后的 metadata
```typescript
{
  model: 'nano-banana' | 'seedream-4',  // 实际使用的模型
  'graph-type': 'graph-photograph',     // 业务类型
  generated_prompt: string,              // 最终生成的提示词
  userId: string,
  storeToMinio: boolean,
  storageConfig: object
}
```

### 任务结果
```typescript
{
  mediaUrls: string[],  // MinIO URLs
  metadata: {
    generated_prompt: string,
    graphType: 'photograph',
    type: 'portrait'
  },
  storageInfo: {
    keys: string[],
    bucket: string,
    urls: string[]
  }
}
```

---

## 错误处理

### 路由层错误
- 401: 缺少 `x-user-id` header
- 400: 缺少必需参数或无效的 type
- 500: 任务创建失败

### 任务执行错误
- 任务不存在: 抛出错误，状态更新为 `failed`
- 参数解析失败: 抛出错误，状态更新为 `failed`
- 提示词生成失败: 抛出错误，状态更新为 `failed`
- 图片生成失败: 抛出错误，状态更新为 `failed`
- 存储失败: 记录错误，但不影响任务完成（使用原始 URLs）

---

## 调试日志

### Graph Service 日志
```
[GraphService] 提示词生成开始 (graphType: photograph, type: portrait, outputLanguage: zh, userId: ...)
[GraphService] 使用规则前缀: 你是一位顶级人像摄影师...
[GraphService] 业务参数: { style: 'modern', tone: 'warm', ... }
[GraphService] 提示词生成请求前缀: 你是一位顶级人像摄影师...
[GraphService] 使用模型: gemini-3-pro, Provider: deer
[GraphService] 生成的提示词前缀: ...
```

### Graph Task 日志
```
[GraphTask] 图片已上传到MinIO (taskId: ..., count: 1)
[GraphTask] 任务 ... 完成
[GraphTask] 任务 ... 执行失败: ...
```

---

## 总结

整个流程分为 8 个主要步骤，从用户请求到最终返回结果：

1. **路由层**: 接收并验证请求
2. **任务创建**: 创建异步任务记录
3. **任务分发**: 路由到 Graph 任务处理器
4. **任务处理**: 协调整个生成流程
5. **提示词生成**: 使用 LLM 生成专业提示词
6. **图片生成**: 调用图片生成模型
7. **存储处理**: 上传到 MinIO
8. **结果保存**: 更新任务状态和结果

**关键特性**:
- ✅ 异步任务处理
- ✅ 多模型支持（nano-banana / seedream-4）
- ✅ 参考图支持
- ✅ 结构化提示词生成（Portrait 类型）
- ✅ 中英文自动检测
- ✅ MinIO 存储集成
- ⏳ 知识库召回（待实现）
