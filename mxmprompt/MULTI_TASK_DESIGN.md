# 多任务类型提示词优化系统设计方案

## 一、系统概述

### 1.1 目标

设计一个支持多种任务类型的提示词优化系统，能够：
- 支持图像生成（Flux、Stable Diffusion）
- 支持音乐生成（Suno）
- 支持视频生成（未来扩展）
- 支持文本生成（未来扩展）
- 为每种任务类型推荐合适的模型、LoRA 和提示词

### 1.2 核心原则

1. **任务类型抽象**：统一的接口，支持任务特定实现
2. **数据隔离**：不同任务类型的数据独立存储和检索
3. **可扩展性**：易于添加新的任务类型
4. **性能优化**：高效的向量检索和推荐

---

## 二、任务类型定义

### 2.1 任务类型枚举

```typescript
enum TaskType {
  // 图像生成
  IMAGE_GENERATION = 'image_generation',
  IMAGE_PORTRAIT = 'image_portrait',
  IMAGE_FASHION = 'image_fashion',
  IMAGE_LANDSCAPE = 'image_landscape',
  
  // 音乐生成
  MUSIC_GENERATION = 'music_generation',
  MUSIC_VOCAL = 'music_vocal',
  MUSIC_INSTRUMENTAL = 'music_instrumental',
  MUSIC_BGM = 'music_bgm',
  
  // 视频生成（未来）
  VIDEO_GENERATION = 'video_generation',
  
  // 文本生成（未来）
  TEXT_GENERATION = 'text_generation',
}
```

### 2.2 任务类型配置

```typescript
interface TaskTypeConfig {
  taskType: string;
  name: string;
  description: string;
  // 支持的模型类型
  supportedModels: {
    baseModels: string[];      // 主力模型列表
    loraModels?: boolean;        // 是否支持 LoRA
    plugins?: string[];         // 支持的插件/扩展
  };
  // 任务特定参数
  taskSpecificParams?: Record<string, any>;
  // 提示词模板格式
  promptTemplateFormat: 'image' | 'music' | 'video' | 'text';
}
```

### 2.3 任务类型配置示例

```typescript
const TASK_TYPE_CONFIGS: Record<string, TaskTypeConfig> = {
  image_generation: {
    taskType: 'image_generation',
    name: '图像生成',
    description: '使用 AI 生成图像',
    supportedModels: {
      baseModels: ['flux-1.1-pro', 'stable-diffusion-xl', 'flux-dev'],
      loraModels: true,
      plugins: ['controlnet', 'ip-adapter']
    },
    promptTemplateFormat: 'image'
  },
  music_generation: {
    taskType: 'music_generation',
    name: '音乐生成',
    description: '使用 AI 生成音乐',
    supportedModels: {
      baseModels: ['suno-v3', 'suno-v3.5'],
      loraModels: false,
      plugins: []
    },
    promptTemplateFormat: 'music'
  }
};
```

---

## 三、向量数据库设计

### 3.1 数据库表结构

#### 3.1.1 主力模型表 (base_models)

```sql
CREATE TABLE base_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL UNIQUE,  -- 如: flux-1.1-pro, suno-v3
  description TEXT,
  
  -- 任务类型支持
  task_type VARCHAR(50) NOT NULL,          -- image_generation, music_generation
  supported_subtypes TEXT[],               -- ['portrait', 'fashion', 'landscape']
  
  -- 模型元数据
  provider VARCHAR(50),                    -- replicate, huggingface, suno, etc.
  model_url TEXT,
  api_endpoint TEXT,
  version VARCHAR(50),
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,    -- 用于生成 embedding
  use_cases TEXT[],                        -- 适用场景
  
  -- 向量
  embedding vector(1536),                  -- OpenAI text-embedding-3-small
  
  -- 统计信息
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  average_quality_rating DECIMAL(3, 2),
  
  -- 配置信息
  default_params JSONB,                    -- 默认参数配置
  metadata JSONB,                          -- 扩展元数据
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_base_models_task_type ON base_models(task_type);
CREATE INDEX idx_base_models_embedding ON base_models USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_base_models_model_id ON base_models(model_id);
```

