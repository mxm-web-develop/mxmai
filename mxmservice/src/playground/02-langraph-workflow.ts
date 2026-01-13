/**
 * LangGraph 工作流演示
 * 
 * 本文件演示 LangGraph 的核心概念和用法，适用于教学场景。
 * 
 * 学习目标：
 * 1. 理解 LangGraph 的状态图（StateGraph）概念
 * 2. 掌握如何定义工作流节点（Nodes）
 * 3. 学习如何定义边（Edges）和条件路由
 * 4. 理解状态管理和数据流转
 * 5. 掌握复杂工作流的构建方法
 * 
 * 前置知识：
 * - 了解 LangChain 基础（建议先学习 01-langchain-basic.ts）
 * - 了解图论基础概念（节点、边、有向图）
 * - 了解状态机概念
 * 
 * LangGraph 核心概念：
 * - StateGraph: 状态图，用于定义工作流的结构
 * - Node: 节点，工作流中的处理单元
 * - Edge: 边，定义节点之间的连接关系
 * - Conditional Edge: 条件边，根据状态决定下一步执行哪个节点
 * - State: 状态，在工作流中传递的数据
 * 
 * 环境要求：
 * - 需要配置 DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量
 */

import { StateGraph, END } from '@langchain/langgraph';
import { PromptTemplate } from '@langchain/core/prompts';
import { DeerAPIChatModel } from './utils/deerapi-llm';
import dotenv from 'dotenv';

dotenv.config();

// ==================== 状态定义 ====================

/**
 * 图生图工作流状态接口
 * 
 * 功能说明：
 * - 状态（State）是 LangGraph 中传递数据的容器
 * - 所有节点都可以读取和修改状态
 * - 状态的变化会在节点之间传递
 * 
 * 设计原则：
 * 1. 输入字段：工作流开始时的初始数据
 * 2. 中间字段：节点处理过程中产生的中间结果
 * 3. 输出字段：工作流最终产生的结果
 * 
 * 字段说明：
 * - userId: 用户ID，用于标识请求来源
 * - userPrompt: 用户输入的原始提示词
 * - renderParams: 渲染参数（景别、镜头、光线等）
 * - referenceImageUrl: 参考图片URL（图生图场景）
 * - analyzedIntent: 分析后的用户意图（节点1的输出）
 * - similarCases: RAG召回 similarCases（节点2的输出）
 * - optimizedPrompt: 优化后的提示词（节点3的输出）
 * - loraModelId: 选择的LoRA模型ID（节点4的输出）
 * - generationTaskId: 生成任务ID（节点5的输出）
 * - resultImageUrl: 最终生成的图片URL（节点6的输出）
 * - error: 错误信息（如果任何节点失败）
 */
interface ImageToImageState {
  // ========== 输入字段 ==========
  /** 用户ID，用于标识请求来源 */
  userId: string;
  /** 用户输入的原始提示词 */
  userPrompt: string;
  /** 渲染参数（景别、镜头、光线、风格等） */
  renderParams?: {
    scene?: string;      // 景别：close-up / medium-shot / wide-shot
    lens?: string;       // 镜头：wide-angle / standard / telephoto
    lighting?: string;   // 光线：natural / studio / golden-hour
    style?: string;      // 风格：portrait / fashion / artistic
  };
  /** 参考图片URL（图生图场景需要） */
  referenceImageUrl?: string;

  // ========== 中间状态字段 ==========
  /** 分析后的用户意图（节点1的输出） */
  analyzedIntent?: {
    subject: string;           // 主体（人物/物体）
    scene: string;             // 场景描述
    style: string;             // 风格描述
    technicalParams: string;  // 技术参数
  };
  /** RAG召回 similarCases（节点2的输出） */
  similarCases?: Array<{
    id: string;              // 案例ID
    prompt: string;          // 提示词
    similarity: number;      // 相似度分数（0-1）
  }>;
  /** 优化后的提示词（节点3的输出） */
  optimizedPrompt?: string;
  /** 选择的LoRA模型ID（节点4的输出） */
  loraModelId?: string;

