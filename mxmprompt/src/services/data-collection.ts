/**
 * 数据收集服务
 * 
 * 功能：
 * 1. 收集主力模型数据
 * 2. 收集 LoRA 模型数据
 * 3. 收集提示词模板数据
 * 4. 从成功案例中提取数据
 * 5. 定期更新向量
 */

import { DeerAPIEmbeddingsService } from './embeddings';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { IPromptOptimizerRepository } from '@mxmai/mxmdata';
import { TASK_TYPE_CONFIGS, TaskType } from '../config/task-types';
import dotenv from 'dotenv';

dotenv.config();

// ==================== 类型定义 ====================

interface BaseModelData {
  name: string;
  modelId: string;
  description: string;
  taskType: string;
  supportedSubtypes?: string[];
  provider: string;
  modelUrl?: string;
  apiEndpoint?: string;
  version?: string;
  capabilityDescription: string;
  useCases: string[];
  defaultParams?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface LoRAModelData {
  name: string;
  description: string;
  taskType: string;
  category?: string;
  storageType: string;
  modelUrl?: string;
  modelId?: string;
  huggingfacePath?: string;
  s3Path?: string;
  baseModel?: string;
  triggerWords?: string[];
  strength?: number;
  recommendedStrength?: number;
  capabilityDescription: string;
  isPublic?: boolean;
  ownerId?: string;
  isSystem?: boolean;
  tags?: string[];
  exampleOutputs?: string[];
  metadata?: Record<string, any>;
}

interface PromptTemplateData {
  name: string;
  template: string;
  description?: string;
  taskType: string;
  category?: string;
  variables?: Record<string, any>;
  capabilityDescription: string;
  exampleOutputs?: string[];
  metadata?: Record<string, any>;
}

interface GenerationCaseData {
  taskType: string;
  taskId: string;
  originalPrompt: string;
  optimizedPrompt?: string;
  userDescription: string;
  baseModelId?: string;
  loraModelId?: string;
  taskParams?: Record<string, any>;
  outputUrl?: string;
  qualityRating?: number;
  userFeedback?: Record<string, any>;
  metadata?: Record<string, any>;
}

// ==================== 数据收集服务 ====================

export class DataCollectionService {
  private embeddings: DeerAPIEmbeddingsService;
  private repository: IPromptOptimizerRepository;

  constructor() {
    this.embeddings = DeerAPIEmbeddingsService.fromEnv('text-embedding-3-small');
    this.repository = RepositoryFactory.createPromptOptimizerRepository();
  }

  /**
   * 生成文本的向量表示
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return await this.embeddings.embedQuery(text);
  }

  /**
   * 生成能力描述文本
   */
  private generateCapabilityDescription(data: {
    description: string;
    useCases?: string[];
    category?: string;
    tags?: string[];
  }): string {
    const parts: string[] = [data.description];
    
    if (data.useCases && data.useCases.length > 0) {
      parts.push(`适用场景: ${data.useCases.join(', ')}`);
    }
    
    if (data.category) {
      parts.push(`分类: ${data.category}`);
    }
    
    if (data.tags && data.tags.length > 0) {
      parts.push(`标签: ${data.tags.join(', ')}`);
    }
    
    return parts.join('. ');
  }

  /**
   * 收集主力模型数据
   * 
   * 从任务类型配置中收集所有支持的主力模型
   */
  async collectBaseModels(taskType: string): Promise<BaseModelData[]> {
    const config = TASK_TYPE_CONFIGS[taskType];
    if (!config) {
      console.warn(`任务类型 ${taskType} 不存在配置`);
      return [];
    }

    const models: BaseModelData[] = [];

    for (const modelId of config.supportedModels.baseModels) {
      // 这里应该从模型提供商获取详细信息
      // 当前使用配置中的信息
      const modelData: BaseModelData = {
        name: this.getModelName(modelId),
        modelId,
        description: this.getModelDescription(modelId, taskType),
        taskType,
        provider: this.getModelProvider(modelId),
        capabilityDescription: this.generateCapabilityDescription({
          description: this.getModelDescription(modelId, taskType),
          useCases: this.getModelUseCases(modelId, taskType)
        }),
        useCases: this.getModelUseCases(modelId, taskType),
        defaultParams: config.defaultParams,
        metadata: {
          version: this.getModelVersion(modelId),
          modelUrl: this.getModelUrl(modelId)
        }
      };

      models.push(modelData);
    }

    return models;
  }