#### 3.1.2 LoRA 模型表 (lora_models)

```sql
CREATE TABLE lora_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- 任务类型（仅图像生成支持 LoRA）
  task_type VARCHAR(50) NOT NULL DEFAULT 'image_generation',
  category VARCHAR(50),                    -- portrait, fashion, style, etc.
  
  -- 存储信息
  storage_type VARCHAR(20) NOT NULL,       -- replicate, huggingface, s3
  model_url TEXT,
  model_id VARCHAR(200),
  huggingface_path VARCHAR(200),
  s3_path TEXT,
  
  -- 模型配置
  base_model VARCHAR(100),                 -- 适配的基础模型
  trigger_words TEXT[],
  strength DECIMAL(3, 2) DEFAULT 0.8,
  recommended_strength DECIMAL(3, 2),
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,
  
  -- 向量
  embedding vector(1536),
  
  -- 权限
  is_public BOOLEAN DEFAULT true,
  owner_id UUID,
  is_system BOOLEAN DEFAULT false,
  
  -- 统计
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  
  -- 元数据
  tags TEXT[],
  example_outputs TEXT[],                  -- 示例输出 URL
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_lora_models_task_type ON lora_models(task_type);
CREATE INDEX idx_lora_models_category ON lora_models(category);
CREATE INDEX idx_lora_models_embedding ON lora_models USING ivfflat (embedding vector_cosine_ops);
```

#### 3.1.3 提示词模板表 (prompt_templates)

```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  template TEXT NOT NULL,                  -- 模板文本，支持变量 {{variable}}
  description TEXT,
  
  -- 任务类型
  task_type VARCHAR(50) NOT NULL,         -- image_generation, music_generation
  category VARCHAR(50),                    -- scene, lighting, style, genre, mood
  
  -- 模板变量
  variables JSONB,                         -- 变量定义和默认值
  -- 示例: {"subject": "person", "scene": "close-up", "lighting": "studio"}
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,
  
  -- 向量
  embedding vector(1536),
  
  -- 质量评估
  quality_score DECIMAL(5, 2) DEFAULT 0.00,
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  
  -- 元数据
  example_outputs TEXT[],                  -- 使用此模板的成功案例
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_prompt_templates_task_type ON prompt_templates(task_type);
CREATE INDEX idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX idx_prompt_templates_embedding ON prompt_templates USING ivfflat (embedding vector_cosine_ops);
```

#### 3.1.4 生成案例表 (generation_cases)

```sql
CREATE TABLE generation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 任务信息
  task_type VARCHAR(50) NOT NULL,
  task_id VARCHAR(100),                    -- 原始任务 ID
  
  -- 输入
  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT,
  user_description TEXT,                    -- 用户原始描述
  
  -- 使用的模型
  base_model_id UUID REFERENCES base_models(id),
  lora_model_id UUID REFERENCES lora_models(id),
  
  -- 任务参数
  task_params JSONB,                       -- 任务特定参数
  -- 图像: {scene, lens, lighting, style}
  -- 音乐: {genre, mood, tempo, duration}
  
  -- 结果
  output_url TEXT,                          -- 生成结果 URL
  quality_rating DECIMAL(3, 2),            -- 质量评分
  user_feedback JSONB,                      -- 用户反馈
  
  -- 向量（用于 RAG 召回）
  original_prompt_embedding vector(1536),
  optimized_prompt_embedding vector(1536),
  
  -- 元数据
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_generation_cases_task_type ON generation_cases(task_type);
CREATE INDEX idx_generation_cases_base_model ON generation_cases(base_model_id);
CREATE INDEX idx_generation_cases_original_embedding ON generation_cases USING ivfflat (original_prompt_embedding vector_cosine_ops);
CREATE INDEX idx_generation_cases_optimized_embedding ON generation_cases USING ivfflat (optimized_prompt_embedding vector_cosine_ops);
```