  // ========== 输出字段 ==========
  /** 生成任务ID（节点5的输出） */
  generationTaskId?: string;
  /** 最终生成的图片URL（节点6的输出） */
  resultImageUrl?: string;
  /** 错误信息（如果任何节点失败） */
  error?: string;
}

// ==================== 工具函数 ====================

/**
 * 初始化 LLM（使用 DeerAPI）
 * 
 * 功能说明：
 * - 创建工作流中所有节点共享的 LLM 实例
 * - 使用 DeerAPI 作为统一的模型接口
 * 
 * 返回值：
 * - DeerAPIChatModel 实例
 */
function initLLM() {
  return DeerAPIChatModel.fromEnv('gpt-4o-mini');
}

/**
 * 模拟 RAG 召回函数
 * 
 * 功能说明：
 * - RAG（Retrieval-Augmented Generation）是检索增强生成
 * - 通过向量数据库检索相似的案例，为提示词优化提供参考
 * - 这里是模拟实现，实际应该调用向量数据库
 * 
 * 参数说明：
 * - query: 查询文本，用于向量相似度搜索
 * - limit: 返回结果数量限制，默认5条
 * 
 * 返回值：
 * - 相似案例数组，包含ID、提示词和相似度分数
 * 
 * 实际实现：
 * 应该调用向量数据库（如 pgvector），根据查询文本的 embedding
 * 进行相似度搜索，返回最相似的案例
 */
async function mockRAGRetrieve(query: string, limit: number = 5) {
  // 模拟网络延迟（实际调用向量数据库需要时间）
  await new Promise(resolve => setTimeout(resolve, 100));

  // 模拟返回的相似案例数据
  // 实际应该从向量数据库查询
  return [
    {
      id: 'case-1',
      prompt: 'portrait photography, close-up, studio lighting, professional',
      similarity: 0.95  // 相似度 95%
    },
    {
      id: 'case-2',
      prompt: 'portrait photography, medium-shot, natural light, cinematic',
      similarity: 0.88  // 相似度 88%
    }
  ].slice(0, limit);
}

/**
 * 模拟创建生成任务函数
 * 
 * 功能说明：
 * - 创建图像生成任务，调用实际的生成服务（如 Replicate、ComfyUI）
 * - 这里是模拟实现，实际应该调用 mxmcgi API
 * 
 * 参数说明：
 * - prompt: 优化后的提示词
 * - referenceImageUrl: 参考图片URL（可选）
 * - loraModelId: LoRA模型ID（可选）
 * 
 * 返回值：
 * - 任务对象，包含任务ID和任务编号
 * 
 * 实际实现：
 * 应该调用 mxmcgi 服务的 API，创建实际的生成任务
 * 任务创建后会在后台异步执行，返回任务ID用于后续查询状态
 */
async function mockCreateGenerationTask(params: {
  prompt: string;
  referenceImageUrl?: string;
  loraModelId?: string;
}) {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 200));

  // 模拟返回任务信息
  // 实际应该调用 mxmcgi API: POST /api/v1/generation/tasks
  return {
    id: `task-${Date.now()}`,
    taskNo: `GEN${Date.now()}`
  };
}

// ==================== 节点定义 ====================

/**
 * 节点1: 分析用户意图
 * 
 * 功能说明：
 * - 这是工作流的第一个节点，分析用户输入的提示词
 * - 提取关键信息：主体、场景、风格、技术参数
 * - 为后续节点提供结构化的分析结果
 * 
 * 输入：
 * - state.userPrompt: 用户原始提示词
 * - state.renderParams: 渲染参数
 * 
 * 输出：
 * - state.analyzedIntent: 分析后的结构化数据
 * 
 * 执行流程：
 * 1. 构建分析提示词模板
 * 2. 调用 LLM 进行分析
 * 3. 解析 LLM 返回的 JSON 结果
 * 4. 更新状态中的 analyzedIntent 字段
 * 
 * 注意事项：
 * - 实际应该使用 JSONOutputParser 来解析 JSON
 * - 需要处理 LLM 返回格式不正确的情况
 */