  /**
   * 保存主力模型到数据库
   */
  async saveBaseModel(model: BaseModelData): Promise<void> {
    // 生成 embedding
    const embedding = await this.generateEmbedding(model.capabilityDescription);

    // 通过 mxmdata 保存到数据库
    await this.repository.createBaseModel({
      name: model.name,
      model_id: model.modelId,
      description: model.description,
      task_type: model.taskType,
      supported_subtypes: model.supportedSubtypes,
      provider: model.provider,
      model_url: model.modelUrl,
      api_endpoint: model.apiEndpoint,
      version: model.version,
      capability_description: model.capabilityDescription,
      use_cases: model.useCases,
      embedding,
      default_params: model.defaultParams,
      metadata: model.metadata
    });
    
    console.log(`✅ 保存主力模型: ${model.name} (${model.modelId})`);
    console.log(`   - 任务类型: ${model.taskType}`);
    console.log(`   - 向量维度: ${embedding.length}`);
  }

  /**
   * 收集 LoRA 模型数据
   * 
   * 从外部源（如 HuggingFace、Civitai）收集 LoRA 模型信息
   */
  async collectLoRAModels(
    taskType: string,
    source: 'huggingface' | 'civitai' | 'manual' = 'manual'
  ): Promise<LoRAModelData[]> {
    // 仅图像生成支持 LoRA
    if (taskType !== TaskType.IMAGE_GENERATION && 
        !taskType.startsWith('image_')) {
      return [];
    }

    // 这里应该从外部源获取数据
    // 当前返回示例数据
    const mockLoRAModels: LoRAModelData[] = [
      {
        name: 'Portrait Professional LoRA',
        description: '专业人像摄影 LoRA，适合人像写真场景',
        taskType: TaskType.IMAGE_GENERATION,
        category: 'portrait',
        storageType: 'replicate',
        modelUrl: 'replicate/user/portrait-lora:latest',
        baseModel: 'flux-1.1-pro',
        triggerWords: ['portrait', 'professional', 'studio'],
        recommendedStrength: 0.8,
        capabilityDescription: 'portrait photography, professional, studio lighting, close-up, high quality',
        isPublic: true,
        isSystem: true,
        tags: ['portrait', 'professional', 'photography']
      },
      {
        name: 'Fashion Style LoRA',
        description: '时尚风格 LoRA，适合时尚摄影场景',
        taskType: TaskType.IMAGE_GENERATION,
        category: 'fashion',
        storageType: 'huggingface',
        huggingfacePath: 'user/fashion-lora',
        baseModel: 'flux-1.1-pro',
        triggerWords: ['fashion', 'editorial', 'dramatic'],
        recommendedStrength: 0.75,
        capabilityDescription: 'fashion photography, editorial style, dramatic lighting, professional',
        isPublic: true,
        isSystem: true,
        tags: ['fashion', 'editorial', 'photography']
      }
    ];

    return mockLoRAModels;
  }

  /**
   * 保存 LoRA 模型到数据库
   */
  async saveLoRAModel(model: LoRAModelData): Promise<void> {
    const embedding = await this.generateEmbedding(model.capabilityDescription);
    
    // 通过 mxmdata 保存到数据库
    await this.repository.createLoRAModel({
      name: model.name,
      description: model.description,
      task_type: model.taskType,
      category: model.category,
      storage_type: model.storageType,
      model_url: model.modelUrl,
      model_id: model.modelId,
      huggingface_path: model.huggingfacePath,
      s3_path: model.s3Path,
      base_model: model.baseModel,
      trigger_words: model.triggerWords,
      strength: model.strength,
      recommended_strength: model.recommendedStrength,
      capability_description: model.capabilityDescription,
      embedding,
      is_public: model.isPublic,
      owner_id: model.ownerId,
      is_system: model.isSystem,
      tags: model.tags,
      example_outputs: model.exampleOutputs,
      metadata: model.metadata
    });
    
    console.log(`✅ 保存 LoRA 模型: ${model.name}`);
    console.log(`   - 任务类型: ${model.taskType}`);
    console.log(`   - 分类: ${model.category || 'N/A'}`);
    console.log(`   - 向量维度: ${embedding.length}`);
  }