---

## 四、数据收集策略

### 4.1 数据来源

#### 4.1.1 图像生成数据

**主力模型数据**：
- Flux 系列：flux-1.1-pro, flux-dev, flux-schnell
- Stable Diffusion 系列：stable-diffusion-xl, stable-diffusion-3
- 数据字段：
  ```json
  {
    "name": "Flux 1.1 Pro",
    "model_id": "flux-1.1-pro",
    "task_type": "image_generation",
    "capability_description": "professional photography, high quality, detailed, photorealistic, portrait, landscape, studio lighting",
    "use_cases": ["portrait", "fashion", "landscape", "product"],
    "default_params": {
      "width": 1024,
      "height": 1024,
      "steps": 28,
      "guidance_scale": 3.5
    }
  }
  ```

**LoRA 模型数据**：
- 从 HuggingFace、Civitai 等平台收集
- 用户训练的私有 LoRA
- 数据字段：
  ```json
  {
    "name": "Portrait Professional LoRA",
    "task_type": "image_generation",
    "category": "portrait",
    "capability_description": "portrait photography, professional, studio lighting, close-up, high quality",
    "base_model": "flux-1.1-pro",
    "trigger_words": ["portrait", "professional", "studio"],
    "storage_type": "replicate",
    "model_url": "replicate/user/portrait-lora:latest"
  }
  ```

**提示词模板数据**：
- 从成功案例中提取
- 社区分享的高质量提示词
- 数据字段：
  ```json
  {
    "name": "Professional Portrait Template",
    "task_type": "image_generation",
    "category": "portrait",
    "template": "portrait photography, {subject}, {scene}, {lighting}, professional, high quality, detailed, 8k",
    "variables": {
      "subject": "person",
      "scene": "close-up",
      "lighting": "studio"
    },
    "capability_description": "portrait photography, professional, studio lighting, close-up"
  }
  ```

#### 4.1.2 音乐生成数据

**主力模型数据**：
- Suno 系列：suno-v3, suno-v3.5
- 数据字段：
  ```json
  {
    "name": "Suno v3.5",
    "model_id": "suno-v3.5",
    "task_type": "music_generation",
    "capability_description": "music generation, vocal, instrumental, various genres, high quality audio",
    "use_cases": ["vocal", "instrumental", "bgm", "soundtrack"],
    "default_params": {
      "duration": 120,
      "instrumental": false,
      "custom_mode": false
    }
  }
  ```

**提示词模板数据**：
- 音乐风格、情绪、节奏描述
- 数据字段：
  ```json
  {
    "name": "Pop Music Template",
    "task_type": "music_generation",
    "category": "genre",
    "template": "{genre} music, {mood}, {tempo}, {instrumentation}, {vocal_style}",
    "variables": {
      "genre": "pop",
      "mood": "upbeat",
      "tempo": "moderate",
      "instrumentation": "guitar, drums, bass",
      "vocal_style": "clear vocals"
    },
    "capability_description": "pop music, upbeat, moderate tempo, guitar drums bass, clear vocals"
  }
  ```

### 4.2 数据收集流程

#### 4.2.1 初始化数据收集

