# 提示词优化系统

基于 LangChain 和 LangGraph 实现的提示词优化系统，可以从向量数据库中检索适配的主力模型、LoRA 模型和精准提示词。

## 功能特性

1. **向量检索**：使用向量数据库检索相似的内容
2. **主力模型推荐**：根据任务描述推荐最适合的基础模型（如 Flux、Stable Diffusion）
3. **LoRA 模型推荐**：推荐适合任务的 LoRA 模型
4. **提示词优化**：基于检索结果和 LLM 生成优化的提示词
5. **并行处理**：使用 LangGraph 实现高效的并行检索

## 系统架构

### 工作流结构

```
开始
  ↓
[节点1: 生成查询向量]
  ↓
  ├─→ [节点2: 分析任务特征]
  ├─→ [节点3: 检索主力模型]
  ├─→ [节点4: 检索 LoRA 模型]
  └─→ [节点5: 检索提示词]
       ↓
  [节点6: 选择最佳推荐]
       ↓
      结束
```

### 核心组件

1. **VectorDatabaseService**：向量数据库服务
   - 生成文本向量
   - 检索主力模型
   - 检索 LoRA 模型
   - 检索提示词模板

2. **PromptOptimizerWorkflow**：LangGraph 工作流
   - 节点1：生成查询向量
   - 节点2：分析任务特征（并行）
   - 节点3：检索主力模型（并行）
   - 节点4：检索 LoRA 模型（并行）
   - 节点5：检索提示词（并行）
   - 节点6：选择最佳推荐并优化提示词

## 使用方法

### 1. 环境配置

确保设置了以下环境变量：

```bash
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=your_api_key
```

### 2. 运行演示

```bash
# 运行提示词优化演示
pnpm playground:optimizer

# 或运行所有演示
pnpm playground:all
```

### 3. API 调用

启动服务：

```bash
pnpm dev
```

调用 API：

```bash
curl -X POST http://localhost:4003/api/prompt-optimizer/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "userDescription": "我想要生成一张专业的人像摄影照片，近景，工作室灯光，高质量",
    "userId": "user-123",
    "taskType": "portrait"
  }'
```

### 4. API 响应示例

```json
{
  "success": true,
  "data": {
    "selectedBaseModel": {
      "id": "flux-1.1-pro",
      "name": "Flux 1.1 Pro",
      "modelId": "flux-1.1-pro",
      "description": "高质量图像生成模型，适合专业摄影、人像、风景等场景"
    },
    "selectedLoRAModel": {
      "id": "portrait-lora-001",
      "name": "Portrait Professional LoRA",
      "taskType": "portrait",
      "storageType": "replicate",
      "modelUrl": "replicate/user/portrait-lora:latest",
      "triggerWords": ["portrait", "professional", "studio"],
      "strength": 0.8
    },
    "optimizedPrompt": "portrait photography, person, close-up, studio lighting, professional, high quality, detailed, 8k, professional photography, studio setup, soft lighting, sharp focus",
    "recommendations": {
      "baseModels": [...],
      "loraModels": [...],
      "prompts": [...]
    },
    "analyzedFeatures": {
      "subject": "person",
      "scene": "portrait",
      "style": "professional",
      "technicalParams": "close-up, studio lighting"
    }
  }
}
```

## 数据结构

### PromptOptimizerState

工作流状态接口，包含：

- **输入字段**：
  - `userDescription`: 用户输入的文字描述
  - `userId`: 用户ID（可选）
  - `taskType`: 任务类型（可选）

- **中间状态**：
  - `queryEmbedding`: 查询向量
  - `baseModelRecommendations`: 主力模型推荐列表
  - `loraModelRecommendations`: LoRA 模型推荐列表
  - `promptRecommendations`: 提示词推荐列表
  - `analyzedFeatures`: 分析后的任务特征

- **输出字段**：
  - `selectedBaseModel`: 选中的主力模型
  - `selectedLoRAModel`: 选中的 LoRA 模型
  - `optimizedPrompt`: 优化后的提示词

## 实际部署注意事项

### 1. 向量数据库集成

当前实现使用模拟数据，实际部署时需要：

1. **使用 pgvector**（PostgreSQL 扩展）：
   ```sql
   CREATE TABLE base_models (
     id UUID PRIMARY KEY,
     name VARCHAR(100),
     model_id VARCHAR(200),
     description TEXT,
     embedding vector(1536)
   );
   
   CREATE INDEX ON base_models USING ivfflat (embedding vector_cosine_ops);
   ```

2. **查询示例**：
   ```sql
   SELECT *, embedding <-> $1 AS similarity
   FROM base_models
   ORDER BY embedding <-> $1
   LIMIT 5;
   ```

### 2. 数据库表设计

参考 `IMAGE_TO_IMAGE_PLAN.md` 中的数据库设计：

- `base_models`: 主力模型表
- `lora_models`: LoRA 模型表
- `prompt_templates`: 提示词模板表
- `generation_cases`: 生成案例表（用于 RAG）

### 3. 性能优化

1. **向量索引**：使用 HNSW 或 IVFFlat 索引加速检索
2. **缓存**：缓存常用查询的向量和结果
3. **批量处理**：批量生成 embedding 以提高效率
4. **并行检索**：利用 LangGraph 的并行执行能力

### 4. 错误处理

- 向量生成失败：返回默认值或错误信息
- 数据库查询失败：记录日志并返回空结果
- LLM 调用失败：重试机制或降级处理

## 扩展功能

### 1. 个性化推荐

- 基于用户历史记录推荐
- 学习用户偏好
- 支持用户自定义 LoRA

### 2. 多模态支持

- 支持图片输入作为参考
- 图片到向量的转换
- 图文混合检索

### 3. 实时学习

- 记录成功案例
- 自动更新向量数据库
- 持续优化推荐算法

## 相关文件

- `src/services/prompt-optimizer.ts`: 核心服务实现
- `src/routes/prompt-optimizer.ts`: API 路由
- `src/playground/04-prompt-optimizer.ts`: 演示代码
- `IMAGE_TO_IMAGE_PLAN.md`: 数据库设计文档
- `LORA_MODEL_GUIDE.md`: LoRA 模型管理指南

## 开发计划

- [ ] 集成真实的向量数据库（pgvector）
- [ ] 添加缓存机制
- [ ] 实现批量处理
- [ ] 添加监控和日志
- [ ] 性能优化和测试
- [ ] 支持更多模型类型