async function analyzeIntent(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('📝 节点1: 分析用户意图...');

  // 步骤1: 初始化 LLM
  const llm = initLLM();
  
  // 步骤2: 创建分析提示词模板
  // 要求 LLM 以 JSON 格式返回分析结果
  const template = PromptTemplate.fromTemplate(`
分析以下用户提示词，提取关键信息。

用户提示词: {userPrompt}
渲染参数: {renderParams}

请以 JSON 格式返回：
{{
  "subject": "主体（人物/物体）",
  "scene": "场景描述",
  "style": "风格描述",
  "technicalParams": "技术参数（景别、镜头、光线等）"
}}
  `);

  // 步骤3: 填充模板
  const prompt = await template.format({
    userPrompt: state.userPrompt,
    renderParams: JSON.stringify(state.renderParams || {})
  });

  // 步骤4: 调用 LLM 进行分析
  const response = await llm.invoke(prompt);
  
  // 步骤5: 解析 JSON 结果
  // 注意：这里简化处理，实际应该使用 JSONOutputParser
  let analyzedIntent;
  try {
    analyzedIntent = JSON.parse(response.content as string);
  } catch {
    // 如果解析失败，使用默认值
    analyzedIntent = {
      subject: 'person',
      scene: 'portrait',
      style: 'professional',
      technicalParams: 'close-up, standard lens, natural light'
    };
  }

  // 步骤6: 返回状态更新
  // Partial<ImageToImageState> 表示只更新部分字段
  // LangGraph 会自动合并到完整状态中
  return { analyzedIntent };
}

/**
 * 节点2: RAG 召回相似案例
 * 
 * 功能说明：
 * - 使用 RAG（检索增强生成）技术召回相似的生成案例
 * - 为提示词优化提供参考，提高生成质量
 * - 可以并行执行（与节点4同时执行）
 * 
 * 输入：
 * - state.userPrompt: 用户提示词
 * - state.renderParams: 渲染参数
 * 
 * 输出：
 * - state.similarCases: 相似案例数组
 * 
 * 执行流程：
 * 1. 构建查询文本（结合提示词和参数）
 * 2. 调用向量数据库进行相似度搜索
 * 3. 返回最相似的案例
 * 4. 更新状态中的 similarCases 字段
 * 
 * 技术细节：
 * - 实际应该使用向量数据库（如 pgvector）
 * - 将查询文本转换为 embedding
 * - 使用余弦相似度进行搜索
 * - 返回相似度最高的 Top-K 结果
 */
async function retrieveSimilarCases(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('🔍 节点2: RAG 召回相似案例...');

  // 步骤1: 构建查询文本
  // 将用户提示词和渲染参数组合成查询文本
  const query = `${state.userPrompt} ${JSON.stringify(state.renderParams)}`;
  
  // 步骤2: 调用 RAG 检索（实际应该调用向量数据库）
  const similarCases = await mockRAGRetrieve(query, 5);

  // 步骤3: 返回状态更新
  return { similarCases };
}

/**
 * 节点3: 优化提示词
 * 
 * 功能说明：
 * - 这是工作流的核心节点，将用户原始提示词优化为精准的模型提示词
 * - 结合分析结果、相似案例和渲染参数
 * - 生成符合 Flux 模型要求的专业提示词
 * 
 * 输入：
 * - state.userPrompt: 用户原始提示词
 * - state.analyzedIntent: 分析结果（来自节点1）
 * - state.similarCases: 相似案例（来自节点2）
 * - state.renderParams: 渲染参数
 * 
 * 输出：
 * - state.optimizedPrompt: 优化后的提示词
 * 
 * 执行流程：
 * 1. 准备优化提示词模板
 * 2. 格式化相似案例文本
 * 3. 调用 LLM 进行优化
 * 4. 提取优化后的提示词
 * 5. 更新状态
 * 
 * 依赖关系：
 * - 需要等待节点1和节点2完成（因为需要它们的输出）
 * - 这是串行执行的节点
 */