```typescript
// 数据收集服务
class DataCollectionService {
  /**
   * 收集主力模型数据
   */
  async collectBaseModels(taskType: string): Promise<void> {
    const config = TASK_TYPE_CONFIGS[taskType];
    if (!config) return;

    for (const modelId of config.supportedModels.baseModels) {
      // 1. 从模型提供商获取模型信息
      const modelInfo = await this.fetchModelInfo(modelId, taskType);
      
      // 2. 生成能力描述
      const capabilityDescription = this.generateCapabilityDescription(modelInfo);
      
      // 3. 生成 embedding
      const embedding = await this.generateEmbedding(capabilityDescription);
      
      // 4. 存储到数据库
      await this.saveBaseModel({
        ...modelInfo,
        task_type: taskType,
        capability_description: capabilityDescription,
        embedding
      });
    }
  }

  /**
   * 从成功案例中收集提示词模板
   */
  async collectPromptsFromCases(taskType: string): Promise<void> {
    // 1. 查询高质量的成功案例
    const cases = await db.query(`
      SELECT * FROM generation_cases
      WHERE task_type = $1
        AND quality_rating >= 0.8
        AND user_feedback->>'satisfaction' = 'high'
      ORDER BY quality_rating DESC
      LIMIT 100
    `, [taskType]);

    // 2. 提取提示词模式
    for (const case_ of cases) {
      const template = this.extractTemplate(case_.optimized_prompt);
      const embedding = await this.generateEmbedding(template.capability_description);
      
      // 3. 存储模板
      await this.savePromptTemplate({
        task_type: taskType,
        ...template,
        embedding
      });
    }
  }

  /**
   * 定期更新向量
   */
  async updateEmbeddings(): Promise<void> {
    // 定期重新生成 embedding，确保一致性
    const models = await db.query('SELECT * FROM base_models WHERE embedding IS NULL');
    for (const model of models) {
      const embedding = await this.generateEmbedding(model.capability_description);
      await db.update('base_models', model.id, { embedding });
    }
  }
}
```

#### 4.2.2 实时数据收集

```typescript
/**
 * 记录生成案例（在任务完成后）
 */
async function recordGenerationCase(params: {
  taskType: string;
  taskId: string;
  originalPrompt: string;
  optimizedPrompt: string;
  baseModelId: string;
  loraModelId?: string;
  taskParams: Record<string, any>;
  outputUrl: string;
  qualityRating?: number;
}) {
  // 1. 生成 embedding
  const originalEmbedding = await generateEmbedding(params.originalPrompt);
  const optimizedEmbedding = await generateEmbedding(params.optimizedPrompt);

  // 2. 存储案例
  await db.insert('generation_cases', {
    ...params,
    original_prompt_embedding: originalEmbedding,
    optimized_prompt_embedding: optimizedEmbedding
  });

  // 3. 如果质量高，考虑提取为模板
  if (params.qualityRating && params.qualityRating >= 0.8) {
    await extractAndSaveTemplate(params);
  }
}
```

---

## 五、检索和推荐方案

### 5.1 任务类型感知的检索

```typescript
class TaskAwareVectorService {
  /**
   * 检索主力模型（按任务类型）
   */
  async searchBaseModels(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<BaseModelRecommendation[]> {
    const results = await db.query(`
      SELECT 
        id, name, model_id, description, use_cases, default_params, metadata,
        1 - (embedding <-> $1::vector) AS similarity
      FROM base_models
      WHERE task_type = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <-> $1::vector
      LIMIT $3
    `, [queryEmbedding, taskType, limit]);

    return results.map(r => ({
      id: r.id,
      name: r.name,
      modelId: r.model_id,
      description: r.description,
      similarity: r.similarity,
      useCase: r.use_cases.join(', '),
      metadata: {
        ...r.default_params,
        ...r.metadata
      }
    }));
  }

  /**
   * 检索 LoRA 模型（仅图像生成）
   */
  async searchLoRAModels(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<LoRAModelRecommendation[]> {
    if (taskType !== 'image_generation') {
      return []; // 仅图像生成支持 LoRA
    }

    const results = await db.query(`
      SELECT 
        id, name, description, task_type, category,
        storage_type, model_url, trigger_words, recommended_strength,
        1 - (embedding <-> $1::vector) AS similarity
      FROM lora_models
      WHERE task_type = $2
        AND embedding IS NOT NULL
        AND (is_public = true OR owner_id = $3)
      ORDER BY embedding <-> $1::vector
      LIMIT $4
    `, [queryEmbedding, taskType, userId, limit]);

    return results.map(r => ({
      id: r.id,
      name: r.name,
      taskType: r.task_type,
      description: r.description,
      similarity: r.similarity,
      storageType: r.storage_type,
      modelUrl: r.model_url,
      triggerWords: r.trigger_words,
      recommendedStrength: r.recommended_strength
    }));
  }

  /**
   * 检索提示词模板（按任务类型）
   */
  async searchPrompts(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<PromptRecommendation[]> {
    const results = await db.query(`
      SELECT 
        id, name, template, category, variables, quality_score, metadata,
        1 - (embedding <-> $1::vector) AS similarity
      FROM prompt_templates
      WHERE task_type = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <-> $1::vector
      LIMIT $3
    `, [queryEmbedding, taskType, limit]);

    return results.map(r => ({
      id: r.id,
      template: r.template,
      category: r.category,
      similarity: r.similarity,
      variables: r.variables,
      qualityScore: r.quality_score,
      metadata: r.metadata
    }));
  }
}
```

