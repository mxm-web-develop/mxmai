# 知识库模块

## 概述

知识库模块提供完整的知识库管理功能，包括：
- 创建知识库
- 上传文件并自动解析
- 生成 embedding
- 更新知识库
- 删除知识库
- 搜索召回数据

## 模块结构

```
core/knowledge/
├── embedding/              # Embedding 模块
│   ├── types.ts           # Embedding Provider 接口定义
│   ├── factory.ts         # Embedding Provider 工厂
│   ├── service.ts         # Embedding 服务（统一接口）
│   ├── providers/         # 各种 Embedding Provider 实现
│   │   ├── deer.provider.ts  # DeerAPI Provider
│   │   └── index.ts
│   └── index.ts
├── file-parser.ts          # 文件解析服务（PDF、TXT、MD等）
├── knowledge-service.ts     # 知识库核心服务
└── index.ts                # 模块导出
```

## 核心服务

### 1. EmbeddingService

统一的 Embedding 服务接口，支持多个 provider（DeerAPI、OpenAI、Azure 等）。

```typescript
import { EmbeddingService } from './core/knowledge';

// 使用默认 provider（从环境变量 EMBEDDING_PROVIDER 读取，默认 'deer'）
const embeddingService = EmbeddingService.fromEnv();

// 生成单个文本的 embedding
const embedding = await embeddingService.embedQuery('文本内容');

// 批量生成 embedding
const embeddings = await embeddingService.embedBatch(['文本1', '文本2']);

// 指定 provider 和模型
const embedding2 = await embeddingService.embedQuery(
  '文本内容',
  'text-embedding-3-large',
  'deer'
);
```

### 1.1 EmbeddingProviderFactory

管理多个 embedding provider，支持自动选择和切换。

```typescript
import { embeddingProviderFactory } from './core/knowledge/embedding';

// 使用默认 provider
const provider = embeddingProviderFactory.get();

// 指定 provider
const deerProvider = embeddingProviderFactory.get('deer');

// 根据模型自动选择 provider
const provider2 = embeddingProviderFactory.getProviderForModel('text-embedding-3-small');

// 直接生成 embedding
const result = await embeddingProviderFactory.embed({
  input: '文本内容',
  model: 'text-embedding-3-small',
});
```

### 2. FileParser

解析文件（PDF、TXT、MD等），提取文本并分割成 chunks。

```typescript
import { FileParser } from './core/knowledge';

const parser = new FileParser({
  chunkSize: 2000,      // 每个 chunk 的最大字符数
  chunkOverlap: 200,    // chunk 之间的重叠字符数
  maxChunkSize: 5000,   // 单个 chunk 的最大字符数
});

const parsed = await parser.parseFile(buffer, 'document.pdf');
// parsed.chunks 包含分割后的文本块
```

### 3. KnowledgeService

知识库的核心服务，提供完整的生命周期管理。

```typescript
import { KnowledgeService } from './core/knowledge';

const service = new KnowledgeService();

// 创建知识库
const kb = await service.createKnowledgeBase({
  name: 'agent-image',
  display_name: '图像生成知识库',
  type: 'hybrid',
});

// 上传文件
const result = await service.uploadFile({
  knowledgeBaseName: 'agent-image',
  file: {
    buffer: fileBuffer,
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: fileBuffer.length,
  },
  userId: 'user-123',
  tags: ['摄影', '技巧'],
});

// 搜索知识库
const results = await service.search({
  knowledgeBaseName: 'agent-image',
  query: '如何拍摄人像？',
  searchType: 'hybrid',
  limit: 5,
});
```

## API 接口

### 创建知识库

```http
POST /knowledge/bases
Content-Type: application/json
x-user-id: <userId>

{
  "name": "agent-image",
  "display_name": "图像生成知识库",
  "description": "图像生成相关的专业知识",
  "type": "hybrid",
  "embedding_model": "text-embedding-3-small",
  "agent_id": "image-generation-agent",
  "agent_name": "图像生成助手",
  "is_builtin": false,
  "is_public": true
}
```

### 上传文件

```http
POST /knowledge/bases/:name/upload
Content-Type: multipart/form-data
x-user-id: <userId>

file: <file>
tags: ["标签1", "标签2"]  # 可选，JSON 字符串
metadata: {"source": "文档来源"}  # 可选，JSON 字符串
is_public: true  # 可选
```

### 搜索知识库

```http
POST /knowledge/bases/:name/search
Content-Type: application/json
x-user-id: <userId>

{
  "query": "如何拍摄人像？",
  "search_type": "hybrid",  # vector | keyword | hybrid
  "limit": 5,
  "threshold": 0.7,
  "vector_weight": 0.7,
  "keyword_weight": 0.3
}
```

### 列出知识库

```http
GET /knowledge/bases?agent_id=xxx&is_public=true&limit=10&offset=0
x-user-id: <userId>
```

### 获取知识库信息

```http
GET /knowledge/bases/:name
```

### 更新知识库

```http
PUT /knowledge/bases/:name
Content-Type: application/json

{
  "display_name": "新名称",
  "description": "新描述",
  "is_public": true
}
```

### 删除知识库

```http
DELETE /knowledge/bases/:name
```

### 列出文档

```http
GET /knowledge/bases/:name/documents?limit=20&offset=0
x-user-id: <userId>
```

### 删除文档

```http
DELETE /knowledge/documents/:id
```

## 使用示例

### 完整流程示例

```typescript
// 1. 创建知识库
const kb = await fetch('http://localhost:4003/knowledge/bases', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'user-123',
  },
  body: JSON.stringify({
    name: 'agent-image',
    display_name: '图像生成知识库',
    type: 'hybrid',
  }),
});

// 2. 上传文件
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');
formData.append('tags', JSON.stringify(['摄影', '技巧']));

const uploadResult = await fetch('http://localhost:4003/knowledge/bases/agent-image/upload', {
  method: 'POST',
  headers: {
    'x-user-id': 'user-123',
  },
  body: formData,
});

// 3. 搜索知识库
const searchResult = await fetch('http://localhost:4003/knowledge/bases/agent-image/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'user-123',
  },
  body: JSON.stringify({
    query: '如何拍摄人像？',
    search_type: 'hybrid',
    limit: 5,
  }),
});
```

## 环境变量

```bash
# DeerAPI 配置（用于 embedding）
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx

# Embedding 模型（可选，默认 text-embedding-3-small）
EMBEDDING_MODEL=text-embedding-3-small
```

## 注意事项

1. **PDF 解析**：当前 PDF 解析功能需要安装 `pdf-parse` 库。如果需要支持 PDF，请运行：
   ```bash
   npm install pdf-parse
   ```

2. **文件大小限制**：默认 Express body parser 限制为 20MB，大文件可能需要调整配置。

3. **Embedding 成本**：批量生成 embedding 会调用 DeerAPI，注意 API 调用成本。

4. **Chunk 大小**：建议 chunk 大小为 500-2000 字符，过大可能影响检索效果。

5. **搜索类型**：
   - `vector`：基于语义相似度，适合理解用户意图
   - `keyword`：基于文本匹配，适合精确关键词搜索
   - `hybrid`：结合向量和关键词，推荐使用

## 错误处理

所有 API 接口返回统一格式：

```json
{
  "success": true,
  "data": { ... }
}
```

或

```json
{
  "success": false,
  "error": "错误信息"
}
```

