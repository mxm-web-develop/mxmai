# 知识库 API 完整接口文档

## 基础信息

- **Base URL**: `http://localhost:3000/api/v1/knowledge`
- **认证方式**: Bearer Token（JWT）
- **Content-Type**: `application/json`（除文件上传外）

## 通用 Headers

```http
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
x-user-id: <user-id>  # Gateway 会自动添加，但测试时可能需要手动设置
```

## 接口列表

### 1. 创建知识库

**接口**: `POST /api/v1/knowledge/bases`

**权限**:
- Admin：可以创建公开的知识库（`is_public=true`）
- 个人：只能创建私有知识库（`is_public=false`，强制）

**请求体**:
```json
{
  "name": "agent-image",
  "display_name": "图像生成知识库",
  "description": "图像生成相关的专业知识",
  "type": "hybrid",
  "embedding_model": "text-embedding-3-small",
  "agent_id": "image-generation-agent",
  "agent_name": "图像生成助手",
  "is_builtin": false,
  "is_public": false,
  "config": {}
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 知识库唯一标识 |
| display_name | string | ✅ | 显示名称 |
| description | string | ❌ | 描述 |
| type | string | ❌ | 知识库类型：`vector` \| `keyword` \| `hybrid`（默认 `hybrid`） |
| embedding_model | string | ❌ | Embedding 模型（默认 `text-embedding-3-small`） |
| agent_id | string | ❌ | 关联的 agent ID |
| agent_name | string | ❌ | agent 名称 |
| is_builtin | boolean | ❌ | 是否为内置知识库（默认 `false`，只有 admin 可设为 `true`） |
| is_public | boolean | ❌ | 是否公开（默认 `false`，只有 admin 可设为 `true`） |
| config | object | ❌ | 扩展配置 |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "kb-123",
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "description": "图像生成相关的专业知识",
    "type": "hybrid",
    "embedding_model": "text-embedding-3-small",
    "agent_id": "image-generation-agent",
    "agent_name": "图像生成助手",
    "is_builtin": false,
    "is_public": false,
    "owner_id": "user-123",
    "document_count": 0,
    "total_size_bytes": 0,
    "config": {},
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**cURL 示例**:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "type": "hybrid"
  }'
```

---

### 2. 列出知识库

**接口**: `GET /api/v1/knowledge/bases`

**权限**: 所有认证用户

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| agent_id | string | 按 agent_id 过滤 |
| is_public | boolean | 按是否公开过滤 |
| limit | number | 每页数量（默认不限制） |
| offset | number | 偏移量（默认 0） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "knowledge_bases": [
      {
        "id": "kb-123",
        "name": "agent-image",
        "display_name": "图像生成知识库",
        "document_count": 15,
        "is_public": true
      }
    ],
    "total": 1
  }
}
```

**cURL 示例**:
```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases?is_public=true&limit=10" \
  -H "Authorization: Bearer <your-token>"
```

---

### 3. 获取知识库信息

**接口**: `GET /api/v1/knowledge/bases/:name`

**权限**: 所有认证用户

**路径参数**:
- `name`: 知识库名称

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "kb-123",
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "document_count": 15,
    "total_size_bytes": 1024000
  }
}
```

**cURL 示例**:
```bash
curl -X GET http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <your-token>"
```

---

### 4. 更新知识库

**接口**: `PUT /api/v1/knowledge/bases/:name`

**权限**:
- Admin：可以更新任何知识库，包括设置为公开
- 个人：只能更新自己创建的知识库，且不能设置为公开

**路径参数**:
- `name`: 知识库名称

**请求体**:
```json
{
  "display_name": "新名称",
  "description": "新描述",
  "type": "hybrid",
  "is_public": false
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "kb-123",
    "name": "agent-image",
    "display_name": "新名称",
    "updated_at": "2024-01-01T01:00:00Z"
  }
}
```

**cURL 示例**:
```bash
curl -X PUT http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "新名称",
    "description": "新描述"
  }'
```

---

### 5. 删除知识库

**接口**: `DELETE /api/v1/knowledge/bases/:name`

**权限**:
- Admin：可以删除任何知识库
- 个人：只能删除自己创建的知识库

**路径参数**:
- `name`: 知识库名称

**响应示例**:
```json
{
  "success": true,
  "message": "Knowledge base \"agent-image\" deleted successfully"
}
```

**cURL 示例**:
```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <your-token>"
```

---

### 6. 上传文件到知识库

**接口**: `POST /api/v1/knowledge/bases/:name/upload`

**权限**:
- Admin：可以上传到任何知识库
- 个人：只能上传到自己创建的知识库

**路径参数**:
- `name`: 知识库名称

**Content-Type**: `multipart/form-data`

**表单字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ✅ | 要上传的文件（支持 TXT、MD、PDF 等） |
| tags | string | ❌ | 标签数组（JSON 字符串） |
| metadata | string | ❌ | 元数据（JSON 字符串） |
| is_public | boolean | ❌ | 是否公开（默认 false，只有 admin 可设为 true） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "knowledgeBase": {
      "id": "kb-123",
      "name": "agent-image",
      "document_count": 16
    },
    "documentsCount": 15,
    "totalChunks": 15,
    "documents": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧",
        "content": "...",
        "tags": ["摄影", "技巧"]
      }
    ]
  }
}
```

**cURL 示例**:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer <your-token>" \
  -F "file=@photography_guide.md" \
  -F "tags=[\"摄影\", \"技巧\"]" \
  -F "metadata={\"source\": \"专业教程\"}"
```

