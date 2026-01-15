/**
 * Graph核心服务
 * 处理图片生成提示词生成、图片生成等核心逻辑
 */

import type { ProviderType } from '../providers/types';
import { MODEL_MAP } from '../../routes/text';
import { getGraphRulesForType, getGraphParamsForType } from './graphconfigs';
import type { PhotographParams, DesignParams, PaintingParams } from './type';
import * as nanoBanana from './nano-banana';
import * as seedream4 from './seedream-4';
import { KnowledgeService } from '../knowledge/knowledge-service';
import type { KnowledgeSearchResult, KnowledgeHybridSearchResult } from '@mxmai/mxmdata';
import { generateDefaultPortraitKnowledge } from './graphconfigs/photograph/portrait';
import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  type ReferenceImage,
  convertLegacyReferenceImage,
  buildReferenceImagePrompt,
  processReferenceImages,
  isUrl,
  isBase64,
  compressImage,
  extractBase64FromDataUri,
} from './reference-image';

type OutputLanguage = 'zh' | 'en';

function detectOutputLanguage(userPrompt: string): OutputLanguage {
  // 简单规则：包含中文字符就输出中文，否则输出英文
  return /[\u4e00-\u9fff]/.test(userPrompt) ? 'zh' : 'en';
}

/**
 * 生成文本（调用 LLM）- 同步模式
 */
async function generateText(
  modelName: string,
  prompt: string,
  provider?: ProviderType
): Promise<string> {
  const model = MODEL_MAP[modelName];
  if (!model) {
    throw new Error(`模型 "${modelName}" 不存在`);
  }

  const result = await model.generate({
    prompt,
    outputFormat: 'json',
  }, provider);

  if (!result.text) {
    throw new Error('LLM 生成结果为空');
  }

  return result.text;
}

/**
 * 根据type提取相关业务参数
 */
function extractBusinessParams(
  params: PhotographParams | DesignParams | PaintingParams,
  graphType: string,
  type: string
): Record<string, any> {
  const businessParams: Record<string, any> = {};
  const paramList = getGraphParamsForType(graphType, type);

  for (const paramName of paramList) {
    if (params[paramName] !== undefined && params[paramName] !== null && params[paramName] !== '') {
      businessParams[paramName] = params[paramName];
    }
  }

  return businessParams;
}

/**
 * 构建提示词生成请求
 */
function buildPromptGenerationRequest(
  graphType: string,
  type: string,
  userPrompt: string,
  businessParams: Record<string, any>,
  knowledgeContext: string,
  outputLanguage: OutputLanguage
): string {
  // 获取特定类型的规则（规则中已包含完整的提示词生成要求）
  const rules = getGraphRulesForType(graphType, type);

  // 构建业务参数描述
  const businessParamsDesc = Object.entries(businessParams)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  // 从规则开始构建提示词（规则中已包含所有要求）
  let prompt = rules;

  // 添加知识库内容（如果有）
  if (knowledgeContext) {
    prompt += `\n\n【知识库内容】\n${knowledgeContext}\n`;
    console.log(`[GraphService] 已添加知识库内容到提示词生成请求，长度: ${knowledgeContext.length} 字符`);
  } else {
    console.log('[GraphService] 未添加知识库内容（knowledgeContext 为空）');
  }

  // 添加用户选择的业务参数（如果有）
  if (businessParamsDesc) {
    prompt += `\n\n【用户选择的业务参数】\n${businessParamsDesc}\n`;
  }

  // 添加用户原始需求
  prompt += `\n\n【用户需求】\n${userPrompt}\n`;

  // 添加简洁的输出指令（规则中已有详细要求，这里只补充输出语言与格式要求，避免与 rules 冲突）
  const languageHint = outputLanguage === 'zh' ? '中文' : '英文';
  prompt += `\n\n【输出要求】\n- 输出语言：${languageHint}\n- 只输出最终图片生成提示词本身，不要包含其他说明文字：`;

  return prompt;
}

/**
 * 知识库召回结果元数据
 */
export interface KnowledgeRecallMetadata {
  source: 'knowledge_base' | 'default';
  totalChunks: number;
  avgSimilarity: number | null;
  maxSimilarity: number | null;
  minSimilarity: number | null;
  chunks: Array<{
    title: string;
    similarity: number | null;
    contentPreview: string; // 内容预览（前100字符）
  }>;
  queries: Array<{
    query: string;
    type: string;
    count: number;
  }>;
}

/**
 * 获取 admin 用户 ID（用于访问系统知识库）
 */