async function optimizePrompt(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('✨ 节点3: 优化提示词...');

  // 步骤1: 初始化 LLM
  const llm = initLLM();
  
  // 步骤2: 创建优化提示词模板
  const template = PromptTemplate.fromTemplate(`
你是一个专业的 AI 图像生成提示词优化专家。

用户原始提示词: {userPrompt}
分析结果: {analysis}
相似案例: {similarCases}
渲染参数: {renderParams}

请根据以上信息，生成一个精准、详细的 Flux 模型提示词。
要求：
1. 保持用户原始意图
2. 结合渲染参数
3. 参考相似案例的风格和技巧
4. 使用专业摄影术语
5. 提示词长度控制在 100-200 字
6. 使用英文输出

优化后的提示词:
  `);

  // 步骤3: 格式化相似案例文本
  // 将相似案例数组转换为可读的文本格式
  const similarCasesText = state.similarCases
    ?.map(c => `- ${c.prompt} (相似度: ${c.similarity})`)
    .join('\n') || '无';

  // 步骤4: 填充模板
  const prompt = await template.format({
    userPrompt: state.userPrompt,
    analysis: JSON.stringify(state.analyzedIntent),
    similarCases: similarCasesText,
    renderParams: JSON.stringify(state.renderParams || {})
  });

  // 步骤5: 调用 LLM 进行优化
  const response = await llm.invoke(prompt);
  const optimizedPrompt = response.content as string;

  // 步骤6: 返回状态更新
  return { optimizedPrompt };
}

/**
 * 节点4: 选择 LoRA 模型
 * 
 * 功能说明：
 * - 根据任务类型和渲染参数选择合适的 LoRA 模型
 * - LoRA 模型用于微调生成效果，如个人写真、风格迁移等
 * - 可以并行执行（与节点2同时执行）
 * 
 * 输入：
 * - state.renderParams: 渲染参数（特别是 style 字段）
 * - state.userId: 用户ID（用于查找个人 LoRA）
 * 
 * 输出：
 * - state.loraModelId: 选择的 LoRA 模型ID
 * 
 * 执行流程：
 * 1. 根据渲染参数判断任务类型
 * 2. 查询数据库获取推荐的 LoRA 模型
 * 3. 如果是个人写真，优先查找用户个人 LoRA
 * 4. 返回 LoRA 模型ID
 * 
 * 实际实现：
 * - 应该查询 lora_models 表
 * - 根据 task_type_lora_mapping 表获取映射关系
 * - 支持用户个人 LoRA 的查找
 */
async function selectLoRAModel(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('🎨 节点4: 选择 LoRA 模型...');

  // 步骤1: 根据任务类型和渲染参数选择 LoRA
  // 这里简化处理，实际应该查询数据库
  let loraModelId: string | undefined;

  if (state.renderParams?.style === 'portrait') {
    // 个人写真场景：检查用户是否有个人 LoRA
    // 实际应该查询数据库: SELECT * FROM lora_models WHERE owner_id = ? AND task_type = 'portrait'
    loraModelId = 'user-portrait-lora-123';
  } else if (state.renderParams?.style === 'fashion') {
    // 时尚摄影场景：使用系统预设的时尚风格 LoRA
    // 实际应该查询数据库: SELECT * FROM lora_models WHERE category = 'fashion' AND is_default = true
    loraModelId = 'fashion-style-lora';
  }

  // 步骤2: 返回状态更新
  return { loraModelId };
}

