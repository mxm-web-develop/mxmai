# 知识库 API 完整测试指南

## 前置准备

### 1. 环境变量配置

确保以下环境变量已配置：

```bash
# DeerAPI 配置（用于生成 embedding）
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx
DEERAPI_GROUP=default  # 可选

# 默认 embedding 模型
EMBEDDING_MODEL=text-embedding-3-small
```

### 2. 数据库初始化

执行数据库 SQL 创建表结构：

```bash
# 在 Supabase Studio 中执行
# 或使用 psql
psql -h localhost -p 5432 -U postgres -d postgres -f mxmdata/src/database/schemas/knowledge_base.sql
```

### 3. 获取认证 Token

```bash
# 方式1: 使用 Admin Token（测试用）
export ADMIN_TOKEN=your-admin-token

# 方式2: 使用 JWT Token（正常用户）
# 通过登录接口获取
```

---

## 完整测试流程

### 测试 1：创建知识库（Admin）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "description": "图像生成相关的专业知识，包括摄影技巧、构图方法等",
    "type": "hybrid",
    "embedding_model": "text-embedding-3-small",
    "agent_id": "image-generation-agent",
    "agent_name": "图像生成助手",
    "is_builtin": true,
    "is_public": true,
    "config": {}
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "id": "kb-xxx",
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "document_count": 0,
    "is_public": true
  }
}
```

---

### 测试 2：创建知识库（个人用户，验证权限）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-private-kb",
    "display_name": "我的私有知识库",
    "is_public": false
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "name": "my-private-kb",
    "is_public": false  // 强制为 false
  }
}
```

**测试权限限制**（应该返回 403）:
```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-public",
    "display_name": "测试公开知识库",
    "is_public": true
  }'
```

**预期响应**:
```json
{
  "success": false,
  "error": "Only admin users can create public knowledge bases"
}
```

---

### 测试 3：列出知识库

```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases?is_public=true&limit=10" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "knowledge_bases": [
      {
        "id": "kb-xxx",
        "name": "agent-image",
        "display_name": "图像生成知识库",
        "document_count": 0,
        "is_public": true
      }
    ],
    "total": 1
  }
}
```

---

### 测试 4：获取知识库信息

```bash
curl -X GET http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

---

### 测试 5：上传文件到知识库

**步骤 1：创建测试文件**

创建 `test_photography.md`:

```markdown
# 肖像摄影技巧指南

## 光线控制

### 自然光
- **黄金时刻**：日出后1小时和日落前1小时，光线柔和温暖
- **柔光**：使用柔光板或云层遮挡，避免强烈直射光
- **反光板**：使用银色或白色反光板补光，减少阴影

### 人工光
- **三点布光**：主光、补光、轮廓光
- **软光箱**：产生柔和、均匀的光线
- **色温控制**：使用 5500K 左右的色温，接近自然光

## 构图技巧

### 三分法
- 将画面分为九宫格，主体放在交叉点上
- 眼睛位置通常在画面三分之一处

### 背景处理
- **浅景深**：使用大光圈（f/1.4 - f/2.8），虚化背景
- **背景选择**：简洁、不干扰主体的背景
- **色彩搭配**：背景色与主体形成对比或和谐

## 镜头选择

### 85mm 镜头
- 最佳人像焦距
- 自然透视，不会变形
- 浅景深效果好

### 50mm 镜头
- 标准焦距，接近人眼视角
- 适合环境人像

## 提示词模板

### 专业人像摄影
professional portrait photography, soft natural lighting, shallow depth of field, 85mm lens, high quality, detailed, cinematic lighting

### 时尚人像
fashion portrait, studio lighting, clean background, professional model, high fashion, editorial style
```

**步骤 2：上传文件**

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/upload \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -F "file=@test_photography.md" \
  -F "tags=[\"摄影\", \"技巧\", \"人像\"]" \
  -F "metadata={\"source\": \"专业摄影教程\", \"category\": \"教程\"}"
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "knowledgeBase": {
      "id": "kb-xxx",
      "name": "agent-image",
      "document_count": 15
    },
    "documentsCount": 15,
    "totalChunks": 15,
    "documents": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧指南",
        "content": "# 肖像摄影技巧指南\n\n## 光线控制...",
        "tags": ["摄影", "技巧", "人像"]
      }
    ]
  }
}
```

**注意**：文件会被自动分割成多个 chunks，每个 chunk 会生成独立的文档和 embedding。

---

### 测试 6：列出知识库中的文档

```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/bases/agent-image/documents?limit=10&offset=0" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧指南",
        "content": "...",
        "tags": ["摄影", "技巧"],
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 15
  }
}
```

---

### 测试 7：搜索知识库（向量检索）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄专业人像照片？",
    "search_type": "vector",
    "limit": 5,
    "threshold": 0.7
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧指南",
        "content": "专业人像摄影，使用柔和的自然光，浅景深效果，85mm镜头...",
        "similarity": 0.89,
        "tags": ["摄影", "技巧"]
      }
    ],
    "count": 1
  }
}
```

---

### 测试 8：搜索知识库（关键词检索）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "黄金时刻",
    "search_type": "keyword",
    "limit": 5
  }'
```

---

### 测试 9：搜索知识库（混合检索）

