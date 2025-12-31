# Runway 图片转视频 API 请求示例

## 1. 通过 Gateway API 调用（推荐）

### 请求示例

**Endpoint:**
```
POST http://localhost:3000/api/v1/cgi/video/runway
```

**Headers:**
```
Content-Type: application/json
x-user-id: <your-user-id>
Authorization: Bearer <your-token>  # 如果需要认证
```

**请求体（使用图片 URL）:**
```json
{
  "promptImage": "https://cdn.britannica.com/70/234870-050-D4D024BB/Orange-colored-cat-yawns-displaying-teeth.jpg",
  "promptText": "A cute orange cat yawning, showing its teeth, with a playful expression",
  "imageToVideoModel": "gen3a_turbo",
  "ratio": "1280:720",
  "duration": 5,
  "watermark": false,
  "seed": 4294967295,
  "storeToMinio": true
}
```

**请求体（使用 base64 图片）:**
```json
{
  "promptImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "promptText": "A cute baby sea otter floating peacefully in clear water",
  "imageToVideoModel": "gen3a_turbo",
  "ratio": "1280:720",
  "duration": 6,
  "watermark": false,
  "storeToMinio": true
}
```

**响应示例:**
```json
{
  "success": true,
  "model": "runway",
  "data": {
    "taskId": "5649f96008227211773f8",
    "status": "pending",
    "createdAt": "2025-12-25T11:02:10.695Z"
  }
}
```

### 查询任务状态

**Endpoint:**
```
GET http://localhost:3000/api/v1/cgi-tasks/{taskId}?type=video
```

**Headers:**
```
x-user-id: <your-user-id>
Authorization: Bearer <your-token>
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "id": "5649f96008227211773f8",
    "type": "video",
    "status": "completed",
    "progress": {
      "status": "completed",
      "progress": 100,
      "startedAt": "2025-12-25T11:02:10.695Z",
      "completedAt": "2025-12-25T11:05:28.039Z"
    },
    "result": {
      "mediaUrls": [
        "https://dnznrvs05pmza.cloudfront.net/0a30751e-43ca-4842-bb17-8c01b0e91bbc.mp4?_jwt=..."
      ],
      "storageInfo": {
        "keys": ["user-media/14da3555-7981-4df4-ac8a-4f6d39513022/video/1766024308185-84hu7zz.mp4"],
        "bucket": "user-media",
        "urls": ["http://localhost:9000/user-media/..."]
      },
      "metadata": {
        "model": "runway",
        "provider": "deer",
        "taskId": "f6ed62ce-50fe-49bc-93d4-ca19e2d8956d",
        "videoUrl": "https://dnznrvs05pmza.cloudfront.net/...",
        "createdAt": "2025-12-25T11:02:10.695Z"
      }
    },
    "metadata": {
      "model": "runway",
      "provider": "deer",
      "userId": "14da3555-7981-4df4-ac8a-4f6d39513022"
    },
    "createdAt": "2025-12-25T11:02:10.695Z",
    "updatedAt": "2025-12-25T11:05:28.039Z"
  }
}
```

---

## 2. 使用 cURL 命令

### 创建图片转视频任务

```bash
curl -X POST http://localhost:3000/api/v1/cgi/video/runway \
  -H "Content-Type: application/json" \
  -H "x-user-id: 14da3555-7981-4df4-ac8a-4f6d39513022" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "promptImage": "https://cdn.britannica.com/70/234870-050-D4D024BB/Orange-colored-cat-yawns-displaying-teeth.jpg",
    "promptText": "A cute orange cat yawning",
    "imageToVideoModel": "gen3a_turbo",
    "ratio": "1280:720",
    "duration": 5,
    "watermark": false,
    "storeToMinio": true
  }'
```

### 查询任务状态

```bash
curl -X GET "http://localhost:3000/api/v1/cgi-tasks/5649f96008227211773f8?type=video" \
  -H "x-user-id: 14da3555-7981-4df4-ac8a-4f6d39513022" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 3. 使用 Postman

### 创建任务

1. **Method:** `POST`
2. **URL:** `http://localhost:3000/api/v1/cgi/video/runway`
3. **Headers:**
   - `Content-Type: application/json`
   - `x-user-id: <your-user-id>`
   - `Authorization: Bearer <your-token>`
4. **Body (raw JSON):**
```json
{
  "promptImage": "https://cdn.britannica.com/70/234870-050-D4D024BB/Orange-colored-cat-yawns-displaying-teeth.jpg",
  "promptText": "A cute orange cat yawning, showing its teeth",
  "imageToVideoModel": "gen3a_turbo",
  "ratio": "1280:720",
  "duration": 5,
  "watermark": false,
  "storeToMinio": true
}
```

### 查询任务状态

1. **Method:** `GET`
2. **URL:** `http://localhost:3000/api/v1/cgi-tasks/{taskId}?type=video`
3. **Headers:**
   - `x-user-id: <your-user-id>`
   - `Authorization: Bearer <your-token>`