/**
 * 节点5: 创建生成任务
 * 
 * 功能说明：
 * - 使用优化后的提示词创建实际的图像生成任务
 * - 调用生成服务（如 Replicate、ComfyUI）开始生成
 * - 返回任务ID用于后续查询状态
 * 
 * 输入：
 * - state.optimizedPrompt: 优化后的提示词（必需）
 * - state.referenceImageUrl: 参考图片URL（可选）
 * - state.loraModelId: LoRA模型ID（可选）
 * 
 * 输出：
 * - state.generationTaskId: 生成任务ID
 * - state.error: 错误信息（如果创建失败）
 * 
 * 执行流程：
 * 1. 验证必需字段（optimizedPrompt）
 * 2. 调用生成服务 API 创建任务
 * 3. 返回任务ID
 * 4. 更新状态
 * 
 * 错误处理：
 * - 如果提示词未优化，返回错误状态
 * - 如果 API 调用失败，捕获异常并返回错误
 */
async function createGenerationTask(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('🚀 节点5: 创建生成任务...');

  // 步骤1: 验证必需字段
  if (!state.optimizedPrompt) {
    return { error: '提示词未优化' };
  }

  // 步骤2: 调用生成服务创建任务
  // 实际应该调用: POST /api/v1/generation/tasks
  const task = await mockCreateGenerationTask({
    prompt: state.optimizedPrompt,
    referenceImageUrl: state.referenceImageUrl,
    loraModelId: state.loraModelId
  });

  // 步骤3: 返回状态更新
  return { generationTaskId: task.id };
}

/**
 * 节点6: 等待任务完成（模拟）
 * 
 * 功能说明：
 * - 等待图像生成任务完成
 * - 实际应该轮询任务状态或使用 WebSocket 接收通知
 * - 这里是模拟实现，直接返回结果
 * 
 * 输入：
 * - state.generationTaskId: 生成任务ID
 * 
 * 输出：
 * - state.resultImageUrl: 最终生成的图片URL
 * 
 * 执行流程：
 * 1. 获取任务ID
 * 2. 轮询任务状态（或等待 WebSocket 通知）
 * 3. 任务完成后获取结果图片URL
 * 4. 更新状态
 * 
 * 实际实现：
 * - 应该轮询: GET /api/v1/generation/tasks/{taskId}/status
 * - 或使用 WebSocket 接收实时状态更新
 * - 需要处理超时和失败情况
 */
async function waitForCompletion(state: ImageToImageState): Promise<Partial<ImageToImageState>> {
  console.log('⏳ 节点6: 等待任务完成...');

  // 模拟等待时间（实际生成需要几秒到几分钟）
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 模拟成功结果
  // 实际应该从任务状态中获取: task.output_data.media_urls[0]
  return {
    resultImageUrl: `https://example.com/generated/${state.generationTaskId}.jpg`
  };
}

// ==================== 条件路由 ====================

/**
 * 条件路由函数：检查是否需要 LoRA
 * 
 * 功能说明：
 * - 条件路由用于根据状态决定下一步执行哪个节点
 * - 返回字符串标识下一步的路径
 * 
 * 参数：
 * - state: 当前工作流状态
 * 
 * 返回值：
 * - 'use_lora': 需要使用 LoRA，继续执行相关节点
 * - 'skip_lora': 不需要 LoRA，跳过相关节点
 * 
 * 使用场景：
 * - 根据渲染参数决定是否使用 LoRA 模型
 * - 某些风格（如 portrait、fashion）需要 LoRA
 * - 其他风格可能不需要 LoRA
 */
function shouldUseLoRA(state: ImageToImageState): string {
  if (state.renderParams?.style === 'portrait' || state.renderParams?.style === 'fashion') {
    return 'use_lora';
  }
  return 'skip_lora';
}

/**
 * 条件路由函数：检查是否有错误
 * 
 * 功能说明：
 * - 检查状态中是否有错误信息
 * - 用于错误处理和流程控制
 * 
 * 参数：
 * - state: 当前工作流状态
 * 
 * 返回值：
 * - 'error': 有错误，终止工作流
 * - 'continue': 无错误，继续执行
 * 
 * 使用场景：
 * - 每个关键节点后都应该检查错误
 * - 如果出现错误，应该终止工作流并返回错误信息
 */
