# Gateway API 接口文档

## 基础信息

- **Gateway 地址**: `http://localhost:3000`
- **认证方式**: Bearer Token
- **Content-Type**: `application/json`

---

## 图片生成接口 (Graph)

### 1. 获取可用模型列表

```http
GET /api/v1/cgi/graph/models
Authorization: Bearer <token>
```

**响应示例**:
```json
{
  "models": [
    { "name": "seedream-4" },
    { "name": "flux-fast" },
    { "name": "ideogram-v2a" },
    { "name": "nano-banana" },
    { "name": "flux-kontext-fast" },
    { "name": "recraft-crisp-upscale" }
  ]
}
```

### 2. 生成图片

```http
POST /api/v1/cgi/graph/:modelName?provider=<provider>
Authorization: Bearer <token>
Content-Type: application/json
```

**路径参数**:
- `modelName`: 模型名称（见下方模型列表）

**Query 参数**:
- `provider` (可选): Provider 类型，可选值: `replicate` | `ppio` | `deer`

**请求体参数**:

#### 通用参数（所有模型）
- `prompt` (必需): 提示词
- `negativePrompt` (可选): 负面提示词
- `save_to_claude` (可选): 是否保存到 minio，`true` 保存文件+元数据，`false` 只保存元数据
- `storage_bucket` (可选): 自定义存储桶名称
- `storage_path` (可选): 自定义存储路径前缀

---

### 模型详细参数

#### 2.1 Seedream-4 ($0.03)

**接口**: `POST /api/v1/cgi/graph/seedream-4`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "size": "1K" | "2K" | "4K" | "custom",
  "aspect_ratio": "match_input_image",
  "width": 1024,  // 当 size='custom' 时使用，范围 1024-4096
  "height": 1024, // 当 size='custom' 时使用，范围 1024-4096
  "image_input": ["url1", "url2"], // 输入图片数组（1-10张），用于图片编辑或多参考生成
  "sequential_image_generation": "disabled" | "auto",
  "max_images": 15, // 最大生成图片数（1-15），当 sequential_image_generation='auto' 时使用
  "enableProgress": true, // 是否启用进度监控
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "seedream-4",
  "result": {
    "image_urls": ["https://..."],
    "progress": "AsyncIterable<any>"
  }
}
```

---

#### 2.2 Flux-Fast ($0.04)

**接口**: `POST /api/v1/cgi/graph/flux-fast`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "aspect_ratio": "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9",
  "num_outputs": 1,
  "output_format": "png" | "jpg" | "webp",
  "safety_tolerance": 2,
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "flux-fast",
  "result": {
    "image_urls": ["https://..."]
  }
}
```

---

#### 2.3 Ideogram-V2A ($0.08)

**接口**: `POST /api/v1/cgi/graph/ideogram-v2a`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "aspect_ratio": "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9",
  "resolution": "Auto" | string,
  "turbo": false, // 是否使用快速模式
  "magic_prompt_option": "AUTO" | "ON" | "OFF",
  "seed": 12345, // 随机种子 (0-2147483647)
  "style_type": "Anime", // 注意：前端已硬编码为 "Anime"
  "num_images": 1, // 生成图片数量 (1-8)
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "ideogram-v2a",
  "result": {
    "image_urls": ["https://..."]
  }
}
```

---

#### 2.4 Nano-Banana (Google Gemini 3 Pro Image Preview)

**接口**: `POST /api/v1/cgi/graph/nano-banana`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "aspect_ratio": "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9",
  "image_size": "1K" | "2K" | "4K",
  "image": "url_or_base64", // 图片 URL 或 base64（用于编辑）
  "image_urls": ["url1", "url2"], // 多图 URL 列表
  "image_base64s": ["base64_1", "base64_2"], // 多图 base64 列表
  "enableProgress": true, // 是否启用进度监控（默认 true）
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "nano-banana",
  "result": {
    "image_urls": ["https://..."],
    "progress": "AsyncIterable<any>"
  }
}
```

---

#### 2.5 Flux-Kontext-Fast ($0.08)