async function getAdminUserId(): Promise<string | undefined> {
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    
    // 优先查找 username='admin' 的用户
    try {
      const adminUser = await userRepo.findByUsername('admin');
      if (adminUser && adminUser.role === 'admin') {
        return adminUser.id;
      }
    } catch (error: any) {
      if (error.code !== 'NOT_FOUND' && error.message !== 'NOT_FOUND') {
        throw error;
      }
    }
    
    // 如果找不到，尝试查找 role='admin' 的用户
    const result = await userRepo.findAll({
      page: 1,
      limit: 1,
      filters: {
        role: 'admin',
      },
    });
    
    if (result.users.length > 0 && result.users[0].role === 'admin') {
      return result.users[0].id;
    }
    
    return undefined;
  } catch (error) {
    console.error('[GraphService] 获取 admin 用户 ID 失败:', error);
    return undefined;
  }
}

/**
 * 根据 graphType 和 type 动态生成系统知识库名称
 * 
 * 命名规则: graph-{graphType}-{type}
 * 
 * 特殊处理:
 *   - painting 的 'conceptArt' -> 'concept-art' (驼峰转连字符)
 *   - design 的 '3d' -> '3d' (保持原样，已经是连字符格式)
 *   - 其他类型保持原样
 * 
 * 示例:
 *   - photograph + portrait -> graph-photograph-portrait
 *   - photograph + landscape -> graph-photograph-landscape
 *   - design + 3d -> graph-design-3d
 *   - painting + conceptArt -> graph-painting-concept-art
 *   - painting + illustration -> graph-painting-illustration
 */
function getSystemKnowledgeBaseName(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): string {
  // 处理特殊类型名称转换
  let normalizedType = type;
  
  // painting 的 conceptArt 需要转换为 concept-art (驼峰转连字符)
  if (graphType === 'painting' && type === 'conceptArt') {
    normalizedType = 'concept-art';
  }
  // design 的 '3d' 保持原样（已经是连字符格式）
  // 其他类型保持原样
  
  const kbName = `graph-${graphType}-${normalizedType}`;
  return kbName;
}

/**
 * 从系统知识库检索人像摄影相关内容
 * 根据业务参数构建查询，从对应的系统知识库中检索
 * 返回格式化的知识库内容和召回元数据
 */