function checkError(state: ImageToImageState): string {
  if (state.error) {
    return 'error';
  }
  return 'continue';
}

// ==================== 构建工作流 ====================

/**
 * 创建图生图工作流
 * 
 * 功能说明：
 * - 这是工作流的构建函数，定义整个工作流的结构
 * - 使用 StateGraph 创建状态图
 * - 添加节点、定义边和条件路由
 * 
 * 工作流结构：
 * ```
 * 开始
 *   ↓
 * [节点1: 分析用户意图]
 *   ↓
 *   ├─→ [节点2: RAG召回] ──┐
 *   └─→ [节点4: 选择LoRA] ──┤
 *                            ↓
 *                    [节点3: 优化提示词]
 *                            ↓
 *                    [节点5: 创建任务]
 *                            ↓
 *                    [节点6: 等待完成]
 *                            ↓
 *                           结束
 * ```
 * 
 * 执行特点：
 * - 节点1执行后，节点2和节点4并行执行
 * - 节点2和节点4都完成后，执行节点3
 * - 节点3、5、6串行执行
 * 
 * 返回值：
 * - 编译后的工作流实例，可以调用 invoke() 执行
 */
function createImageToImageWorkflow() {
  // ========== 步骤1: 创建状态图 ==========
  // StateGraph 是 LangGraph 的核心类，用于定义工作流结构
  // 需要定义状态的结构（通过 channels）
  const workflow = new StateGraph<ImageToImageState>({
    // channels 定义状态中每个字段的合并规则
    // reducer 函数决定当多个节点更新同一字段时如何合并
    // (x, y) => y ?? x 表示：如果有新值(y)就用新值，否则保持旧值(x)
    channels: {
      userId: { reducer: (x, y) => y ?? x },
      userPrompt: { reducer: (x, y) => y ?? x },
      renderParams: { reducer: (x, y) => y ?? x },
      referenceImageUrl: { reducer: (x, y) => y ?? x },
      analyzedIntent: { reducer: (x, y) => y ?? x },
      similarCases: { reducer: (x, y) => y ?? x },
      optimizedPrompt: { reducer: (x, y) => y ?? x },
      loraModelId: { reducer: (x, y) => y ?? x },
      generationTaskId: { reducer: (x, y) => y ?? x },
      resultImageUrl: { reducer: (x, y) => y ?? x },
      error: { reducer: (x, y) => y ?? x }
    }
  });

  // ========== 步骤2: 添加节点 ==========
  // addNode() 方法将处理函数注册为工作流节点
  // 第一个参数是节点名称，第二个参数是处理函数
  workflow.addNode('analyzeIntent', analyzeIntent);
  workflow.addNode('retrieveSimilar', retrieveSimilarCases);
  workflow.addNode('optimizePrompt', optimizePrompt);
  workflow.addNode('selectLoRA', selectLoRAModel);
  workflow.addNode('createTask', createGenerationTask);
  workflow.addNode('waitForCompletion', waitForCompletion);

  // ========== 步骤3: 定义边（连接关系）==========
  
  // 设置入口点：工作流从哪个节点开始执行
  workflow.setEntryPoint('analyzeIntent');
  
  // 添加普通边：节点1执行后，并行执行节点2和节点4
  // addEdge() 创建无条件边，节点执行完成后自动进入下一个节点
  workflow.addEdge('analyzeIntent', 'retrieveSimilar');
  workflow.addEdge('analyzeIntent', 'selectLoRA');
  
  // 添加条件边：节点2执行后，根据状态决定下一步
  // addConditionalEdges() 创建条件边，需要提供：
  // 1. 源节点名称
  // 2. 条件函数（根据状态返回路径标识）
  // 3. 路径映射（标识 -> 目标节点）
  workflow.addConditionalEdges(
    'retrieveSimilar',  // 源节点
    checkError,         // 条件函数
    {
      continue: 'optimizePrompt',  // 如果 checkError 返回 'continue'，执行 optimizePrompt
      error: END                  // 如果返回 'error'，结束工作流
    }
  );
  
  // 节点4的条件边（与节点2类似）
  workflow.addConditionalEdges(
    'selectLoRA',
    checkError,
    {
      continue: 'optimizePrompt',
      error: END
    }
  );

  // 节点3执行后，无条件进入节点5
  workflow.addEdge('optimizePrompt', 'createTask');
  
  // 节点5执行后，检查错误并决定下一步
  workflow.addConditionalEdges(
    'createTask',
    checkError,
    {
      continue: 'waitForCompletion',
      error: END
    }
  );

  // 节点6执行后，工作流结束
  workflow.addEdge('waitForCompletion', END);

  // ========== 步骤4: 编译工作流 ==========
  // compile() 方法将工作流定义编译为可执行的工作流实例
  return workflow.compile();
}