### 5.2 任务特定的提示词优化

```typescript
/**
 * 任务特定的提示词优化器
 */
class TaskSpecificOptimizer {
  /**
   * 图像生成提示词优化
   */
  async optimizeImagePrompt(params: {
    userDescription: string;
    analyzedFeatures: TaskFeatures;
    promptTemplate: string;
    triggerWords?: string[];
  }): Promise<string> {
    const llm = DeerAPIChatModel.fromEnv('gpt-4o-mini');
    const template = PromptTemplate.fromTemplate(`
你是一个专业的 AI 图像生成提示词优化专家。

用户原始描述: {userDescription}
任务特征: {features}
推荐的提示词模板: {promptTemplate}
LoRA 触发词: {triggerWords}

请生成一个精准、详细的图像生成提示词。
要求：
1. 保持用户原始意图
2. 结合任务特征
3. 参考推荐的提示词模板
4. 如果提供了 LoRA 触发词，请适当融入
5. 使用专业摄影术语
6. 提示词长度控制在 100-200 字
7. 使用英文输出

优化后的提示词:
    `);

    const prompt = await template.format({
      userDescription: params.userDescription,
      features: JSON.stringify(params.analyzedFeatures),
      promptTemplate: params.promptTemplate,
      triggerWords: params.triggerWords?.join(', ') || '无'
    });

    const response = await llm.invoke(prompt);
    return response.content as string;
  }

  /**
   * 音乐生成提示词优化
   */
  async optimizeMusicPrompt(params: {
    userDescription: string;
    analyzedFeatures: TaskFeatures;
    promptTemplate: string;
  }): Promise<string> {
    const llm = DeerAPIChatModel.fromEnv('gpt-4o-mini');
    const template = PromptTemplate.fromTemplate(`
你是一个专业的 AI 音乐生成提示词优化专家。

用户原始描述: {userDescription}
任务特征: {features}
推荐的提示词模板: {promptTemplate}

请生成一个精准、详细的音乐生成提示词。
要求：
1. 保持用户原始意图
2. 明确指定音乐风格、情绪、节奏
3. 参考推荐的提示词模板
4. 使用专业音乐术语
5. 提示词长度控制在 50-150 字
6. 使用英文输出

优化后的提示词:
    `);

    const prompt = await template.format({
      userDescription: params.userDescription,
      features: JSON.stringify(params.analyzedFeatures),
      promptTemplate: params.promptTemplate
    });

    const response = await llm.invoke(prompt);
    return response.content as string;
  }
}
```

---

## 六、系统架构设计

### 6.1 类图

```
┌─────────────────────────────────────┐
│   PromptOptimizerService            │
│   - taskType: string                │
│   + optimize()                      │
└──────────────┬──────────────────────┘
               │
               ├──────────────────────────────┐
               │                              │
┌──────────────▼──────────────┐  ┌───────────▼──────────────┐
│  TaskAwareVectorService     │  │ TaskSpecificOptimizer    │
│  + searchBaseModels()       │  │ + optimizeImagePrompt()  │
│  + searchLoRAModels()        │  │ + optimizeMusicPrompt()  │
│  + searchPrompts()           │  │ + optimizeVideoPrompt()  │
└──────────────┬──────────────┘  └──────────────────────────┘
               │
               │
┌──────────────▼──────────────┐
│  VectorDatabaseService      │
│  + generateEmbedding()      │
│  + cosineSimilarity()        │
└──────────────────────────────┘
```

