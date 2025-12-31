/**
 * 提示词优化服务
 * 
 * 功能：
 * 1. 从向量数据库检索适配的主力模型
 * 2. 检索推荐的 LoRA 模型
 * 3. 检索精准命中的提示词模板
 * 4. 使用 LangGraph 构建优化工作流
 */

import { StateGraph, END } from '@langchain/langgraph';
import { PromptTemplate } from '@langchain/core/prompts';
import { DeerAPIEmbeddingsService } from './embeddings';
import { DeerAPILLMService } from './llm';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { IPromptOptimizerRepository } from '@mxmai/mxmdata';
import dotenv from 'dotenv';

dotenv.config();

// ==================== 类型定义 ====================

/**
 * 提示词优化工作流状态
 */
export interface PromptOptimizerState {
  // 输入字段
  /** 用户输入的文字描述 */
  userDescription: string;
  /** 用户ID（可选，用于个性化推荐） */
  userId?: string;
  /** 任务类型（必需，如 image_generation, music_generation） */
  taskType: string;

  // 中间状态字段
  /** 用户描述的向量表示 */
  queryEmbedding?: number[];
  /** 检索到的主力模型推荐 */
  baseModelRecommendations?: BaseModelRecommendation[];
  /** 检索到的 LoRA 模型推荐 */
  loraModelRecommendations?: LoRAModelRecommendation[];
  /** 检索到的精准提示词 */
  promptRecommendations?: PromptRecommendation[];
  /** 分析后的任务特征 */
  analyzedFeatures?: TaskFeatures;

  // 输出字段
  /** 最终推荐的主力模型 */
  selectedBaseModel?: BaseModelInfo;
  /** 最终推荐的 LoRA 模型 */
  selectedLoRAModel?: LoRAModelInfo;
  /** 最终优化的提示词 */
  optimizedPrompt?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 主力模型推荐
 */
export interface BaseModelRecommendation {
  id: string;
  name: string;
  model_id: string; // 如 flux-1.1-pro, stable-diffusion-xl
  description: string;
  similarity: number;
  use_cases?: string[]; // 适用场景列表
  metadata?: Record<string, any>;
}

/**
 * LoRA 模型推荐
 */
export interface LoRAModelRecommendation {
  id: string;
  name: string;
  taskType: string;
  description: string;
  similarity: number;
  storageType: string; // replicate / huggingface / s3
  modelUrl?: string;
  triggerWords?: string[];
  recommendedStrength?: number;
  metadata?: Record<string, any>;
}

/**
 * 提示词推荐
 */
export interface PromptRecommendation {
  id: string;
  template: string;
  category: string;
  similarity: number;
  variables?: Record<string, any>;
  qualityScore?: number;
  metadata?: Record<string, any>;
}

/**
 * 任务特征分析
 */
export interface TaskFeatures {
  subject: string; // 主体
  scene: string; // 场景
  style: string; // 风格
  technicalParams: string; // 技术参数
}

/**
 * 主力模型信息
 */
export interface BaseModelInfo {
  id: string;
  name: string;
  modelId: string;
  description: string;
}

/**
 * LoRA 模型信息
 */
export interface LoRAModelInfo {
  id: string;
  name: string;
  taskType: string;
  storageType: string;
  modelUrl?: string;
  triggerWords?: string[];
  strength?: number;
}

// ==================== 向量数据库服务 ====================

/**
 * 向量数据库服务
 * 通过 mxmdata 访问向量数据库
 */
class VectorDatabaseService {
  private embeddings: DeerAPIEmbeddingsService;
  private repository: IPromptOptimizerRepository;

  constructor() {
    this.embeddings = DeerAPIEmbeddingsService.fromEnv('text-embedding-3-small');
    this.repository = RepositoryFactory.createPromptOptimizerRepository();
  }

