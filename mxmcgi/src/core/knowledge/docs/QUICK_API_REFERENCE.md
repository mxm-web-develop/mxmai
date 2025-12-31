# 知识库 API 快速参考

## Base URL

```
http://localhost:3000/api/v1/knowledge
```

## 认证

所有接口都需要 Bearer Token：

```http
Authorization: Bearer <your-token>
```

---

## 1. 创建知识库

```bash
POST /api/v1/knowledge/bases
```

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "description": "图像生成相关的专业知识",
    "type": "hybrid",
    "is_public": true
  }'
```

---

## 2. 列出知识库

```bash
GET /api/v1/knowledge/bases
```

```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases?is_public=true&limit=10" \
  -H "Authorization: Bearer <token>"
```

---

## 3. 获取知识库信息

```bash
GET /api/v1/knowledge/bases/:name
```

```bash
curl -X GET http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <token>"
```

---

## 4. 更新知识库

```bash
PUT /api/v1/knowledge/bases/:name
```

```bash
curl -X PUT http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "新名称",
    "description": "新描述"
  }'
```

---

## 5. 删除知识库

```bash
DELETE /api/v1/knowledge/bases/:name
```

```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer <token>"
```

---

## 6. 上传文件

```bash
POST /api/v1/knowledge/bases/:name/upload
```

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@photography_guide.md" \
  -F "tags=[\"摄影\", \"技巧\"]" \
  -F "metadata={\"source\": \"专业教程\"}"
```

**Postman 设置**:
- Method: `POST`
- Body: `form-data`
- 字段:
  - `file`: Type=`File`, 选择文件
  - `tags`: Type=`Text`, Value=`["摄影", "技巧"]`
  - `metadata`: Type=`Text`, Value=`{"source": "专业教程"}`

---

## 7. 列出文档

```bash
GET /api/v1/knowledge/bases/:name/documents
```

```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases/agent-image/documents?limit=10&offset=0" \
  -H "Authorization: Bearer <token>"
```

---

## 8. 删除文档

```bash
DELETE /api/v1/knowledge/documents/:id
```

```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/documents/doc-123 \
  -H "Authorization: Bearer <token>"
```

---

## 9. 搜索知识库 ⭐

```bash
POST /api/v1/knowledge/bases/:name/search
```

### 向量检索

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄专业人像照片？",
    "search_type": "vector",
    "limit": 5,
    "threshold": 0.7
  }'
```

### 关键词检索

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "黄金时刻",
    "search_type": "keyword",
    "limit": 5
  }'
```

### 混合检索（推荐）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄人像照片？",
    "search_type": "hybrid",
    "limit": 5,
    "threshold": 0.7,
    "vector_weight": 0.7,
    "keyword_weight": 0.3
  }'
```

---

## 完整测试流程

### 步骤 1: 创建知识库

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "type": "hybrid",
    "is_public": true
  }'
```

### 步骤 2: 上传文件

创建 `test.md`:
```markdown
# 肖像摄影技巧

## 光线控制
- 使用柔和的自然光
- 黄金时刻：日出后1小时和日落前1小时

## 构图技巧
- 三分法构图
- 浅景深：使用大光圈（f/1.4 - f/2.8）
```

上传:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@test.md" \
  -F "tags=[\"摄影\", \"技巧\"]"
```

### 步骤 3: 搜索知识库

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄人像照片？",
    "search_type": "hybrid",
    "limit": 5
  }'
```

---

## 响应格式

### 成功响应

```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "错误信息"
}
```

---

## 权限说明

| 操作 | Admin | 个人用户 |
|------|-------|----------|
| 创建公开知识库 | ✅ | ❌ |
| 创建私有知识库 | ✅ | ✅ |
| 更新任何知识库 | ✅ | ❌（只能更新自己的） |
| 删除任何知识库 | ✅ | ❌（只能删除自己的） |
| 上传到任何知识库 | ✅ | ❌（只能上传到自己的） |
| 删除任何文档 | ✅ | ❌（只能删除自己的） |
| 搜索知识库 | ✅ | ✅ |

---

## 快速测试脚本

```bash
#!/bin/bash

TOKEN="your-token"
BASE="http://localhost:3000/api/v1/knowledge"

# 1. 创建知识库
echo "创建知识库..."
curl -X POST "${BASE}/bases" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-kb","display_name":"测试知识库","type":"hybrid"}' | jq .

# 2. 上传文件
echo "上传文件..."
curl -X POST "${BASE}/bases/test-kb/upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@test.md" | jq .

# 3. 搜索
echo "搜索知识库..."
curl -X POST "${BASE}/bases/test-kb/search" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"测试查询","search_type":"hybrid","limit":5}' | jq .
```