// ==================== 演示函数 ====================

/**
 * 运行工作流演示
 * 
 * 功能说明：
 * - 创建并执行完整的工作流
 * - 展示工作流的执行过程和最终结果
 * 
 * 执行流程：
 * 1. 创建工作流实例
 * 2. 准备初始状态（输入数据）
 * 3. 调用 invoke() 执行工作流
 * 4. 展示最终状态
 * 
 * 学习要点：
 * - 如何创建工作流实例
 * - 如何准备输入数据
 * - 如何执行工作流并获取结果
 */
async function runWorkflowDemo() {
  console.log('\n=== LangGraph 工作流演示 ===\n');
  console.log('工作流结构:');
  console.log('  开始');
  console.log('    ↓');
  console.log('  [节点1: 分析用户意图]');
  console.log('    ↓');
  console.log('    ├─→ [节点2: RAG召回] ──┐');
  console.log('    └─→ [节点4: 选择LoRA] ──┤');
  console.log('                            ↓');
  console.log('                    [节点3: 优化提示词]');
  console.log('                            ↓');
  console.log('                    [节点5: 创建任务]');
  console.log('                            ↓');
  console.log('                    [节点6: 等待完成]');
  console.log('                            ↓');
  console.log('                           结束\n');
  console.log('='.repeat(50));
  console.log('开始执行工作流...\n');

  // 步骤1: 创建工作流实例
  const workflow = createImageToImageWorkflow();

  // 步骤2: 准备初始状态（输入数据）
  // 这些数据会作为工作流的输入，传递给第一个节点
  const initialState: ImageToImageState = {
    userId: 'user-123',
    userPrompt: 'portrait photography',
    renderParams: {
      scene: 'close-up',      // 景别：近景
      lens: 'standard',       // 镜头：标准镜头
      lighting: 'natural',    // 光线：自然光
      style: 'portrait'        // 风格：人像
    },
    referenceImageUrl: 'https://example.com/reference.jpg'
  };

  // 步骤3: 执行工作流
  // invoke() 方法会执行整个工作流，直到结束或遇到错误
  // 返回最终的状态对象
  const result = await workflow.invoke(initialState);

  // 步骤4: 展示结果
  console.log('\n' + '='.repeat(50));
  console.log('✅ 工作流执行完成！\n');
  console.log('最终状态:');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n--- 演示完成 ---\n');
}

// ==================== 主函数 ====================

/**
 * 主函数：执行演示
 * 
 * 功能说明：
 * - 统一执行演示并处理错误
 * - 提供清晰的执行反馈
 */
async function main() {
  try {
    await runWorkflowDemo();
  } catch (error) {
    console.error('\n❌ 演示失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// ==================== 模块导出 ====================

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main();
}

// 导出工作流相关函数和类型，方便其他文件使用
export {
  createImageToImageWorkflow,
  ImageToImageState,
  runWorkflowDemo
};