  /**
   * 生成文本的向量表示
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return await this.embeddings.embedQuery(text);
  }


  /**
   * 检索主力模型推荐
   */
  async searchBaseModels(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<BaseModelRecommendation[]> {
    // 通过 mxmdata 查询向量数据库
    return await this.repository.searchBaseModels(queryEmbedding, taskType, limit);
  }

  /**
   * 检索 LoRA 模型推荐
   */
  async searchLoRAModels(
    queryEmbedding: number[],
    taskType: string,
    userId?: string,
    limit: number = 5
  ): Promise<LoRAModelRecommendation[]> {
    // 通过 mxmdata 查询向量数据库
    return await this.repository.searchLoRAModels(queryEmbedding, taskType, userId, limit);
  }

  /**
   * 检索精准提示词
   */
  async searchPrompts(
    queryEmbedding: number[],
    taskType: string,
    limit: number = 5
  ): Promise<PromptRecommendation[]> {
    // 通过 mxmdata 查询向量数据库
    return await this.repository.searchPrompts(queryEmbedding, taskType, limit);
  }
}

// ==================== 工作流节点 ====================

/**
 * 节点1: 生成查询向量
 */
async function generateQueryEmbedding(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('📊 节点1: 生成查询向量...');

  const vectorDB = new VectorDatabaseService();
  const embedding = await vectorDB.generateEmbedding(state.userDescription);

  return { queryEmbedding: embedding };
}

/**
 * 节点2: 分析任务特征
 */
async function analyzeTaskFeatures(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('🔍 节点2: 分析任务特征...');

  const llm = DeerAPILLMService.fromEnv('gpt-4o-mini');
  const template = PromptTemplate.fromTemplate(`
分析以下用户描述，提取任务特征。

用户描述: {userDescription}

请以 JSON 格式返回：
{{
  "subject": "主体（人物/物体/场景）",
  "scene": "场景描述",
  "style": "风格描述",
  "technicalParams": "技术参数（景别、镜头、光线等）"
}}
  `);

  const prompt = await template.format({
    userDescription: state.userDescription
  });

  const response = await llm.invoke(prompt);
  
  let analyzedFeatures: TaskFeatures;
  try {
    analyzedFeatures = JSON.parse(response.content as string);
  } catch {
    analyzedFeatures = {
      subject: 'unknown',
      scene: 'general',
      style: 'standard',
      technicalParams: 'standard'
    };
  }

  return { analyzedFeatures };
}

/**
 * 节点3: 检索主力模型（并行）
 */
async function retrieveBaseModels(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('🎯 节点3: 检索主力模型...');

  if (!state.queryEmbedding || !state.taskType) {
    return { error: '查询向量或任务类型未生成' };
  }

  const vectorDB = new VectorDatabaseService();
  const recommendations = await vectorDB.searchBaseModels(state.queryEmbedding, state.taskType, 5);

  return { baseModelRecommendations: recommendations };
}

/**
 * 节点4: 检索 LoRA 模型（并行）
 */
async function retrieveLoRAModels(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('🎨 节点4: 检索 LoRA 模型...');

  if (!state.queryEmbedding || !state.taskType) {
    return { error: '查询向量或任务类型未生成' };
  }

  const vectorDB = new VectorDatabaseService();
  const recommendations = await vectorDB.searchLoRAModels(
    state.queryEmbedding,
    state.taskType,
    state.userId,
    5
  );

  return { loraModelRecommendations: recommendations };
}

/**
 * 节点5: 检索精准提示词（并行）
 */
async function retrievePrompts(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('📝 节点5: 检索精准提示词...');

  if (!state.queryEmbedding || !state.taskType) {
    return { error: '查询向量或任务类型未生成' };
  }

  const vectorDB = new VectorDatabaseService();
  const recommendations = await vectorDB.searchPrompts(state.queryEmbedding, state.taskType, 5);

  return { promptRecommendations: recommendations };
}

/**
 * 节点6: 选择最佳模型和提示词
 */
async function selectBestRecommendations(
  state: PromptOptimizerState
): Promise<Partial<PromptOptimizerState>> {
  console.log('✨ 节点6: 选择最佳推荐...');

  // 选择相似度最高的主力模型
  const selectedBaseModel = state.baseModelRecommendations?.[0]
    ? {
        id: state.baseModelRecommendations[0].id,
        name: state.baseModelRecommendations[0].name,
        modelId: state.baseModelRecommendations[0].model_id,
        description: state.baseModelRecommendations[0].description
      }
    : undefined;

  // 选择相似度最高的 LoRA 模型
  const selectedLoRAModel = state.loraModelRecommendations?.[0]
    ? {
        id: state.loraModelRecommendations[0].id,
        name: state.loraModelRecommendations[0].name,
        taskType: state.loraModelRecommendations[0].taskType,
        storageType: state.loraModelRecommendations[0].storageType,
        modelUrl: state.loraModelRecommendations[0].modelUrl,
        triggerWords: state.loraModelRecommendations[0].triggerWords,
        strength: state.loraModelRecommendations[0].recommendedStrength
      }
    : undefined;

  // 选择相似度最高的提示词模板
  const bestPrompt = state.promptRecommendations?.[0];
  
  // 使用 LLM 优化提示词
  let optimizedPrompt = state.userDescription;
  if (bestPrompt) {
    const llm = DeerAPILLMService.fromEnv('gpt-4o-mini');
    const template = PromptTemplate.fromTemplate(`
你是一个专业的 AI 图像生成提示词优化专家。

用户原始描述: {userDescription}
任务特征: {features}
推荐的提示词模板: {promptTemplate}
LoRA 触发词: {triggerWords}

请根据以上信息，生成一个精准、详细的图像生成提示词。
要求：
1. 保持用户原始意图
2. 结合任务特征
3. 参考推荐的提示词模板
4. 如果提供了 LoRA 触发词，请适当融入
5. 使用专业术语
6. 提示词长度控制在 100-200 字
7. 使用英文输出

优化后的提示词:
    `);

    const prompt = await template.format({
      userDescription: state.userDescription,
      features: JSON.stringify(state.analyzedFeatures || {}),
      promptTemplate: bestPrompt.template,
      triggerWords: selectedLoRAModel?.triggerWords?.join(', ') || '无'
    });

    const response = await llm.invoke(prompt);
    optimizedPrompt = response.content as string;
  }

  return {
    selectedBaseModel,
    selectedLoRAModel,
    optimizedPrompt
  };
}

/**
 * 条件路由：检查错误
 */
function checkError(state: PromptOptimizerState): string {
  if (state.error) {
    return 'error';
  }
  return 'continue';
}

// ==================== 构建工作流 ====================

/**
 * 创建提示词优化工作流
 * 
 * 工作流结构：
 * ```
 * 开始
 *   ↓
 * [节点1: 生成查询向量]
 *   ↓
 *   ├─→ [节点2: 分析任务特征]
 *   ├─→ [节点3: 检索主力模型]
 *   ├─→ [节点4: 检索 LoRA 模型]
 *   └─→ [节点5: 检索提示词]
 *        ↓
 *   [节点6: 选择最佳推荐]
 *        ↓
 *       结束
 * ```
 */
export function createPromptOptimizerWorkflow() {
  const workflow = new StateGraph<PromptOptimizerState>({
    channels: {
      userDescription: { reducer: (x, y) => y ?? x },
      userId: { reducer: (x, y) => y ?? x },
      taskType: { reducer: (x, y) => y ?? x },
      queryEmbedding: { reducer: (x, y) => y ?? x },
      baseModelRecommendations: { reducer: (x, y) => y ?? x },
      loraModelRecommendations: { reducer: (x, y) => y ?? x },
      promptRecommendations: { reducer: (x, y) => y ?? x },
      analyzedFeatures: { reducer: (x, y) => y ?? x },
      selectedBaseModel: { reducer: (x, y) => y ?? x },
      selectedLoRAModel: { reducer: (x, y) => y ?? x },
      optimizedPrompt: { reducer: (x, y) => y ?? x },
      error: { reducer: (x, y) => y ?? x }
    }
  });

  // 添加节点
  workflow.addNode('generateEmbedding', generateQueryEmbedding);
  workflow.addNode('analyzeFeatures', analyzeTaskFeatures);
  workflow.addNode('retrieveBaseModels', retrieveBaseModels);
  workflow.addNode('retrieveLoRAModels', retrieveLoRAModels);
  workflow.addNode('retrievePrompts', retrievePrompts);
  workflow.addNode('selectBest', selectBestRecommendations);

  // 设置入口点
  workflow.setEntryPoint('generateEmbedding');

  // 节点1执行后，并行执行节点2、3、4、5
  workflow.addEdge('generateEmbedding', 'analyzeFeatures');
  workflow.addEdge('generateEmbedding', 'retrieveBaseModels');
  workflow.addEdge('generateEmbedding', 'retrieveLoRAModels');
  workflow.addEdge('generateEmbedding', 'retrievePrompts');

  // 节点2、3、4、5执行后，都进入节点6（需要等待所有并行节点完成）
  workflow.addConditionalEdges(
    'analyzeFeatures',
    checkError,
    {
      continue: 'selectBest',
      error: END
    }
  );

  workflow.addConditionalEdges(
    'retrieveBaseModels',
    checkError,
    {
      continue: 'selectBest',
      error: END
    }
  );

  workflow.addConditionalEdges(
    'retrieveLoRAModels',
    checkError,
    {
      continue: 'selectBest',
      error: END
    }
  );

  workflow.addConditionalEdges(
    'retrievePrompts',
    checkError,
    {
      continue: 'selectBest',
      error: END
    }
  );

  // 节点6执行后结束
  workflow.addEdge('selectBest', END);

  return workflow.compile();
}

// ==================== 导出 ====================

export { VectorDatabaseService };