export async function retrieveSystemKnowledgeForPortrait(
  params: PhotographParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, style, tone, lighting, environment, pose, makeup } = params;
  const knowledgeService = new KnowledgeService();
  
  // 动态生成知识库名称：根据 graphType 和 type 自动选择对应的系统知识库
  // 例如：photograph + portrait -> graph-photograph-portrait
  const knowledgeBaseName = getSystemKnowledgeBaseName('photograph', params.type || 'portrait');
  console.log(`[GraphService] 选择系统知识库: ${knowledgeBaseName} (graphType=photograph, type=${params.type || 'portrait'})`);
  
  const allChunks: (KnowledgeSearchResult | KnowledgeHybridSearchResult)[] = [];

  // 可配置的召回参数（通过环境变量设置）
  const recallLimit = parseInt(process.env.GRAPH_KB_RECALL_LIMIT || '3', 10); // 每个查询最多召回数量，默认3条
  const similarityThreshold = parseFloat(process.env.GRAPH_KB_SIMILARITY_THRESHOLD || '0.6'); // 相似度阈值，默认0.6（降低到0.6以提高召回率）
  const maxTotalChunks = parseInt(process.env.GRAPH_KB_MAX_TOTAL_CHUNKS || '10', 10); // 最多保留的总结果数，默认10条

  // 系统知识库是私密的，需要 admin userId 才能访问
  // 自动获取 admin userId（如果传入的 userId 不是 admin）
  let adminUserId: string | undefined = userId;
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    if (userId) {
      const user = await userRepo.findById(userId);
      if (user && user.role === 'admin') {
        adminUserId = userId; // 当前用户就是 admin
      } else {
        adminUserId = await getAdminUserId(); // 获取 admin userId
      }
    } else {
      adminUserId = await getAdminUserId(); // 获取 admin userId
    }
  } catch (error) {
    console.warn('[GraphService] 无法获取 admin 用户 ID，将尝试使用传入的 userId:', error);
  }

  console.log(`[GraphService] 知识库召回配置: limit=${recallLimit}, threshold=${similarityThreshold}, maxTotal=${maxTotalChunks}`);
  console.log(`[GraphService] 使用 userId 访问系统知识库: ${adminUserId || userId || 'anonymous'}`);

  let query1Text = '';
  let query2Text = '';
  let query1Count = 0;
  let query2Count = 0;

  try {
    // 查询1: 构图、机位、光线、风格、摄影师相关内容
    // 查询词: style + tone + lighting + prompt
    const query1Parts: string[] = [];
    if (style) query1Parts.push(style);
    if (tone) query1Parts.push(tone);
    if (lighting) query1Parts.push(lighting);
    if (userPrompt) query1Parts.push(userPrompt);

    if (query1Parts.length > 0) {
      query1Text = query1Parts.join(' ');
      console.log(`[GraphService] 知识库查询1 (构图/光线/风格/摄影师): "${query1Text}"`);
      console.log(`[GraphService] 查询1参数: knowledgeBaseName=${knowledgeBaseName}, searchType=hybrid, limit=${recallLimit}, threshold=${similarityThreshold}, userId=${adminUserId || userId || 'anonymous'}`);
      
      const searchUserId = adminUserId || userId || undefined;
      const results1 = await knowledgeService.search({
        knowledgeBaseName,
        query: query1Text,
        searchType: 'hybrid',
        limit: recallLimit,
        threshold: similarityThreshold,
        userId: searchUserId, // 系统知识库是私密的，使用 admin userId 才能访问
      });
      
      query1Count = results1.length;
      allChunks.push(...results1);
      console.log(`[GraphService] 查询1完成: 召回 ${results1.length} 条结果`);
      if (results1.length > 0) {
        const firstResult = results1[0];
        const sim = 'similarity' in firstResult ? firstResult.similarity : ('combined_score' in firstResult ? (firstResult as any).combined_score : null);
        console.log(`[GraphService] 查询1第一条结果: title="${firstResult.title || 'N/A'}", similarity=${sim?.toFixed(3) || 'N/A'}`);
      }
    }

    // 查询2: 背景、环境、姿势、妆容相关内容
    // 查询词: prompt + environment + pose + makeup
    const query2Parts: string[] = [];
    if (userPrompt) query2Parts.push(userPrompt);
    if (environment) query2Parts.push(environment);
    if (pose) query2Parts.push(pose);
    if (makeup) query2Parts.push(makeup);

    if (query2Parts.length > 0) {
      query2Text = query2Parts.join(' ');
      console.log(`[GraphService] 知识库查询2 (背景/环境/姿势/妆容): "${query2Text}"`);
      console.log(`[GraphService] 查询2参数: knowledgeBaseName=${knowledgeBaseName}, searchType=hybrid, limit=${recallLimit}, threshold=${similarityThreshold}, userId=${adminUserId || userId || 'anonymous'}`);
      
      const searchUserId = adminUserId || userId || undefined;
      const results2 = await knowledgeService.search({
        knowledgeBaseName,
        query: query2Text,
        searchType: 'hybrid',
        limit: recallLimit,
        threshold: similarityThreshold,
        userId: searchUserId, // 系统知识库是私密的，使用 admin userId 才能访问
      });
      
      query2Count = results2.length;
      allChunks.push(...results2);
      console.log(`[GraphService] 查询2完成: 召回 ${results2.length} 条结果`);
      if (results2.length > 0) {
        const firstResult = results2[0];
        const sim = 'similarity' in firstResult ? firstResult.similarity : ('combined_score' in firstResult ? (firstResult as any).combined_score : null);
        console.log(`[GraphService] 查询2第一条结果: title="${firstResult.title || 'N/A'}", similarity=${sim?.toFixed(3) || 'N/A'}`);
      }
    }

    console.log(`[GraphService] 查询汇总: 查询1召回${query1Count}条, 查询2召回${query2Count}条, 总计${allChunks.length}条`);
    
    // 去重（基于 content 或 id）
    const uniqueChunks = Array.from(
      new Map(allChunks.map(chunk => [chunk.id || chunk.content.substring(0, 100), chunk])).values()
    );
    console.log(`[GraphService] 去重后: ${uniqueChunks.length} 条（去除了 ${allChunks.length - uniqueChunks.length} 条重复）`);

    // 按相似度排序（如果有 similarity 字段）
    const sortedChunks = uniqueChunks.sort((a, b) => {
      const simA = 'similarity' in a ? (a.similarity || 0) : ('combined_score' in a ? (a as KnowledgeHybridSearchResult).combined_score || 0 : 0);
      const simB = 'similarity' in b ? (b.similarity || 0) : ('combined_score' in b ? (b as KnowledgeHybridSearchResult).combined_score || 0 : 0);
      return simB - simA;
    });

    // 限制最多保留的结果数
    const topChunks = sortedChunks.slice(0, maxTotalChunks);
    console.log(`[GraphService] 最终保留: ${topChunks.length} 条（maxTotal=${maxTotalChunks}）`);

    // 格式化知识库内容
    if (topChunks.length === 0) {
      console.log('[GraphService] 知识库未召回任何相关内容，根据用户参数生成默认内容');
      const defaultContent = generateDefaultPortraitKnowledge(params);
      return {
        content: defaultContent,
        metadata: {
          source: 'default',
          totalChunks: 0,
          avgSimilarity: null,
          maxSimilarity: null,
          minSimilarity: null,
          chunks: [],
          queries: [],
        },
      };
    }

    // 提取相似度信息
    const similarities: number[] = [];
    const chunksMetadata: KnowledgeRecallMetadata['chunks'] = [];

    const formattedContext = topChunks
      .map((chunk, index) => {
        const title = chunk.title || `知识片段 ${index + 1}`;
        const content = chunk.content || '';
        let similarity: number | null = null;
        if ('similarity' in chunk && chunk.similarity !== undefined) {
          similarity = chunk.similarity;
        } else if ('combined_score' in chunk) {
          const hybridChunk = chunk as KnowledgeHybridSearchResult;
          similarity = hybridChunk.combined_score ?? null;
        }
        
        if (similarity !== null) {
          similarities.push(similarity);
        }
        
        // 收集元数据
        chunksMetadata.push({
          title,
          similarity,
          contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        });
        
        const similarityText = similarity !== null ? ` (相似度: ${(similarity * 100).toFixed(1)}%)` : '';
        return `【${title}${similarityText}】\n${content}`;
      })
      .join('\n\n');

    // 构建召回元数据
    const metadata: KnowledgeRecallMetadata = {
      source: 'knowledge_base',
      totalChunks: topChunks.length,
      avgSimilarity: similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : null,
      maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      minSimilarity: similarities.length > 0 ? Math.min(...similarities) : null,
      chunks: chunksMetadata,
      queries: [
        ...(query1Text ? [{
          query: query1Text,
          type: '构图/光线/风格/摄影师',
          count: query1Count,
        }] : []),
        ...(query2Text ? [{
          query: query2Text,
          type: '背景/环境/姿势/妆容',
          count: query2Count,
        }] : []),
      ],
    };

    console.log(`[GraphService] 知识库内容格式化完成，共 ${topChunks.length} 条，总长度: ${formattedContext.length} 字符`);
    console.log(`[GraphService] 召回元数据: 平均相似度=${metadata.avgSimilarity?.toFixed(3) || 'N/A'}, 最高=${metadata.maxSimilarity?.toFixed(3) || 'N/A'}, 最低=${metadata.minSimilarity?.toFixed(3) || 'N/A'}`);
    console.log(`[GraphService] 召回查询详情:`);
    metadata.queries.forEach((q, idx) => {
      console.log(`  [查询${idx + 1}] 类型: ${q.type}, 查询词: "${q.query}", 召回数量: ${q.count}`);
    });
    console.log(`[GraphService] ===== 知识库召回流程完成 =====\n`);
    
    return { content: formattedContext, metadata };
  } catch (error) {
    console.error('[GraphService] 知识库检索异常:', error);
    // 如果知识库不存在或其他错误，根据用户参数生成默认内容，不影响主流程
    console.log('[GraphService] 根据用户参数生成默认内容作为fallback');
    const defaultContent = generateDefaultPortraitKnowledge(params);
    return {
      content: defaultContent,
      metadata: {
        source: 'default',
        totalChunks: 0,
        avgSimilarity: null,
        maxSimilarity: null,
        minSimilarity: null,
        chunks: [],
        queries: [],
      },
    };
  }
}

