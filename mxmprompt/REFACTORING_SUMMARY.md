# 代码重构总结

## 重构目标

根据架构要求，将所有数据访问统一通过 `mxmdata` 数据层，并移除核心代码对 `playground` 的依赖。

## 重构内容

### 1. 在 mxmdata 中创建向量数据库接口

**文件**: `mxmdata/src/interfaces/IPromptOptimizerRepository.ts`

- 定义了完整的向量数据库访问接口
- 包含主力模型、LoRA 模型、提示词模板、生成案例的 CRUD 操作
- 提供向量相似度搜索方法

### 2. 实现 Supabase 适配器

**文件**: `mxmdata/src/adapters/supabase/SupabasePromptOptimizerRepository.ts`

- 实现了 `IPromptOptimizerRepository` 接口
- 使用 Supabase 客户端访问数据库
- 支持 pgvector 向量搜索（通过 RPC 函数）

### 3. 更新 RepositoryFactory

**文件**: `mxmdata/src/factories/RepositoryFactory.ts`

- 添加了 `createPromptOptimizerRepository()` 方法
- 导出 `IPromptOptimizerRepository` 接口

### 4. 创建独立的服务（不依赖 playground）

#### Embeddings 服务
**文件**: `mxmprompt/src/services/embeddings.ts`

- 创建了 `DeerAPIEmbeddingsService` 类
- 实现了 `IEmbeddingsService` 接口
- 支持单个和批量文本向量化

#### LLM 服务
**文件**: `mxmprompt/src/services/llm.ts`

- 创建了 `DeerAPILLMService` 类
- 实现了 `ILLMService` 接口
- 支持 LangChain 集成

### 5. 重构 prompt-optimizer.ts

**文件**: `mxmprompt/src/services/prompt-optimizer.ts`

**主要变更**:
- ✅ 移除了对 `playground/utils/deerapi-embeddings` 的依赖
- ✅ 移除了对 `playground/utils/deerapi-llm` 的依赖
- ✅ 使用新的 `DeerAPIEmbeddingsService` 和 `DeerAPILLMService`
- ✅ `VectorDatabaseService` 现在通过 `RepositoryFactory` 访问数据
- ✅ 所有数据操作都通过 `IPromptOptimizerRepository` 接口
- ✅ `taskType` 现在是必需字段（不再是可选）

### 6. 更新数据收集服务

**文件**: `mxmprompt/src/services/data-collection.ts`

**主要变更**:
- ✅ 移除了对 `playground/utils/deerapi-embeddings` 的依赖
- ✅ 使用新的 `DeerAPIEmbeddingsService`
- ✅ 所有数据库操作都通过 `IPromptOptimizerRepository` 接口
- ✅ 从真实数据库查询高质量案例（不再使用模拟数据）

### 7. 更新 API 路由

**文件**: `mxmprompt/src/routes/prompt-optimizer.ts`

- ✅ 添加了 `taskType` 的验证（现在是必需字段）

## 架构变化

### 重构前

```
mxmprompt/src/services/prompt-optimizer.ts
  └─> playground/utils/deerapi-embeddings.ts  ❌
  └─> playground/utils/deerapi-llm.ts         ❌
  └─> 直接访问数据库（模拟）                   ❌
```

### 重构后

```
mxmprompt/src/services/prompt-optimizer.ts
  └─> services/embeddings.ts                  ✅
  └─> services/llm.ts                         ✅
  └─> @mxmai/mxmdata                          ✅
      └─> IPromptOptimizerRepository          ✅
      └─> SupabasePromptOptimizerRepository  ✅
          └─> Supabase (PostgreSQL + pgvector) ✅
```

## 数据流

### 提示词优化流程

1. **用户请求** → `POST /api/prompt-optimizer/optimize`
2. **API 路由** → 验证输入，调用工作流
3. **工作流节点**:
   - 节点1: 生成查询向量（使用 `DeerAPIEmbeddingsService`）
   - 节点2-5: 并行检索（通过 `IPromptOptimizerRepository`）
   - 节点6: 优化提示词（使用 `DeerAPILLMService`）
4. **数据访问**: 所有数据库操作通过 `mxmdata` 层

### 数据收集流程

1. **初始化数据**: `DataCollectionService.initializeDataForTaskType()`
2. **生成向量**: 使用 `DeerAPIEmbeddingsService`
3. **保存数据**: 通过 `IPromptOptimizerRepository` 保存到数据库
4. **记录案例**: 生成任务完成后，通过 `IPromptOptimizerRepository` 记录

## 数据库要求

### 必需的表结构

参考 `mxmprompt/src/database/schemas/vector-database.sql`:

- `base_models`: 主力模型表
- `lora_models`: LoRA 模型表
- `prompt_templates`: 提示词模板表
- `generation_cases`: 生成案例表

### 必需的 RPC 函数

Supabase 需要创建以下 RPC 函数用于向量搜索：

1. `search_base_models(query_embedding, task_type, match_limit, match_threshold)`
2. `search_lora_models(query_embedding, task_type, user_id, match_limit, match_threshold)`
3. `search_prompt_templates(query_embedding, task_type, match_limit, match_threshold)`
4. `search_similar_cases(query_embedding, task_type, match_limit, match_threshold)`

这些函数需要使用 pgvector 的 `embedding <-> query_embedding` 进行余弦相似度搜索。

## 环境变量

确保设置了以下环境变量：

```bash
# DeerAPI 配置（用于 Embeddings 和 LLM）
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=your_api_key

# Supabase 配置（用于数据访问）
SUPABASE_URL=http://localhost:8000  # 或部署后的网关域名
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

## 下一步

1. **创建数据库表**: 执行 `vector-database.sql` 脚本
2. **创建 RPC 函数**: 在 Supabase 中创建向量搜索函数
3. **初始化数据**: 运行 `DataCollectionService.initializeDataForTaskType()`
4. **测试**: 测试提示词优化 API

## 注意事项

1. ✅ 所有核心代码不再依赖 `playground`
2. ✅ 所有数据访问都通过 `mxmdata` 层
3. ✅ `playground` 仅用于验证想法和演示
4. ⚠️ 需要确保 Supabase 已启用 pgvector 扩展
5. ⚠️ 需要创建 RPC 函数用于向量搜索