**接口**: `POST /api/v1/cgi/graph/flux-kontext-fast`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "aspect_ratio": "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9",
  "input_image": "url_or_base64", // 输入图片 URL 或 base64（用于编辑）
  "num_outputs": 1, // 生成图片数量
  "output_format": "png" | "jpg" | "webp",
  "safety_tolerance": 2, // 安全过滤级别
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "flux-kontext-fast",
  "result": {
    "image_urls": ["https://..."]
  }
}
```

---

#### 2.6 Recraft-Crisp-Upscale

**接口**: `POST /api/v1/cgi/graph/recraft-crisp-upscale`

**参数**:
```json
{
  "prompt": "A beautiful landscape",
  "image_size": "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9",
  "style": "realistic_image" | "digital_illustration" | "vector_illustration" | "realistic_image/b_and_w" | "digital_illustration/pixel_art" | "vector_illustration/line_art" | string,
  "colors": [{"r": 255, "g": 0, "b": 0}], // 颜色约束数组
  "num_images": 1, // 生成图片数量
  "input_image": "url_or_base64", // 输入图片（用于编辑或放大）
  "save_to_claude": true
}
```

**响应**:
```json
{
  "success": true,
  "model": "recraft-crisp-upscale",
  "result": {
    "image_urls": ["https://..."]
  }
}
```

---

## 文本生成接口 (Text)

### 1. 获取可用模型列表

```http
GET /api/v1/cgi/text/models
Authorization: Bearer <token>
```

**响应示例**:
```json
{
  "models": [
    { "name": "claude-4.5-sonnet" },
    { "name": "deepseek-r1" },
    { "name": "gemini-2.5-flash" },
    { "name": "gemini-3-pro" },
    { "name": "gpt-5-nano" }
  ]
}
```

### 2. 生成文本

```http
POST /api/v1/cgi/text/:modelName?provider=<provider>
Authorization: Bearer <token>
Content-Type: application/json
```

**路径参数**:
- `modelName`: 模型名称（见下方模型列表）

**Query 参数**:
- `provider` (可选): Provider 类型，可选值: `replicate` | `ppio` | `deer`

**请求体参数**:

#### 通用参数（所有模型）
- `prompt` (必需): 提示词
- `outputFormat` (可选): 输出格式，`'stream'` 或 `'json'`（默认 `'json'`）
- `system_prompt` (可选): 系统提示词
- `save_to_claude` (可选): 是否保存到 minio，`true` 保存文件+元数据，`false` 只保存元数据

---

### 模型详细参数

#### 2.1 Claude-4.5-Sonnet

**接口**: `POST /api/v1/cgi/text/claude-4.5-sonnet`

**参数**:
```json
{
  "prompt": "Write a story about...",
  "max_tokens": 8192, // 最大输出 token 数，默认 8192，最大 8192
  "max_image_resolution": 0.5, // 最大图片分辨率（百万像素），默认 0.5，最大 2
  "system_prompt": "You are a helpful assistant",
  "image": "base64_or_url", // 输入图片（base64 或 URL）
  "temperature": 0.7, // 温度参数
  "outputFormat": "stream" | "json", // 输出格式
  "enableCollection": true, // 是否启用 collection 累积（默认 true）
  "save_to_claude": false
}
```

**响应（JSON 模式）**:
```json
{
  "success": true,
  "model": "claude-4.5-sonnet",
  "result": {
    "text": "完整生成的文本",
    "usage": {
      "prompt_tokens": 100,
      "completion_tokens": 200,
      "total_tokens": 300
    }
  }
}
```

**响应（Stream 模式）**:
```
Content-Type: text/event-stream