/**
 * 生成Graph提示词（返回提示词和召回元数据）
 */
export async function generateGraphPrompt(
  graphType: 'photograph' | 'design' | 'painting',
  params: PhotographParams | DesignParams | PaintingParams,
  userId?: string,
  provider?: ProviderType
): Promise<{ prompt: string; knowledgeRecallMetadata?: KnowledgeRecallMetadata }> {
  const { type, prompt: userPrompt } = params;

  // 1. 提取业务参数
  const businessParams = extractBusinessParams(params, graphType, type);

  // 2. 检索知识库内容（系统内部）
  // 根据 graphType 和 type 动态选择对应的系统知识库
  let knowledgeContext = '';
  let knowledgeRecallMetadata: KnowledgeRecallMetadata | null = null;
  
  // 目前只实现了 photograph/portrait 的知识库召回
  // 未来可以扩展支持其他类型（landscape, cinematic, design-3d, painting-illustration 等）
  if (graphType === 'photograph' && type === 'portrait') {
    try {
      const expectedKBName = getSystemKnowledgeBaseName(graphType, type);
      console.log(`[GraphService] 开始知识库召回 (graphType=${graphType}, type=${type}, 知识库=${expectedKBName})`);
      
      const recallResult = await retrieveSystemKnowledgeForPortrait(
        params as PhotographParams,
        userId
      );
      knowledgeContext = recallResult.content;
      knowledgeRecallMetadata = recallResult.metadata;
      console.log(`[GraphService] 知识库召回完成，内容长度: ${knowledgeContext.length} 字符`);
    } catch (error) {
      console.error('[GraphService] 知识库召回失败:', error);
      // 知识库召回失败不影响主流程，继续使用空的 knowledgeContext
      knowledgeContext = '';
      knowledgeRecallMetadata = null;
    }
  } else {
    // 其他类型暂未实现知识库召回，未来可以扩展
    console.log(`[GraphService] 当前类型 (graphType=${graphType}, type=${type}) 暂未实现知识库召回，跳过`);
  }

  // 2.5 根据用户输入语言决定输出语言（中文/英文）
  const outputLanguage = detectOutputLanguage(userPrompt || '');

  // 2.6 处理参考图（但不立即拼装到提示词，等大模型生成后再拼装）
  let processedReferenceImages: ReferenceImage[] = [];
  let referenceImagePrompt = '';
  
  if (params.referenceImage) {
    // 转换旧格式（string | string[]）为新格式（ReferenceImage[]）
    // 检查是否为旧格式：string 或 string[]（不是 ReferenceImage[]）
    if (typeof params.referenceImage === 'string') {
      // 旧格式：单个字符串
      processedReferenceImages = convertLegacyReferenceImage(params.referenceImage);
    } else if (Array.isArray(params.referenceImage)) {
      // 判断是 string[] 还是 ReferenceImage[]
      if (params.referenceImage.length > 0 && typeof params.referenceImage[0] === 'string') {
        // 旧格式：字符串数组
        processedReferenceImages = convertLegacyReferenceImage(params.referenceImage as string[]);
      } else {
        // 新格式：ReferenceImage[]
        processedReferenceImages = params.referenceImage as ReferenceImage[];
      }
    } else {
      // 新格式：ReferenceImage[]（虽然类型定义中 referenceImage 不应该是对象，但为了安全起见）
      processedReferenceImages = [params.referenceImage as ReferenceImage];
    }
    
    // 将处理后的参考图保存回 params，供后续 generateGraphImage 使用
    (params as any).referenceImage = processedReferenceImages;
    
    // 根据参考图类型生成提示词补充（但不立即拼装，等大模型生成后再拼装）
    if (processedReferenceImages.length > 0) {
      referenceImagePrompt = buildReferenceImagePrompt(processedReferenceImages, outputLanguage);
      console.log(`[GraphService] 参考图提示词补充 (${processedReferenceImages.length} 张):`, referenceImagePrompt);
    }
  }

  // 2.7 针对特定类型做结构化用户需求拼装（以 photograph / portrait 为先行案例）
  // 注意：这里不包含参考图提示词，参考图提示词会在后面拼装到大模型生成的提示词前面
  let effectiveUserPrompt = userPrompt;
  if (graphType === 'photograph' && type === 'portrait') {
    // 规则与结构化文案封装在 graphconfigs/photograph/portrait
    const { buildPortraitUserPrompt } = require('./graphconfigs/photograph/portrait');
    effectiveUserPrompt = buildPortraitUserPrompt(params as PhotographParams, outputLanguage);
  }

  // 3. 构建提示词生成请求
  const promptGenerationRequest = buildPromptGenerationRequest(
    graphType,
    type,
    effectiveUserPrompt,
    businessParams,
    knowledgeContext,
    outputLanguage
  );

  // 添加调试日志，方便查看实际发送给大模型的提示词
  const rules = getGraphRulesForType(graphType, type);
  console.log(
    `[GraphService] 提示词生成开始 (graphType: ${graphType}, type: ${type}, outputLanguage: ${outputLanguage}, userId: ${userId || 'anonymous'})`
  );
  console.log(`[GraphService] 使用规则前缀: ${rules.substring(0, 180)}${rules.length > 180 ? '...' : ''}`);
  console.log(`[GraphService] 业务参数:`, businessParams);
  console.log(`[GraphService] 提示词生成请求前缀: ${promptGenerationRequest.substring(0, 500)}${promptGenerationRequest.length > 500 ? '...' : ''}`);

  // 4. 调用大模型生成提示词
  // 使用默认的文本模型（可以通过环境变量配置）
  // 默认使用 gemini-3-pro，走 DeerAPI
  const textModelName = process.env.GRAPH_PROMPT_MODEL || 'gemini-3-pro';
  // 如果未指定 provider，默认使用 deerapi
  const finalProvider = provider || 'deer';
  
  console.log(`[GraphService] 使用模型: ${textModelName}, Provider: ${finalProvider}`);
  
  const generatedPrompt = await generateText(textModelName, promptGenerationRequest, finalProvider);

  console.log(`[GraphService] 生成的提示词前缀: ${generatedPrompt.substring(0, 220)}${generatedPrompt.length > 220 ? '...' : ''}`);

  // 清理生成的提示词（移除可能的引号、多余的空格等）
  const cleanedPrompt = generatedPrompt.trim().replace(/^["']|["']$/g, '');

  // 2.8 如果有参考图，将参考图提示词拼装到大模型生成的提示词前面
  let finalPrompt = cleanedPrompt;
  if (referenceImagePrompt) {
    // 根据语言选择不同的拼装格式
    if (outputLanguage === 'en') {
      finalPrompt = `${referenceImagePrompt}\n\nGenerate: ${cleanedPrompt}`;
    } else {
      finalPrompt = `${referenceImagePrompt}\n\n生成：${cleanedPrompt}`;
    }
    console.log(`[GraphService] 参考图提示词已拼装到最终提示词前面`);
  }

  // 返回最终拼装后的提示词和召回元数据（如果存在）
  return {
    prompt: finalPrompt,
    knowledgeRecallMetadata: knowledgeRecallMetadata || undefined,
  };
}

/**
 * 生成Graph图片
 */
export async function generateGraphImage(
  graphType: 'photograph' | 'design' | 'painting',
  params: PhotographParams | DesignParams | PaintingParams,
  generatedPrompt: string,
  provider?: ProviderType
): Promise<{ image_urls: string[]; modelName: string }> {
  const { quality = 'high', referenceImage, aspect_ratio } = params;

  // 根据quality选择模型
  const modelName = quality === 'high' ? 'nano-banana' : 'seedream-4';

  // 准备图片参数
  let imageParams: any = {
    prompt: generatedPrompt,
  };
  
  // 根据模型类型处理 aspect_ratio
  if (modelName === 'seedream-4') {
    // seedream-4 不支持 aspect_ratio 参数，只支持 size ('1k', '2k', '4k')
    // 根据文档，size 是必需参数，默认使用 2k
    // 注意：seedream-4 的 size 参数会决定输出分辨率，但不直接控制宽高比
    // 我们需要在 prompt 中明确说明宽高比要求
    if (!params.size) {
      imageParams.size = '2k'; // 默认 2k
    } else {
      // 将 '1K'/'2K'/'4K' 转换为 '1k'/'2k'/'4k'（DeerAPI 要求小写）
      const sizeValue = typeof params.size === 'string' ? params.size.toLowerCase() : params.size;
      imageParams.size = sizeValue;
    }
    
    // 在 prompt 中添加宽高比说明（如果提供了 aspect_ratio）
    // 这样模型可以根据 prompt 中的宽高比要求生成对应比例的图片
    if (aspect_ratio) {
      const aspectRatioMap: Record<string, string> = {
        '16:9': '16:9 宽屏横向比例',
        '9:16': '9:16 竖屏纵向比例',
        '1:1': '1:1 正方形',
        '4:3': '4:3 标准横向比例',
        '3:4': '3:4 标准纵向比例',
      };
      const aspectRatioText = aspectRatioMap[aspect_ratio] || `${aspect_ratio} 比例`;
      
      // 检查 prompt 中是否已经包含宽高比信息
      const promptLower = generatedPrompt.toLowerCase();
      const hasAspectInfo = promptLower.includes('aspect') || 
                           promptLower.includes('ratio') ||
                           promptLower.includes('比例') ||
                           promptLower.includes('宽高比') ||
                           promptLower.includes('16:9') ||
                           promptLower.includes('9:16') ||
                           promptLower.includes('1:1');
      
      if (!hasAspectInfo) {
        // 在 prompt 末尾添加宽高比说明
        imageParams.prompt = `${generatedPrompt}\n\n宽高比要求: ${aspectRatioText}`;
        console.log(`[GraphService] seedream-4 不支持 aspect_ratio 参数，已在 prompt 中添加宽高比说明: ${aspectRatioText}`);
      } else {
        imageParams.prompt = generatedPrompt;
        console.log(`[GraphService] prompt 中已包含宽高比信息，无需重复添加`);
      }
    } else {
      imageParams.prompt = generatedPrompt;
    }
  } else {
    // nano-banana 支持 aspect_ratio 参数
    imageParams.aspect_ratio = aspect_ratio;
    imageParams.prompt = generatedPrompt;
  }

  // 处理参考图（支持新格式和旧格式）
  if (referenceImage) {
    let processedReferenceImages: ReferenceImage[] = [];
    
    // 转换旧格式（string | string[]）为新格式（ReferenceImage[]）
    // 检查是否为旧格式：string 或 string[]（不是 ReferenceImage[]）
    if (typeof referenceImage === 'string') {
      // 旧格式：单个字符串
      processedReferenceImages = convertLegacyReferenceImage(referenceImage);
    } else if (Array.isArray(referenceImage)) {
      // 判断是 string[] 还是 ReferenceImage[]
      if (referenceImage.length === 0) {
        // 空数组
        processedReferenceImages = [];
      } else if (typeof referenceImage[0] === 'string') {
        // 旧格式：字符串数组
        processedReferenceImages = convertLegacyReferenceImage(referenceImage as string[]);
      } else {
        // 新格式：ReferenceImage[]
        processedReferenceImages = referenceImage as ReferenceImage[];
      }
    } else {
      // 不应该到达这里，但为了类型安全
      processedReferenceImages = [];
    }
    
    if (processedReferenceImages.length > 0) {
      // 处理参考图，转换为模型可接受的格式
      const { urls, base64s } = processReferenceImages(processedReferenceImages, modelName);
      
      console.log(`[GraphService] 处理参考图: ${processedReferenceImages.length} 张, URLs: ${urls.length}, Base64s: ${base64s.length}`);
      
      if (modelName === 'nano-banana') {
        // nano-banana 支持 image_urls 和 image_base64s
        if (urls.length > 0) {
          imageParams.image_urls = urls;
        }
        if (base64s.length > 0) {
          imageParams.image_base64s = base64s;
        }
        // 如果只有一张图片，也可以使用 image 参数
        if (urls.length === 1 && base64s.length === 0) {
          imageParams.image = urls[0];
        } else if (base64s.length === 1 && urls.length === 0) {
          // base64 需要保持 data URI 格式
          const ref = processedReferenceImages[0];
          imageParams.image = ref.content.startsWith('data:') ? ref.content : `data:image/jpeg;base64,${base64s[0]}`;
        }
      } else {
        // seedream-4 使用 image_input 数组（支持 URL 和 base64）
        const imageInput: string[] = [];
        imageInput.push(...urls);
        
        // seedream-4 需要完整的 data URI 格式
        // 对于 Base64 图片，如果太大则自动压缩
        console.log(`[GraphService] 处理 seedream-4 参考图，开始压缩大图片...`);
        for (const ref of processedReferenceImages) {
          if (isUrl(ref.content)) {
            // URL 已经在 urls 数组中，跳过
            continue;
          } else if (isBase64(ref.content)) {
            let finalContent = ref.content;
            
            // 检查图片大小，如果超过 1MB 则压缩（更激进的压缩策略）
            const base64Data = extractBase64FromDataUri(ref.content);
            const sizeMB = base64Data.length / 1024 / 1024;
            
            if (sizeMB > 1) {
              console.log(`[GraphService] 参考图 ${ref.type} 大小 ${sizeMB.toFixed(2)} MB，超过 1MB，开始压缩...`);
              // 使用更激进的压缩：目标 1MB，最大尺寸 1536x1536，质量 80
              const compressed = await compressImage(ref.content, 1, 1536, 1536, 80);
              if (compressed.wasCompressed) {
                finalContent = compressed.compressed;
                const compressedSizeMB = compressed.compressedSizeKB / 1024;
                console.log(`[GraphService] 参考图 ${ref.type} 压缩完成: ${compressed.originalSizeKB.toFixed(2)} KB → ${compressed.compressedSizeKB.toFixed(2)} KB (${compressedSizeMB.toFixed(2)} MB)`);
                
                // 如果压缩后仍然超过 1.5MB，再次压缩
                if (compressedSizeMB > 1.5) {
                  console.log(`[GraphService] 参考图 ${ref.type} 压缩后仍然较大 (${compressedSizeMB.toFixed(2)} MB)，进行二次压缩...`);
                  const recompressed = await compressImage(finalContent, 1, 1280, 1280, 75);
                  if (recompressed.wasCompressed) {
                    finalContent = recompressed.compressed;
                    console.log(`[GraphService] 参考图 ${ref.type} 二次压缩完成: ${recompressed.originalSizeKB.toFixed(2)} KB → ${recompressed.compressedSizeKB.toFixed(2)} KB`);
                  }
                }
              } else if (compressed.error) {
                console.warn(`[GraphService] 参考图 ${ref.type} 压缩失败: ${compressed.error}，使用原图`);
              }
            }
            
            // 确保是 data URI 格式
            if (finalContent.startsWith('data:')) {
              imageInput.push(finalContent);
            } else {
              // 如果不是 data URI，默认使用 jpeg 格式
              imageInput.push(`data:image/jpeg;base64,${finalContent}`);
            }
          }
        }
        
        // 根据文档，seedream-4 使用 'image' 参数（必需参数）
        // 注意：如果 imageInput 为空，seedream-4 可能不支持无参考图生成，需要检查文档
        if (imageInput.length > 0) {
          imageParams.image = imageInput;
        }
        // 同时设置 image_input 以保持兼容性
        imageParams.image_input = imageInput;
        const totalSize = imageInput.reduce((sum: number, img: string): number => sum + img.length, 0);
        const totalSizeMB = totalSize / 1024 / 1024;
        console.log(`[GraphService] seedream-4 image_input 准备完成: ${imageInput.length} 张图片，总大小: ${totalSizeMB.toFixed(2)} MB`);
        if (totalSizeMB > 5) {
          console.warn(`[GraphService] 警告：参考图总大小仍然较大 (${totalSizeMB.toFixed(2)} MB)，可能导致 API 请求失败。建议使用 URL 而不是 Base64，或先上传到 MinIO。`);
        }
      }
    }
  }

  // 调用对应的模型生成图片
  console.log(`[GraphService] 准备调用模型 ${modelName}，参数大小: ${JSON.stringify(imageParams).length} 字符`);
  if (imageParams.image_input) {
    const inputSize = (imageParams.image_input as string[]).reduce((sum: number, img: string): number => sum + img.length, 0);
    console.log(`[GraphService] image_input 数量: ${imageParams.image_input.length}，总大小: ${(inputSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  try {
    if (modelName === 'nano-banana') {
      console.log(`[GraphService] 调用 nano-banana 生成图片...`);
      const result = await nanoBanana.generate(imageParams, provider);
      console.log(`[GraphService] nano-banana 生成完成，图片数量: ${result.image_urls.length}`);
      return { image_urls: result.image_urls, modelName };
    } else {
      console.log(`[GraphService] 调用 seedream-4 生成图片...`);
      const result = await seedream4.generate(imageParams, provider);
      console.log(`[GraphService] seedream-4 生成完成，图片数量: ${result.image_urls.length}`);
      return { image_urls: result.image_urls, modelName };
    }
  } catch (error) {
    console.error(`[GraphService] 模型 ${modelName} 生成失败:`, error);
    throw error;
  }
}

// 注意：extractBase64FromDataUri 已从 reference-image.ts 导入，不再需要本地定义

/**
 * 生成Graph（完整流程：提示词生成 + 图片生成）
 */
export async function generateGraph(
  graphType: 'photograph' | 'design' | 'painting',
  params: PhotographParams | DesignParams | PaintingParams,
  userId?: string,
  provider?: ProviderType
): Promise<{ prompt: string; image_urls: string[]; modelName: string; knowledgeRecallMetadata?: KnowledgeRecallMetadata }> {
  console.log(`\n========== [GraphService] 开始生成图片 (graphType: ${graphType}) ==========`);
  console.log(`[GraphService] 用户参数:`, {
    type: (params as any).type,
    style: (params as any).style,
    tone: (params as any).tone,
    environment: (params as any).environment,
    makeup: (params as any).makeup,
    pose: (params as any).pose,
    lighting: (params as any).lighting,
    quality: (params as any).quality,
  });
  // 1. 生成提示词
  const promptResult = await generateGraphPrompt(graphType, params, userId, provider);

  // 2. 生成图片
  const imageResult = await generateGraphImage(graphType, params, promptResult.prompt, provider);

  return {
    prompt: promptResult.prompt,
    image_urls: imageResult.image_urls,
    modelName: imageResult.modelName,
    knowledgeRecallMetadata: promptResult.knowledgeRecallMetadata,
  };
}