  /**
   * 从成功案例中收集提示词模板
   */
  async collectPromptsFromCases(
    taskType: string,
    minQualityRating: number = 0.8
  ): Promise<PromptTemplateData[]> {
    // 通过 mxmdata 查询高质量案例
    const cases = await this.repository.findHighQualityCases(taskType, minQualityRating, 100);

    const templates: PromptTemplateData[] = [];

    for (const case_ of cases) {
      if (!case_.optimized_prompt) continue;

      // 提取模板（简化处理，实际应该更智能）
      const template = this.extractTemplate(case_.optimized_prompt);
      
      templates.push({
        name: `Template from case ${case_.task_type}`,
        template: template.template,
        taskType,
        category: template.category,
        variables: template.variables,
        capabilityDescription: template.capabilityDescription,
        metadata: {
          source: 'generation_case',
          qualityRating: case_.quality_rating
        }
      });
    }

    return templates;
  }

  /**
   * 提取提示词模板（简化实现）
   */
  private extractTemplate(prompt: string): {
    template: string;
    category?: string;
    variables: Record<string, any>;
    capabilityDescription: string;
  } {
    // 简化实现：实际应该使用更智能的提取方法
    return {
      template: prompt,
      category: 'general',
      variables: {},
      capabilityDescription: prompt
    };
  }

  /**
   * 保存提示词模板到数据库
   */
  async savePromptTemplate(template: PromptTemplateData): Promise<void> {
    const embedding = await this.generateEmbedding(template.capabilityDescription);
    
    // 通过 mxmdata 保存到数据库
    await this.repository.createPromptTemplate({
      name: template.name,
      template: template.template,
      description: template.description,
      task_type: template.taskType,
      category: template.category,
      variables: template.variables,
      capability_description: template.capabilityDescription,
      embedding,
      example_outputs: template.exampleOutputs,
      metadata: template.metadata
    });
    
    console.log(`✅ 保存提示词模板: ${template.name}`);
    console.log(`   - 任务类型: ${template.taskType}`);
    console.log(`   - 模板: ${template.template.substring(0, 50)}...`);
    console.log(`   - 向量维度: ${embedding.length}`);
  }

  /**
   * 记录生成案例
   */
  async recordGenerationCase(case_: GenerationCaseData): Promise<void> {
    // 生成 embedding
    const originalEmbedding = await this.generateEmbedding(case_.originalPrompt);
    const optimizedEmbedding = case_.optimizedPrompt
      ? await this.generateEmbedding(case_.optimizedPrompt)
      : undefined;

    // 通过 mxmdata 保存到数据库
    await this.repository.createGenerationCase({
      task_type: case_.taskType,
      task_id: case_.taskId,
      original_prompt: case_.originalPrompt,
      optimized_prompt: case_.optimizedPrompt,
      user_description: case_.userDescription,
      base_model_id: case_.baseModelId,
      lora_model_id: case_.loraModelId,
      task_params: case_.taskParams,
      output_url: case_.outputUrl,
      quality_rating: case_.qualityRating,
      user_feedback: case_.userFeedback,
      original_prompt_embedding: originalEmbedding,
      optimized_prompt_embedding: optimizedEmbedding,
      metadata: case_.metadata
    });

    console.log(`✅ 记录生成案例: ${case_.taskId}`);
    console.log(`   - 任务类型: ${case_.taskType}`);
    console.log(`   - 原始提示词: ${case_.originalPrompt.substring(0, 50)}...`);
    
    // 如果质量高，考虑提取为模板
    if (case_.qualityRating && case_.qualityRating >= 0.8 && case_.optimizedPrompt) {
      const template = this.extractTemplate(case_.optimizedPrompt);
      await this.savePromptTemplate({
        name: `Auto-extracted from case ${case_.taskId}`,
        template: template.template,
        taskType: case_.taskType,
        category: template.category,
        variables: template.variables,
        capabilityDescription: template.capabilityDescription,
        metadata: {
          source: 'auto_extracted',
          caseId: case_.taskId,
          qualityRating: case_.qualityRating
        }
      });
    }
  }