```bash
curl -X POST http://localhost:3000/api/v1/knowledge/bases/agent-image/search \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
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

**预期响应**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc-1",
        "title": "肖像摄影技巧指南",
        "content": "...",
        "similarity": 0.89,
        "keyword_score": 0.85,
        "combined_score": 0.88,
        "tags": ["摄影", "技巧"]
      }
    ],
    "count": 1
  }
}
```

---

### 测试 10：更新知识库

```bash
curl -X PUT http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "图像生成知识库（已更新）",
    "description": "更新后的描述"
  }'
```

---

### 测试 11：删除文档

```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/documents/doc-1 \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**预期响应**:
```json
{
  "success": true,
  "message": "Document \"doc-1\" deleted successfully"
}
```

---

### 测试 12：删除知识库

```bash
curl -X DELETE http://localhost:3000/api/v1/knowledge/bases/agent-image \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**预期响应**:
```json
{
  "success": true,
  "message": "Knowledge base \"agent-image\" deleted successfully"
}
```

---

## Postman 测试集合

### 导入 Postman Collection

创建 `knowledge_base.postman_collection.json`:

```json
{
  "info": {
    "name": "知识库 API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000/api/v1/knowledge",
      "type": "string"
    },
    {
      "key": "token",
      "value": "your-token-here",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "创建知识库",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"name\": \"agent-image\",\n  \"display_name\": \"图像生成知识库\",\n  \"type\": \"hybrid\"\n}"
        },
        "url": {
          "raw": "{{base_url}}/bases",
          "host": ["{{base_url}}"],
          "path": ["bases"]
        }
      }
    },
    {
      "name": "上传文件",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": []
            },
            {
              "key": "tags",
              "value": "[\"摄影\", \"技巧\"]",
              "type": "text"
            }
          ]
        },
        "url": {
          "raw": "{{base_url}}/bases/agent-image/upload",
          "host": ["{{base_url}}"],
          "path": ["bases", "agent-image", "upload"]
        }
      }
    },
    {
      "name": "搜索知识库",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"query\": \"如何拍摄人像照片？\",\n  \"search_type\": \"hybrid\",\n  \"limit\": 5\n}"
        },
        "url": {
          "raw": "{{base_url}}/bases/agent-image/search",
          "host": ["{{base_url}}"],
          "path": ["bases", "agent-image", "search"]
        }
      }
    }
  ]
}
```

---

## 测试脚本

### 完整测试脚本（bash）

```bash
#!/bin/bash

# 配置
BASE_URL="http://localhost:3000/api/v1/knowledge"
TOKEN="your-token-here"

echo "=== 测试 1: 创建知识库 ==="
curl -X POST "${BASE_URL}/bases" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "agent-image",
    "display_name": "图像生成知识库",
    "type": "hybrid",
    "is_public": true
  }' | jq .

echo -e "\n=== 测试 2: 上传文件 ==="
curl -X POST "${BASE_URL}/bases/agent-image/upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@test_photography.md" \
  -F "tags=[\"摄影\", \"技巧\"]" | jq .

echo -e "\n=== 测试 3: 搜索知识库 ==="
curl -X POST "${BASE_URL}/bases/agent-image/search" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何拍摄人像照片？",
    "search_type": "hybrid",
    "limit": 5
  }' | jq .

echo -e "\n=== 测试完成 ==="
```

---

## 常见问题

### Q1: 上传文件后没有生成 embedding？

**A**: 检查：
1. `DEERAPI_BASE_URL` 和 `DEERAPI_API_KEY` 是否配置
2. DeerAPI 服务是否正常
3. 查看服务日志是否有错误

### Q2: 搜索返回空结果？

**A**: 可能原因：
1. 知识库中没有文档
2. 相似度阈值设置过高（尝试降低 `threshold`）
3. 查询文本与文档内容差异太大

### Q3: 权限错误 403？

**A**: 检查：
1. 是否为 admin 用户（创建公开知识库需要 admin）
2. 是否尝试操作其他用户的知识库
3. 查看错误信息中的具体原因

### Q4: 文件上传失败？

**A**: 检查：
1. 文件大小是否超过限制（默认 20MB）
2. 文件格式是否支持（TXT、MD、PDF）
3. 知识库是否存在

---

## 性能测试

### 批量上传测试

```bash
# 上传多个文件
for file in *.md; do
  curl -X POST "${BASE_URL}/bases/agent-image/upload" \
    -H "Authorization: Bearer ${TOKEN}" \
    -F "file=@${file}"
done
```

### 并发搜索测试

```bash
# 并发搜索
for i in {1..10}; do
  curl -X POST "${BASE_URL}/bases/agent-image/search" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"测试查询 ${i}\", \"limit\": 5}" &
done
wait
```

---

## 验证 Checklist

- [ ] ✅ 创建知识库成功
- [ ] ✅ 权限控制正确（个人用户不能创建公开知识库）
- [ ] ✅ 上传文件成功
- [ ] ✅ 文件自动解析和分块
- [ ] ✅ Embedding 自动生成
- [ ] ✅ 向量检索返回结果
- [ ] ✅ 关键词检索返回结果
- [ ] ✅ 混合检索返回结果
- [ ] ✅ 相似度分数正确
- [ ] ✅ 更新知识库成功
- [ ] ✅ 删除文档成功
- [ ] ✅ 删除知识库成功

---

## 下一步

测试完成后，可以：
1. 在 Agent 中集成知识库检索
2. 上传更多专业知识文档
3. 优化检索参数（threshold、权重等）
4. 监控检索效果和性能