**使用 Postman**:
1. 选择 `POST` 方法
2. URL: `http://localhost:3000/api/v1/knowledge/bases/agent-image/upload`
3. Headers: `Authorization: Bearer <token>`
4. Body: 选择 `form-data`
5. 添加字段：
   - `file`: 类型选择 `File`，选择文件
   - `tags`: 类型选择 `Text`，值: `["摄影", "技巧"]`
   - `metadata`: 类型选择 `Text`，值: `{"source": "专业教程"}`

---

### 7. 列出知识库中的文档

**接口**: `GET /api/v1/knowledge/bases/:name/documents`

**权限**: 所有认证用户

**路径参数**:
- `name`: 知识库名称

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| limit | number | 每页数量（默认不限制） |
| offset | number | 偏移量（默认 0） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧",
        "content": "专业人像摄影，使用柔和的自然光...",
        "tags": ["摄影", "技巧"],
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 15
  }
}
```

**cURL 示例**:
```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases/agent-image/documents?limit=10&offset=0" \
  -H "Authorization: Bearer <your-token>"
```

---

### 8. 删除文档

**接口**: `DELETE /api/v1/knowledge/documents/:id`

**权限**:
- Admin：可以删除任何文档
- 个人：只能删除自己上传的文档

**路径参数**:
- `id`: 文档 ID

**响应示例**:
```json
{
  "success": true,
  "message": "Document \"doc-123\" deleted successfully"
}
```

**cURL 示例**:
```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/documents/doc-123 \
  -H "Authorization: Bearer <your-token>"
```

---

### 9. 搜索知识库

**接口**: `POST /api/v1/knowledge/bases/:name/search`

**权限**: 所有认证用户

**路径参数**:
- `name`: 知识库名称

**请求体**:
```json
{
  "query": "如何拍摄专业人像照片？",
  "search_type": "hybrid",
  "limit": 5,
  "threshold": 0.7,
  "vector_weight": 0.7,
  "keyword_weight": 0.3
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 搜索查询文本 |
| search_type | string | ❌ | 搜索类型：`vector` \| `keyword` \| `hybrid`（默认 `hybrid`） |
| limit | number | ❌ | 返回结果数量（默认 5） |
| threshold | number | ❌ | 相似度阈值（默认 0.7） |
| vector_weight | number | ❌ | 向量检索权重（默认 0.7，仅 hybrid 模式） |
| keyword_weight | number | ❌ | 关键词检索权重（默认 0.3，仅 hybrid 模式） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧",
        "content": "专业人像摄影，使用柔和的自然光，浅景深效果，85mm镜头，高质量，细节丰富",
        "similarity": 0.89,
        "metadata": {
          "source": "专业教程"
        },
        "tags": ["摄影", "技巧"]
      },
      {
        "id": "doc-2",
        "title": "光线控制",
        "content": "黄金时刻：日出后1小时和日落前1小时，光线柔和温暖",
        "similarity": 0.85,
        "tags": ["光线", "自然光"]
      }
    ],
    "count": 2
  }
}
```

**cURL 示例**:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄专业人像照片？",
    "search_type": "hybrid",
    "limit": 5
  }'
```

---

## 完整测试流程

### 步骤 1：创建知识库

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "description": "图像生成相关的专业知识",
    "type": "hybrid",
    "is_public": true
  }'
```

### 步骤 2：上传文件

创建测试文件 `test.md`:
```markdown
# 肖像摄影技巧

## 光线控制
- 使用柔和的自然光
- 黄金时刻：日出后1小时和日落前1小时
- 使用反光板补光

## 构图技巧
- 三分法构图
- 浅景深：使用大光圈（f/1.4 - f/2.8）
- 背景虚化
```

上传文件:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@test.md" \
  -F "tags=[\"摄影\", \"技巧\"]"
```

### 步骤 3：搜索知识库

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄人像照片？",
    "search_type": "hybrid",
    "limit": 5
  }'
```

### 步骤 4：查看知识库信息

```bash
curl -X GET http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <your-token>"
```

---

## 错误响应

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Missing x-user-id header"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Only admin users can create public knowledge bases"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Knowledge base \"xxx\" not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "错误详情"
}
```

---

## 测试 Checklist

- [ ] 创建知识库（Admin）
- [ ] 创建知识库（个人用户，验证不能创建公开的）
- [ ] 列出知识库
- [ ] 获取知识库信息
- [ ] 更新知识库（Admin）
- [ ] 更新知识库（个人用户，验证权限）
- [ ] 上传文件（TXT）
- [ ] 上传文件（MD）
- [ ] 上传文件（PDF，如果支持）
- [ ] 列出文档
- [ ] 搜索知识库（向量检索）
- [ ] 搜索知识库（关键词检索）
- [ ] 搜索知识库（混合检索）
- [ ] 删除文档
- [ ] 删除知识库

---

## 注意事项

1. **认证**：所有接口都需要 Bearer Token
2. **文件大小**：建议单个文件 < 10MB
3. **文件格式**：支持 TXT、MD、PDF（PDF 需要安装 pdf-parse）
4. **权限**：Admin 和普通用户的权限不同，注意测试
5. **Embedding 生成**：上传文件时会自动生成 embedding，可能需要一些时间