  /**
   * 批量初始化数据
   */
  async initializeDataForTaskType(taskType: string): Promise<void> {
    console.log(`\n📊 开始为任务类型 ${taskType} 初始化数据...\n`);

    // 1. 收集主力模型
    console.log('1. 收集主力模型...');
    const baseModels = await this.collectBaseModels(taskType);
    for (const model of baseModels) {
      await this.saveBaseModel(model);
    }

    // 2. 收集 LoRA 模型（如果支持）
    const config = TASK_TYPE_CONFIGS[taskType];
    if (config?.supportedModels.loraModels) {
      console.log('\n2. 收集 LoRA 模型...');
      const loraModels = await this.collectLoRAModels(taskType);
      for (const model of loraModels) {
        await this.saveLoRAModel(model);
      }
    }

    // 3. 从案例中收集提示词模板
    console.log('\n3. 从案例中收集提示词模板...');
    const templates = await this.collectPromptsFromCases(taskType);
    for (const template of templates) {
      await this.savePromptTemplate(template);
    }

    console.log(`\n✅ 任务类型 ${taskType} 的数据初始化完成！\n`);
  }

  // ==================== 辅助方法 ====================

  private getModelName(modelId: string): string {
    const names: Record<string, string> = {
      'flux-1.1-pro': 'Flux 1.1 Pro',
      'stable-diffusion-xl': 'Stable Diffusion XL',
      'flux-dev': 'Flux Dev',
      'suno-v3': 'Suno v3',
      'suno-v3.5': 'Suno v3.5'
    };
    return names[modelId] || modelId;
  }

  private getModelDescription(modelId: string, taskType: string): string {
    if (taskType.startsWith('image_') || taskType === 'image_generation') {
      if (modelId.includes('flux')) {
        return '高质量图像生成模型，适合专业摄影、人像、风景等场景';
      } else if (modelId.includes('stable-diffusion')) {
        return '通用图像生成模型，适合多种风格和场景';
      }
    } else if (taskType.startsWith('music_') || taskType === 'music_generation') {
      if (modelId.includes('suno')) {
        return '高质量音乐生成模型，支持人声和器乐，多种风格';
      }
    }
    return 'AI 生成模型';
  }

  private getModelProvider(modelId: string): string {
    if (modelId.includes('flux') || modelId.includes('stable-diffusion')) {
      return 'replicate';
    } else if (modelId.includes('suno')) {
      return 'suno';
    }
    return 'unknown';
  }

  private getModelUseCases(modelId: string, taskType: string): string[] {
    if (taskType.startsWith('image_')) {
      return ['portrait', 'fashion', 'landscape', 'product'];
    } else if (taskType.startsWith('music_')) {
      return ['vocal', 'instrumental', 'bgm', 'soundtrack'];
    }
    return ['general'];
  }

  private getModelVersion(modelId: string): string {
    const match = modelId.match(/v?(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : 'latest';
  }

  private getModelUrl(modelId: string): string {
    if (modelId.includes('flux')) {
      return `https://replicate.com/black-forest-labs/${modelId}`;
    } else if (modelId.includes('stable-diffusion')) {
      return `https://replicate.com/stability-ai/${modelId}`;
    } else if (modelId.includes('suno')) {
      return `https://suno.ai/models/${modelId}`;
    }
    return '';
  }
}

// ==================== 导出 ====================

export {
  BaseModelData,
  LoRAModelData,
  PromptTemplateData,
  GenerationCaseData
};
