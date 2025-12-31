/**
 * Supabase 提示词优化数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IPromptOptimizerRepository,
  BaseModel,
  CreateBaseModelDto,
  UpdateBaseModelDto,
  LoRAModel,
  CreateLoRAModelDto,
  UpdateLoRAModelDto,
  PromptTemplate,
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
  GenerationCase,
  CreateGenerationCaseDto,
  BaseModelRecommendation,
  LoRAModelRecommendation,
  PromptRecommendation,
} from '../../interfaces/IPromptOptimizerRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabasePromptOptimizerRepository implements IPromptOptimizerRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  // ========== 主力模型操作 ==========

  async searchBaseModels(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<BaseModelRecommendation[]> {
    try {
      // 使用 pgvector 的余弦相似度搜索
      // 注意：Supabase 需要启用 pgvector 扩展
      const { data, error } = await this.client.rpc('search_base_models', {
        query_embedding: queryEmbedding,
        task_type: taskType,
        match_limit: limit,
        match_threshold: 0.5, // 相似度阈值
      });

      if (error) {
        throw new DataAccessError(
          `Failed to search base models: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        model_id: item.model_id,
        description: item.description,
        similarity: item.similarity,
        use_cases: item.use_cases,
        metadata: {
          ...item.default_params,
          ...item.metadata,
        },
      }));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching base models: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async createBaseModel(data: CreateBaseModelDto): Promise<BaseModel> {
    try {
      const { data: result, error } = await this.client
        .from('base_models')
        .insert({
          name: data.name,
          model_id: data.model_id,
          description: data.description,
          task_type: data.task_type,
          supported_subtypes: data.supported_subtypes,
          provider: data.provider,
          model_url: data.model_url,
          api_endpoint: data.api_endpoint,
          version: data.version,
          capability_description: data.capability_description,
          use_cases: data.use_cases,
          embedding: data.embedding,
          default_params: data.default_params,
          metadata: data.metadata,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create base model: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToBaseModel(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating base model: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateBaseModelEmbedding(id: string, embedding: number[]): Promise<void> {
    try {
      const { error } = await this.client
        .from('base_models')
        .update({ embedding })
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to update base model embedding: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating base model embedding: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== LoRA 模型操作 ==========

  async searchLoRAModels(
    queryEmbedding: number[],
    taskType: string,
    userId?: string,
    limit: number = 5
  ): Promise<LoRAModelRecommendation[]> {
    try {
      const { data, error } = await this.client.rpc('search_lora_models', {
        query_embedding: queryEmbedding,
        task_type: taskType,
        user_id: userId,
        match_limit: limit,
        match_threshold: 0.5,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to search LoRA models: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        task_type: item.task_type,
        description: item.description,
        similarity: item.similarity,
        storage_type: item.storage_type,
        model_url: item.model_url,
        trigger_words: item.trigger_words,
        recommended_strength: item.recommended_strength,
        metadata: item.metadata,
      }));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching LoRA models: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async createLoRAModel(data: CreateLoRAModelDto): Promise<LoRAModel> {
    try {
      const { data: result, error } = await this.client
        .from('lora_models')
        .insert({
          name: data.name,
          description: data.description,
          task_type: data.task_type,
          category: data.category,
          storage_type: data.storage_type,
          model_url: data.model_url,
          model_id: data.model_id,
          huggingface_path: data.huggingface_path,
          s3_path: data.s3_path,
          base_model: data.base_model,
          trigger_words: data.trigger_words,
          strength: data.strength,
          recommended_strength: data.recommended_strength,
          capability_description: data.capability_description,
          embedding: data.embedding,
          is_public: data.is_public ?? true,
          owner_id: data.owner_id,
          is_system: data.is_system ?? false,
          tags: data.tags,
          example_outputs: data.example_outputs,
          metadata: data.metadata,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create LoRA model: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToLoRAModel(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating LoRA model: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateLoRAModelEmbedding(id: string, embedding: number[]): Promise<void> {
    try {
      const { error } = await this.client
        .from('lora_models')
        .update({ embedding })
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to update LoRA model embedding: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating LoRA model embedding: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 提示词模板操作 ==========

  async searchPrompts(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<PromptRecommendation[]> {
    try {
      const { data, error } = await this.client.rpc('search_prompt_templates', {
        query_embedding: queryEmbedding,
        task_type: taskType,
        match_limit: limit,
        match_threshold: 0.5,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to search prompt templates: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        template: item.template,
        category: item.category,
        similarity: item.similarity,
        variables: item.variables,
        quality_score: item.quality_score,
        metadata: item.metadata,
      }));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching prompt templates: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async createPromptTemplate(data: CreatePromptTemplateDto): Promise<PromptTemplate> {
    try {
      const { data: result, error } = await this.client
        .from('prompt_templates')
        .insert({
          name: data.name,
          template: data.template,
          description: data.description,
          task_type: data.task_type,
          category: data.category,
          variables: data.variables,
          capability_description: data.capability_description,
          embedding: data.embedding,
          example_outputs: data.example_outputs,
          metadata: data.metadata,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create prompt template: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToPromptTemplate(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating prompt template: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updatePromptTemplateEmbedding(id: string, embedding: number[]): Promise<void> {
    try {
      const { error } = await this.client
        .from('prompt_templates')
        .update({ embedding })
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to update prompt template embedding: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating prompt template embedding: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 生成案例操作 ==========

  async createGenerationCase(data: CreateGenerationCaseDto): Promise<GenerationCase> {
    try {
      const { data: result, error } = await this.client
        .from('generation_cases')
        .insert({
          task_type: data.task_type,
          task_id: data.task_id,
          original_prompt: data.original_prompt,
          optimized_prompt: data.optimized_prompt,
          user_description: data.user_description,
          base_model_id: data.base_model_id,
          lora_model_id: data.lora_model_id,
          task_params: data.task_params,
          output_url: data.output_url,
          quality_rating: data.quality_rating,
          user_feedback: data.user_feedback,
          original_prompt_embedding: data.original_prompt_embedding,
          optimized_prompt_embedding: data.optimized_prompt_embedding,
          metadata: data.metadata,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create generation case: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToGenerationCase(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating generation case: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async findHighQualityCases(
    taskType: string,
    minQualityRating: number = 0.8,
    limit: number = 100
  ): Promise<GenerationCase[]> {
    try {
      const { data, error } = await this.client
        .from('generation_cases')
        .select('*')
        .eq('task_type', taskType)
        .gte('quality_rating', minQualityRating)
        .order('quality_rating', { ascending: false })
        .limit(limit);

      if (error) {
        throw new DataAccessError(
          `Failed to find high quality cases: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map(item => this.mapToGenerationCase(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding high quality cases: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async searchSimilarCases(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<GenerationCase[]> {
    try {
      const { data, error } = await this.client.rpc('search_similar_cases', {
        query_embedding: queryEmbedding,
        task_type: taskType,
        match_limit: limit,
        match_threshold: 0.5,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to search similar cases: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => this.mapToGenerationCase(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching similar cases: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 映射方法 ==========

  private mapToBaseModel(data: any): BaseModel {
    return {
      id: data.id,
      name: data.name,
      model_id: data.model_id,
      description: data.description,
      task_type: data.task_type,
      supported_subtypes: data.supported_subtypes,
      provider: data.provider,
      model_url: data.model_url,
      api_endpoint: data.api_endpoint,
      version: data.version,
      capability_description: data.capability_description,
      use_cases: data.use_cases,
      embedding: data.embedding,
      usage_count: data.usage_count,
      success_rate: data.success_rate,
      average_quality_rating: data.average_quality_rating,
      default_params: data.default_params,
      metadata: data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToLoRAModel(data: any): LoRAModel {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      task_type: data.task_type,
      category: data.category,
      storage_type: data.storage_type,
      model_url: data.model_url,
      model_id: data.model_id,
      huggingface_path: data.huggingface_path,
      s3_path: data.s3_path,
      base_model: data.base_model,
      trigger_words: data.trigger_words,
      strength: data.strength,
      recommended_strength: data.recommended_strength,
      capability_description: data.capability_description,
      embedding: data.embedding,
      is_public: data.is_public,
      owner_id: data.owner_id,
      is_system: data.is_system,
      usage_count: data.usage_count,
      success_rate: data.success_rate,
      tags: data.tags,
      example_outputs: data.example_outputs,
      metadata: data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToPromptTemplate(data: any): PromptTemplate {
    return {
      id: data.id,
      name: data.name,
      template: data.template,
      description: data.description,
      task_type: data.task_type,
      category: data.category,
      variables: data.variables,
      capability_description: data.capability_description,
      embedding: data.embedding,
      quality_score: data.quality_score,
      usage_count: data.usage_count,
      success_rate: data.success_rate,
      example_outputs: data.example_outputs,
      metadata: data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToGenerationCase(data: any): GenerationCase {
    return {
      id: data.id,
      task_type: data.task_type,
      task_id: data.task_id,
      original_prompt: data.original_prompt,
      optimized_prompt: data.optimized_prompt,
      user_description: data.user_description,
      base_model_id: data.base_model_id,
      lora_model_id: data.lora_model_id,
      task_params: data.task_params,
      output_url: data.output_url,
      quality_rating: data.quality_rating,
      user_feedback: data.user_feedback,
      original_prompt_embedding: data.original_prompt_embedding,
      optimized_prompt_embedding: data.optimized_prompt_embedding,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }
}