---

## 4. 参数说明

### 必需参数

- `promptImage` (string): 图片输入，可以是：
  - 图片 URL（如 `https://example.com/image.jpg`）
  - Base64 编码的图片（如 `data:image/png;base64,iVBORw0KGgo...`）

### 可选参数

- `promptText` (string): 文本提示词，描述视频内容（最多 512 字符）
- `imageToVideoModel` (string): 模型选择，可选值：
  - `gen3a_turbo` (默认，推荐)
  - `gen4_turbo`
  - `veo3.1`
  - `veo3.1_fast`
  - `veo3`
- `ratio` (string): 视频比例，可选值：
  - `1280:720` (默认，16:9 横屏)
  - `720:1280` (9:16 竖屏)
  - `1280:768` (5:3)
  - `768:1280` (3:5)
  - `1104:832` (4:3)
  - `832:1104` (3:4)
  - `960:960` (1:1 正方形)
  - `1584:672` (21:9 超宽屏)
- `duration` (number): 视频时长，范围 5-10 秒，默认 5
- `watermark` (boolean): 是否添加水印，默认 `false`
- `seed` (number): 随机种子，范围 0-999999999
- `storeToMinio` (boolean): 是否存储到 MinIO，默认 `false`（返回 base64）

---

## 5. 视频转视频示例

### 请求体

```json
{
  "videoUri": "https://filesystem.site/cdn/20250818/c4gCDVPhiBc6TomRTJ7zNg0KwO1PSJ.mp4",
  "promptText": "Transform this video with a sci-fi background",
  "ratio": "1280:720",
  "seed": 4294967295,
  "duration": 8,
  "references": [
    {
      "type": "image",
      "uri": "https://cdn.britannica.com/70/234870-050-D4D024BB/Orange-colored-cat-yawns-displaying-teeth.jpg"
    }
  ],
  "contentModeration": {
    "publicFigureThreshold": "auto"
  },
  "storeToMinio": true
}
```

---

## 6. 错误处理

### 错误响应示例

**缺少必需参数:**
```json
{
  "success": false,
  "error": "Missing required parameter",
  "message": "必须提供以下参数之一：promptImage（图片转视频）或 videoUri（视频转视频）"
}
```

**任务生成失败:**
```json
{
  "success": true,
  "data": {
    "id": "5649f96008227211773f8",
    "type": "video",
    "status": "failed",
    "progress": {
      "status": "failed",
      "progress": 10,
      "error": "DeerAPI Runway 图片转视频失败: 503 Service Unavailable - {...}",
      "startedAt": "2025-12-25T11:02:10.695Z",
      "completedAt": "2025-12-25T11:05:28.039Z"
    }
  }
}
```

---

## 7. 完整工作流程示例

### 步骤 1: 创建任务

```bash
# 创建图片转视频任务
curl -X POST http://localhost:3000/api/v1/cgi/video/runway \
  -H "Content-Type: application/json" \
  -H "x-user-id: 14da3555-7981-4df4-ac8a-4f6d39513022" \
  -d '{
    "promptImage": "https://example.com/image.jpg",
    "promptText": "A beautiful sunset over the ocean",
    "imageToVideoModel": "gen3a_turbo",
    "ratio": "1280:720",
    "duration": 5,
    "storeToMinio": true
  }'

# 响应
{
  "success": true,
  "data": {
    "taskId": "abc123def456"
  }
}
```

### 步骤 2: 轮询任务状态

```bash
# 查询任务状态（每 5 秒查询一次，直到完成）
while true; do
  curl -X GET "http://localhost:3000/api/v1/cgi-tasks/abc123def456?type=video" \
    -H "x-user-id: 14da3555-7981-4df4-ac8a-4f6d39513022"
  sleep 5
done
```

### 步骤 3: 获取结果

任务完成后，响应中的 `result.mediaUrls` 包含生成的视频 URL：

```json
{
  "result": {
    "mediaUrls": [
      "https://dnznrvs05pmza.cloudfront.net/0a30751e-43ca-4842-bb17-8c01b0e91bbc.mp4?_jwt=..."
    ]
  }
}
```

---

## 8. 注意事项

1. **图片格式**: 支持 JPEG、PNG、WebP 格式
2. **图片大小**: 建议图片尺寸与视频比例匹配（如 1280x720）
3. **Base64 限制**: 如果使用 base64，确保图片大小合理（建议 < 10MB）
4. **任务状态**: 任务状态包括 `pending` → `processing` → `completed` 或 `failed`
5. **轮询频率**: 建议每 5 秒查询一次任务状态，避免过于频繁
6. **存储选项**: 
   - `storeToMinio: false` - 返回 base64 编码的视频（响应较大）
   - `storeToMinio: true` - 存储到 MinIO，返回 URL（推荐）