data: {"chunk":"Hello","status":"streaming","collection":"Hello"}
data: {"chunk":" world","status":"streaming","collection":"Hello world"}
data: {"chunk":"","status":"completed","collection":"Hello world"}
data: [DONE]
```

---

#### 2.2 DeepSeek-R1

**接口**: `POST /api/v1/cgi/text/deepseek-r1`

**参数**:
```json
{
  "prompt": "Write a story about...",
  "max_tokens": 20480, // 最大输出 token 数，默认 20480
  "temperature": 0.1, // 温度参数，默认 0.1
  "presence_penalty": 0, // 存在惩罚，默认 0
  "frequency_penalty": 0, // 频率惩罚，默认 0
  "top_p": 1, // 核采样参数，默认 1
  "system_prompt": "You are a helpful assistant",
  "outputFormat": "stream" | "json",
  "enableCollection": true,
  "save_to_claude": false
}
```

**响应格式**: 同 Claude-4.5-Sonnet

---

#### 2.3 Gemini-2.5-Flash

**接口**: `POST /api/v1/cgi/text/gemini-2.5-flash`

**参数**:
```json
{
  "prompt": "Write a story about...",
  "max_tokens": 8192, // 最大输出 token 数，默认 8192
  "temperature": 0.7, // 温度参数，默认 0.7
  "top_p": 0.95, // 核采样参数，默认 0.95
  "top_k": 40, // Top-K 采样，默认 40
  "system_prompt": "You are a helpful assistant",
  "image": "base64_or_url", // 输入图片（base64 或 URL）
  "images": ["url1", "url2"], // 多图 URL 列表
  "outputFormat": "stream" | "json",
  "enableCollection": true,
  "save_to_claude": false
}
```

**响应格式**: 同 Claude-4.5-Sonnet

---

#### 2.4 Gemini-3-Pro

**接口**: `POST /api/v1/cgi/text/gemini-3-pro`

**参数**:
```json
{
  "prompt": "Write a story about...",
  "max_tokens": 8192, // 最大输出 token 数，默认 8192
  "temperature": 0.7, // 温度参数，默认 0.7
  "top_p": 0.95, // 核采样参数，默认 0.95
  "top_k": 40, // Top-K 采样，默认 40
  "system_prompt": "You are a helpful assistant",
  "image": "base64_or_url", // 输入图片（base64 或 URL）
  "images": ["url1", "url2"], // 多图 URL 列表
  "outputFormat": "stream" | "json",
  "enableCollection": true,
  "save_to_claude": false
}
```

**响应格式**: 同 Claude-4.5-Sonnet

---

#### 2.5 GPT-5-Nano

**接口**: `POST /api/v1/cgi/text/gpt-5-nano`

**参数**:
```json
{
  "prompt": "Write a story about...",
  "max_completion_tokens": 4096, // 最大完成 token 数
  "temperature": 0.7, // 温度参数 (0-2)，默认 0.7
  "top_p": 1, // 核采样参数 (0-1)，默认 1
  "frequency_penalty": 0, // 频率惩罚 (-2 到 2)，默认 0
  "presence_penalty": 0, // 存在惩罚 (-2 到 2)，默认 0
  "system_prompt": "You are a helpful assistant",
  "image_input": ["url1", "url2"], // 输入图片数组
  "outputFormat": "stream" | "json",
  "enableCollection": true,
  "save_to_claude": false
}
```

**响应格式**: 同 Claude-4.5-Sonnet

---

## 存储配置

### save_to_claude 参数说明

- `save_to_claude: true`: 
  - 下载生成的文件并保存到 minio
  - 保存元数据到数据库（使用 minio URL）
  
- `save_to_claude: false`: 
  - 只保存元数据到数据库（使用原始 URL）
  - 文件直接返回给用户，不下载

- 未设置 `save_to_claude`: 
  - 不进行任何存储操作

### 存储配置参数（可选）

- `storage_bucket`: 自定义存储桶名称（默认: `user-media`，可通过环境变量 `CGI_STORAGE_BUCKET` 配置）
- `storage_path`: 自定义存储路径前缀（默认: `media`，可通过环境变量 `CGI_STORAGE_PATH` 配置）

**优先级**: 请求参数 > 环境变量 > 默认值

---

## 错误响应

### 通用错误格式

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message"
  }
}
```

### 常见错误码

- `UNAUTHORIZED`: 未授权（缺少或无效的 token）
- `PROXY_ERROR`: 代理错误（后端服务不可用）
- `Model not found`: 模型不存在
- `Missing required parameter`: 缺少必需参数
- `Generation failed`: 生成失败

---

## 示例请求

### 图片生成示例

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/seedream-4?provider=replicate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "size": "2K",
    "aspect_ratio": "16:9",
    "save_to_claude": true
  }'
```

### 文本生成示例（JSON 模式）

```bash
curl -X POST http://localhost:3000/api/v1/cgi/text/claude-4.5-sonnet?provider=anthropic \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a short story about a robot",
    "max_tokens": 500,
    "temperature": 0.7,
    "outputFormat": "json",
    "save_to_claude": false
  }'
```

### 文本生成示例（Stream 模式）

```bash
curl -X POST http://localhost:3000/api/v1/cgi/text/claude-4.5-sonnet?provider=anthropic \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a short story about a robot",
    "max_tokens": 500,
    "temperature": 0.7,
    "outputFormat": "stream",
    "save_to_claude": false
  }'
```

---

## 环境变量配置

### Gateway 环境变量

```bash
# Gateway 端口
PORT=3000

# mxmcgi 服务地址
MXMCGI_URL=http://localhost:4003

# 存储配置（可选）
CGI_STORAGE_BUCKET=user-media
CGI_STORAGE_PATH=media
```

### mxmcgi 环境变量

```bash
# mxmcgi 端口
PORT=4003

# Provider 配置
PROVIDER_DEFAULT=uniapi
REPLICATE_API_TOKEN=your_token
PPIO_API_KEY=your_key
DEERAPI_API_KEY=your_key
```
