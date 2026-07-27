# Graph业务接口调用示例

本文档提供了三个graph业务接口的详细调用示例。

## 基础信息

- 基础URL: `http://localhost:3000/api/v1/cgi/graph`
- 认证: 需要在请求头中提供 `x-user-id`
- 响应格式: JSON（异步任务模式，返回taskId）

## 1. 摄影接口 (Photograph)

### 1.1 人像摄影 (Portrait)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "portrait",
    "prompt": "一个优雅的女性",
    "style": "modern",
    "tone": "warm",
    "environment": "indoor",
    "makeup": "natural",
    "pose": "standing",
    "lighting": "soft",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb1",
        "query": "人像摄影 现代风格",
        "limit": 5
      }
    ],
    "referenceImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "quality": "high",
    "aspect_ratio": "16:9"
  }'
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "taskId": "abc123def456",
    "status": "pending",
    "createdAt": "2025-01-17T10:30:00.000Z"
  }
}
```

### 1.2 风景摄影 (Landscape)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "landscape",
    "prompt": "山间日出",
    "timeOfDay": "dawn",
    "weather": "sunny",
    "season": "spring",
    "composition": "rule-of-thirds",
    "quality": "high",
    "aspect_ratio": "16:9"
  }'
```

### 1.3 电影画面 (Cinematic)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "cinematic",
    "prompt": "未来都市夜景",
    "filmStyle": "cyberpunk",
    "mood": "mysterious",
    "cameraAngle": "bird-eye",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb2",
        "query": "赛博朋克 电影画面",
        "limit": 5
      }
    ],
    "quality": "high"
  }'
```

### 1.4 产品商业拍摄 (Commercial)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "commercial",
    "prompt": "高端手表产品图",
    "productType": "watch",
    "background": "minimalist",
    "props": "none",
    "quality": "high",
    "aspect_ratio": "1:1"
  }'
```

### 1.5 纪事摄影 (Documentary)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "documentary",
    "prompt": "街头生活场景",
    "eventType": "daily-life",
    "documentaryStyle": "candid",
    "quality": "high"
  }'
```

## 2. 设计接口 (Design)

### 2.1 3D设计

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/design \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "3d",
    "prompt": "一个现代风格的3D图标",
    "modelStyle": "low-poly",
    "material": "metal",
    "lighting": "three-point",
    "perspective": "isometric",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb3",
        "query": "3D设计 低多边形",
        "limit": 5
      }
    ],
    "referenceImage": ["https://example.com/reference1.jpg"],
    "quality": "fast",
    "aspect_ratio": "1:1"
  }'
```

### 2.2 使用手册 (Manual)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/design \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "manual",
    "prompt": "产品操作指南",
    "layout": "grid",
    "colorScheme": "blue-white",
    "typography": "sans-serif",
    "quality": "fast"
  }'
```

### 2.3 画报 (Poster)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/design \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "poster",
    "prompt": "电影宣传海报",
    "artStyle": "vintage",
    "theme": "retro",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb4",
        "query": "复古海报设计",
        "limit": 5
      }
    ],
    "quality": "high",
    "aspect_ratio": "3:4"
  }'
```

### 2.4 图标 (Icon)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/design \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "icon",
    "prompt": "应用图标设计",
    "iconStyle": "flat",
    "size": "512x512",
    "quality": "fast",
    "aspect_ratio": "1:1"
  }'
```

## 3. 绘画接口 (Painting)

### 3.1 插图 (Illustration)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/painting \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "illustration",
    "prompt": "一个可爱的卡通角色",
    "illustrationStyle": "flat",
    "colorPalette": "warm",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb5",
        "query": "扁平化插画",
        "limit": 5
      }
    ],
    "referenceImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "quality": "high",
    "aspect_ratio": "16:9"
  }'
```

### 3.2 漫画 (Comic)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/painting \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "comic",
    "prompt": "超级英雄战斗场景",
    "comicStyle": "american",
    "panelLayout": "multi-panel",
    "quality": "high"
  }'
```

### 3.3 原画 (Concept Art)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/painting \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "conceptArt",
    "prompt": "游戏角色设计",
    "conceptArtStyle": "realistic",
    "detailLevel": "high",
    "knowledgeBase": [
      {
        "knowledgeBaseId": "kb6",
        "query": "游戏原画 角色设计",
        "limit": 5
      }
    ],
    "quality": "high"
  }'
```

### 3.4 卡通 (Cartoon)

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/painting \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "type": "cartoon",
    "prompt": "可爱的动物角色",
    "cartoonStyle": "chibi",
    "characterDesign": "cute",
    "quality": "high"
  }'
```

## 4. 查询任务状态

创建任务后，可以通过taskId查询任务状态：

```bash
curl -X GET http://localhost:3000/api/v1/cgi-tasks/{taskId} \
  -H "x-user-id: user123"