### 6.2 工作流更新

```typescript
interface PromptOptimizerState {
  // 输入
  userDescription: string;
  taskType: string;  // 新增：明确指定任务类型
  userId?: string;

  // 中间状态
  queryEmbedding?: number[];
  baseModelRecommendations?: BaseModelRecommendation[];
  loraModelRecommendations?: LoRAModelRecommendation[];
  promptRecommendations?: PromptRecommendation[];
  analyzedFeatures?: TaskFeatures;

  // 输出
  selectedBaseModel?: BaseModelInfo;
  selectedLoRAModel?: LoRAModelInfo;
  optimizedPrompt?: string;
  error?: string;
}

// 节点更新：根据任务类型选择不同的优化器
async function selectBestRecommendations(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  const optimizer = new TaskSpecificOptimizer();
  
  // 根据任务类型选择优化方法
  let optimizedPrompt: string;
  if (state.taskType === 'image_generation') {
    optimizedPrompt = await optimizer.optimizeImagePrompt({
      userDescription: state.userDescription,
      analyzedFeatures: state.analyzedFeatures!,
      promptTemplate: state.promptRecommendations?.[0]?.template || '',
      triggerWords: state.selectedLoRAModel?.triggerWords
    });
  } else if (state.taskType === 'music_generation') {
    optimizedPrompt = await optimizer.optimizeMusicPrompt({
      userDescription: state.userDescription,
      analyzedFeatures: state.analyzedFeatures!,
      promptTemplate: state.promptRecommendations?.[0]?.template || ''
    });
  } else {
    // 默认处理
    optimizedPrompt = state.userDescription;
  }

  return {
    selectedBaseModel: state.baseModelRecommendations?.[0],
    selectedLoRAModel: state.loraModelRecommendations?.[0],
    optimizedPrompt
  };
}
```

---

## 七、实施计划

### 7.1 第一阶段：数据库设计

1. ✅ 创建数据库表结构
2. ✅ 设置向量索引
3. ✅ 创建数据收集脚本

### 7.2 第二阶段：数据收集

1. **图像生成数据**：
   - 收集 Flux、Stable Diffusion 模型信息
   - 收集 LoRA 模型数据（从 HuggingFace、Civitai）
   - 收集高质量提示词模板

2. **音乐生成数据**：
   - 收集 Suno 模型信息
   - 收集音乐风格提示词模板
   - 收集成功案例

### 7.3 第三阶段：系统实现

1. 更新 `PromptOptimizerService` 支持任务类型
2. 实现 `TaskAwareVectorService`
3. 实现 `TaskSpecificOptimizer`
4. 更新工作流节点

### 7.4 第四阶段：测试和优化

1. 单元测试
2. 集成测试
3. 性能优化
4. 监控和日志

---

## 八、扩展性考虑

### 8.1 添加新任务类型

1. 在 `TaskType` 枚举中添加新类型
2. 在 `TASK_TYPE_CONFIGS` 中添加配置
3. 实现任务特定的优化器方法
4. 收集该任务类型的数据

### 8.2 数据迁移

- 支持从旧版本迁移数据
- 支持批量导入数据
- 支持数据验证和清洗

---

## 九、总结

本设计方案提供了：

1. **统一的任务类型系统**：支持多种任务类型
2. **灵活的数据库设计**：按任务类型分类存储
3. **智能的数据收集**：自动收集和更新数据
4. **高效的检索机制**：任务类型感知的向量检索
5. **可扩展的架构**：易于添加新任务类型

下一步可以开始实施数据库设计和数据收集工作。
