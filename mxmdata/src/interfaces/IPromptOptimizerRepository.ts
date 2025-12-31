/**
 * 提示词优化数据仓库接口
 * 提供向量数据库的访问接口
 */

// ==================== 模型定义 ====================

export interface BaseModel {
  id: string;
  name: string;
  model_id: string;
  description: string;
  task_type: string;
  supported_subtypes?: string[];
  provider?: string;
  model_url?: string;
  api_endpoint?: string;
  version?: string;
  capability_description: string;
  use_cases?: string[];
  embedding?: number[];
  usage_count?: number;
  success_rate?: number;
  average_quality_rating?: number;
  default_params?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CreateBaseModelDto {
  name: string;
  model_id: string;
  description: string;
  task_type: string;
  supported_subtypes?: string[];
  provider?: string;
  model_url?: string;
  api_endpoint?: string;
  version?: string;
  capability_description: string;
  use_cases?: string[];
  embedding?: number[];
  default_params?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateBaseModelDto {
  name?: string;
  description?: string;
  capability_description?: string;
  use_cases?: string[];
  embedding?: number[];
  default_params?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface LoRAModel {
  id: string;
  name: string;
  description: string;
  task_type: string;
  category?: string;
  storage_type: string;
  model_url?: string;
  model_id?: string;
  huggingface_path?: string;
  s3_path?: string;
  base_model?: string;
  trigger_words?: string[];
  strength?: number;
  recommended_strength?: number;
  capability_description: string;
  embedding?: number[];
  is_public?: boolean;
  owner_id?: string;
  is_system?: boolean;
  usage_count?: number;
  success_rate?: number;
  tags?: string[];
  example_outputs?: string[];
  metadata?: Record<string, any>;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CreateLoRAModelDto {
  name: string;
  description: string;
  task_type: string;
  category?: string;
  storage_type: string;
  model_url?: string;
  model_id?: string;
  huggingface_path?: string;
  s3_path?: string;
  base_model?: string;
  trigger_words?: string[];
  strength?: number;
  recommended_strength?: number;
  capability_description: string;
  embedding?: number[];
  is_public?: boolean;
  owner_id?: string;
  is_system?: boolean;
  tags?: string[];
  example_outputs?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateLoRAModelDto {
  name?: string;
  description?: string;
  capability_description?: string;
  embedding?: number[];
  tags?: string[];
  example_outputs?: string[];
  metadata?: Record<string, any>;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  description?: string;
  task_type: string;
  category?: string;
  variables?: Record<string, any>;
  capability_description: string;
  embedding?: number[];
  quality_score?: number;
  usage_count?: number;
  success_rate?: number;
  example_outputs?: string[];
  metadata?: Record<string, any>;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CreatePromptTemplateDto {
  name: string;
  template: string;
  description?: string;
  task_type: string;
  category?: string;
  variables?: Record<string, any>;
  capability_description: string;
  embedding?: number[];
  example_outputs?: string[];
  metadata?: Record<string, any>;
}

export interface UpdatePromptTemplateDto {
  name?: string;
  template?: string;
  description?: string;
  capability_description?: string;
  embedding?: number[];
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface GenerationCase {
  id: string;
  task_type: string;
  task_id?: string;
  original_prompt: string;
  optimized_prompt?: string;
  user_description?: string;
  base_model_id?: string;
  lora_model_id?: string;
  task_params?: Record<string, any>;
  output_url?: string;
  quality_rating?: number;
  user_feedback?: Record<string, any>;
  original_prompt_embedding?: number[];
  optimized_prompt_embedding?: number[];
  metadata?: Record<string, any>;
  created_at?: Date | string;
}

export interface CreateGenerationCaseDto {
  task_type: string;
  task_id?: string;
  original_prompt: string;
  optimized_prompt?: string;
  user_description?: string;
  base_model_id?: string;
  lora_model_id?: string;
  task_params?: Record<string, any>;
  output_url?: string;
  quality_rating?: number;
  user_feedback?: Record<string, any>;
  original_prompt_embedding?: number[];
  optimized_prompt_embedding?: number[];
  metadata?: Record<string, any>;
}

// ==================== 检索结果 ====================

export interface BaseModelRecommendation {
  id: string;
  name: string;
  model_id: string;
  description: string;
  similarity: number;
  use_cases?: string[];
  metadata?: Record<string, any>;
}

export interface LoRAModelRecommendation {
  id: string;
  name: string;
  task_type: string;
  description: string;
  similarity: number;
  storage_type: string;
  model_url?: string;
  trigger_words?: string[];
  recommended_strength?: number;
  metadata?: Record<string, any>;
}

export interface PromptRecommendation {
  id: string;
  template: string;
  category?: string;
  similarity: number;
  variables?: Record<string, any>;
  quality_score?: number;
  metadata?: Record<string, any>;
}

// ==================== 接口定义 ====================

/**
 * 提示词优化数据仓库接口
 */
export interface IPromptOptimizerRepository {
  // ========== 主力模型操作 ==========
  
  /**
   * 根据任务类型和向量相似度搜索主力模型
   */
  searchBaseModels(
    queryEmbedding: number[],
    taskType: string,
    limit?: number
  ): Promise<BaseModelRecommendation[]>;

  /**
   * 创建主力模型
   */
  createBaseModel(data: CreateBaseModelDto): Promise<BaseModel>;

  /**
   * 更新主力模型的 embedding
   */
  updateBaseModelEmbedding(id: string, embedding: number[]): Promise<void>;

  // ========== LoRA 模型操作 ==========

  /**
   * 根据任务类型和向量相似度搜索 LoRA 模型
   */
  searchLoRAModels(
    queryEmbedding: number[],
    taskType: string,
    userId?: string,
    limit?: number
  ): Promise<LoRAModelRecommendation[]>;

  /**
   * 创建 LoRA 模型
   */
  createLoRAModel(data: CreateLoRAModelDto): Promise<LoRAModel>;

  /**
   * 更新 LoRA 模型的 embedding
   */
  updateLoRAModelEmbedding(id: string, embedding: number[]): Promise<void>;

  // ========== 提示词模板操作 ==========

  /**
   * 根据任务类型和向量相似度搜索提示词模板
   */
  searchPrompts(
    queryEmbedding: number[],
    taskType: string,
    limit?: number
  ): Promise<PromptRecommendation[]>;

  /**
   * 创建提示词模板
   */
  createPromptTemplate(data: CreatePromptTemplateDto): Promise<PromptTemplate>;

  /**
   * 更新提示词模板的 embedding
   */
  updatePromptTemplateEmbedding(id: string, embedding: number[]): Promise<void>;

  // ========== 生成案例操作 ==========

  /**
   * 创建生成案例
   */
  createGenerationCase(data: CreateGenerationCaseDto): Promise<GenerationCase>;

  /**
   * 根据任务类型和质量评分查询高质量案例
   */
  findHighQualityCases(
    taskType: string,
    minQualityRating?: number,
    limit?: number
  ): Promise<GenerationCase[]>;

  /**
   * 根据向量相似度搜索相似案例
   */
  searchSimilarCases(
    queryEmbedding: number[],
    taskType: string,
    limit?: number
  ): Promise<GenerationCase[]>;
}