```

**响应示例（进行中）：**
```json
{
  "success": true,
  "task": {
    "id": "abc123def456",
    "type": "graph",
    "status": "processing",
    "progress": {
      "status": "processing",
      "progress": 50
    },
    "metadata": {
      "model": "graph-photograph",
      "provider": "deer",
      "userId": "user123"
    },
    "createdAt": "2025-01-17T10:30:00.000Z",
    "updatedAt": "2025-01-17T10:30:30.000Z"
  }
}
```

**响应示例（已完成）：**
```json
{
  "success": true,
  "task": {
    "id": "abc123def456",
    "type": "graph",
    "status": "completed",
    "progress": {
      "status": "completed",
      "progress": 100,
      "completedAt": "2025-01-17T10:31:00.000Z"
    },
    "result": {
      "mediaUrls": [
        "https://example.com/generated-image.jpg"
      ],
      "metadata": {
        "prompt": "A professional portrait of an elegant woman, modern style, warm tone, indoor environment, natural makeup, standing pose, soft lighting, 16:9 aspect ratio",
        "graphType": "photograph",
        "type": "portrait"
      }
    },
    "metadata": {
      "model": "graph-photograph",
      "provider": "deer",
      "userId": "user123"
    },
    "createdAt": "2025-01-17T10:30:00.000Z",
    "updatedAt": "2025-01-17T10:31:00.000Z"
  }
}
```

## 5. 参数说明

### 5.1 通用参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 小类型（如portrait、landscape等） |
| `prompt` | string | ✅ | 用户需求描述 |
| `knowledgeBase` | array | ❌ | 知识库配置数组 |
| `referenceImage` | string\|array | ❌ | 参考图（单张或多张，支持base64或URL） |
| `quality` | string | ❌ | 质量选择：'high'（nano-banana）或'fast'（seedream-4），默认'high' |
| `aspect_ratio` | string | ❌ | 宽高比（如'16:9'、'1:1'等） |
| `storeToMinio` | boolean | ❌ | 是否存储到MinIO，默认false |

### 5.2 知识库配置格式

```json
{
  "knowledgeBase": [
    {
      "knowledgeBaseId": "kb1",
      "query": "搜索关键词",
      "limit": 5
    }
  ]
}
```

### 5.3 参考图格式

**单张图片（base64）：**
```json
{
  "referenceImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**单张图片（URL）：**
```json
{
  "referenceImage": "https://example.com/image.jpg"
}
```

**多张图片（数组）：**
```json
{
  "referenceImage": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ]
}
```

## 6. 错误处理

### 6.1 缺少必需参数

```json
{
  "success": false,
  "error": "Missing required parameters",
  "message": "type and prompt are required"
}
```

### 6.2 无效的类型

```json
{
  "success": false,
  "error": "Invalid type",
  "message": "Type \"invalid_type\" is not supported. Valid types: portrait, landscape, cinematic, commercial, documentary"
}
```

### 6.3 任务执行失败

查询任务时，如果任务失败，status为'failed'：

```json
{
  "success": true,
  "task": {
    "id": "abc123def456",
    "status": "failed",
    "progress": {
      "status": "failed",
      "error": "错误信息描述"
    }
  }
}
```

## 7. JavaScript/TypeScript 调用示例

### 7.1 使用 fetch API

```typescript
async function generatePhotograph(params: {
  type: string;
  prompt: string;
  style?: string;
  tone?: string;
  // ... 其他参数
}) {
  const response = await fetch('http://localhost:3000/api/v1/cgi/graph/photograph', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user123',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  return data.data.taskId;
}

// 使用示例
const taskId = await generatePhotograph({
  type: 'portrait',
  prompt: '一个优雅的女性',
  style: 'modern',
  tone: 'warm',
  quality: 'high',
});
```

### 7.2 轮询任务状态

```typescript
async function waitForTaskCompletion(taskId: string, userId: string): Promise<any> {
  const maxAttempts = 60; // 最多轮询60次
  const interval = 2000; // 每2秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`http://localhost:3000/api/v1/cgi-tasks/${taskId}`, {
      headers: {
        'x-user-id': userId,
      },
    });

    const data = await response.json();
    const task = data.task;

    if (task.status === 'completed') {
      return task.result;
    } else if (task.status === 'failed') {
      throw new Error(task.progress.error || '任务执行失败');
    }

    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('任务超时');
}

// 使用示例
try {
  const taskId = await generatePhotograph({...});
  const result = await waitForTaskCompletion(taskId, 'user123');
  console.log('生成的图片URLs:', result.mediaUrls);
  console.log('生成的提示词:', result.metadata.prompt);
} catch (error) {
  console.error('生成失败:', error);
}
```

## 8. 注意事项

1. **异步任务**：所有接口都是异步的，会立即返回taskId，需要通过taskId查询任务状态
2. **质量选择**：
   - `quality: 'high'` 使用 nano-banana 模型（更高质量，可能更慢）
   - `quality: 'fast'` 使用 seedream-4 模型（更快，质量稍低）
3. **参考图**：
   - 支持base64编码或URL
   - 支持单张或多张参考图
   - nano-banana使用`image`（单张）或`image_urls`（多张）
   - seedream-4使用`image_input`数组
4. **知识库**：如果提供了knowledgeBase，系统会从知识库召回相关内容并用于生成提示词
5. **参数扩展性**：每个大类型的接口包含所有小类型可能需要的参数，根据`type`字段动态使用相关参数
