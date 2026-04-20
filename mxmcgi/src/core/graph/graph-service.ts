/**
 * Graph核心服务
 * 处理图片生成提示词生成、图片生成等核心逻辑
 */

import { providerFactory, type ProviderType } from '../../models/providers';
import { getGraphRulesResolved, getPromptFullConfig } from '../../prompts';
import { getGraphParamsForType } from './graphconfigs';
import type { PhotographParams, DesignParams, PaintingParams } from './type';
import { runByModelKey } from '../../models/run';
import { KnowledgeService } from '../../knowledge/knowledge-service';
import type { KnowledgeSearchResult, KnowledgeHybridSearchResult } from '@mxmai/mxmdata';
import { generateDefaultPortraitKnowledge } from './graphconfigs/photograph/portrait';
import { generateDefaultLandscapeKnowledge } from './graphconfigs/photograph/landscape';
import { generateDefaultCinematicKnowledge } from './graphconfigs/photograph/cinematic';
import { generateDefaultCommercialKnowledge } from './graphconfigs/photograph/commercial';
import { generateDefaultDocumentaryKnowledge } from './graphconfigs/photograph/documentary';
import { generateDefault3dKnowledge } from './graphconfigs/design/3d';
import { generateDefaultManualKnowledge } from './graphconfigs/design/manual';
import { generateDefaultPosterKnowledge } from './graphconfigs/design/poster';
import { generateDefaultIconKnowledge } from './graphconfigs/design/icon';
import { generateDefaultIllustrationKnowledge } from './graphconfigs/painting/illustration';
import { generateDefaultComicKnowledge } from './graphconfigs/painting/comic';
import { generateDefaultConceptArtKnowledge } from './graphconfigs/painting/conceptArt';
import { generateDefaultCartoonKnowledge } from './graphconfigs/painting/cartoon';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { resolveGraphModel } from './graph-model-routing';
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
import { runBasicText } from '../text/basic-text';
import { assertSupportedGraphPromptTextMode, resolveGraphPromptTextMode } from './graph-prompt-text';

type OutputLanguage = 'zh' | 'en';

function detectOutputLanguage(userPrompt: string): OutputLanguage {
  // 简单规则：包含中文字符就输出中文，否则输出英文
  return /[\u4e00-\u9fff]/.test(userPrompt) ? 'zh' : 'en';
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
 * 构建提示词生成请求（rules 由调用方从 DB/代码解析得到后传入）
 */
function buildPromptGenerationRequest(
  graphType: string,
  type: string,
  userPrompt: string,
  businessParams: Record<string, any>,
  knowledgeContext: string,
  outputLanguage: OutputLanguage,
  rules: string
): string {
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
  const subType = normalizeSubTypeForStorage(graphType, type);
  return `graph-${graphType}-${subType}`;
}

/** 将 type 转为存储用的 sub_type（如 conceptArt -> concept-art） */
function normalizeSubTypeForStorage(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): string {
  if (graphType === 'painting' && type === 'conceptArt') {
    return 'concept-art';
  }
  return type;
}

/**
 * 解析默认知识库名称：优先从 Admin 配置的 knowledge_base_defaults 表获取，否则回退到命名规则
 */
async function resolveSystemKnowledgeBaseName(
  graphType: 'photograph' | 'design' | 'painting',
  type: string
): Promise<string> {
  const subType = normalizeSubTypeForStorage(graphType, type);
  try {
    const defaultsRepo = RepositoryFactory.createKnowledgeBaseDefaultsRepository();
    const kbId = await defaultsRepo.getDefault('graph', graphType, subType);
    if (kbId) {
      const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
      const kb = await kbRepo.findKnowledgeBaseById(kbId);
      if (kb) {
        return kb.name;
      }
    }
  } catch (e) {
    console.warn('[GraphService] 读取默认知识库配置失败，使用命名规则:', e);
  }
  return getSystemKnowledgeBaseName(graphType, type);
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
  
  // 优先从 Admin 配置的默认绑定获取，否则使用命名规则
  const knowledgeBaseName = await resolveSystemKnowledgeBaseName('photograph', params.type || 'portrait');
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
 * 通用知识库召回辅助函数
 * 处理通用的知识库召回逻辑（获取admin userId、执行查询、格式化结果等）
 */
async function retrieveSystemKnowledgeCommon(
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  queries: Array<{ parts: string[]; type: string }>,
  generateDefaultFn: (params: any) => string,
  params: any,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const knowledgeService = new KnowledgeService();
  const knowledgeBaseName = await resolveSystemKnowledgeBaseName(graphType, type);
  console.log(`[GraphService] 选择系统知识库: ${knowledgeBaseName} (graphType=${graphType}, type=${type})`);
  
  const allChunks: (KnowledgeSearchResult | KnowledgeHybridSearchResult)[] = [];
  const recallLimit = parseInt(process.env.GRAPH_KB_RECALL_LIMIT || '3', 10);
  const similarityThreshold = parseFloat(process.env.GRAPH_KB_SIMILARITY_THRESHOLD || '0.6');
  const maxTotalChunks = parseInt(process.env.GRAPH_KB_MAX_TOTAL_CHUNKS || '10', 10);
  
  let adminUserId: string | undefined = userId;
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    if (userId) {
      const user = await userRepo.findById(userId);
      if (user && user.role === 'admin') {
        adminUserId = userId;
      } else {
        adminUserId = await getAdminUserId();
      }
    } else {
      adminUserId = await getAdminUserId();
    }
  } catch (error) {
    console.warn('[GraphService] 无法获取 admin 用户 ID，将尝试使用传入的 userId:', error);
  }
  
  console.log(`[GraphService] 知识库召回配置: limit=${recallLimit}, threshold=${similarityThreshold}, maxTotal=${maxTotalChunks}`);
  console.log(`[GraphService] 使用 userId 访问系统知识库: ${adminUserId || userId || 'anonymous'}`);
  
  const queryResults: Array<{ query: string; type: string; count: number }> = [];
  
  try {
    // 执行所有查询
    for (const queryConfig of queries) {
      if (queryConfig.parts.length === 0) continue;
      
      const queryText = queryConfig.parts.join(' ');
      console.log(`[GraphService] 知识库查询 (${queryConfig.type}): "${queryText}"`);
      
      const searchUserId = adminUserId || userId || undefined;
      const results = await knowledgeService.search({
        knowledgeBaseName,
        query: queryText,
        searchType: 'hybrid',
        limit: recallLimit,
        threshold: similarityThreshold,
        userId: searchUserId,
      });
      
      queryResults.push({
        query: queryText,
        type: queryConfig.type,
        count: results.length,
      });
      
      allChunks.push(...results);
      console.log(`[GraphService] 查询完成: 召回 ${results.length} 条结果`);
    }
    
    console.log(`[GraphService] 查询汇总: 总计${allChunks.length}条`);
    
    // 去重
    const uniqueChunks = Array.from(
      new Map(allChunks.map(chunk => [chunk.id || chunk.content.substring(0, 100), chunk])).values()
    );
    console.log(`[GraphService] 去重后: ${uniqueChunks.length} 条`);
    
    // 按相似度排序
    const sortedChunks = uniqueChunks.sort((a, b) => {
      const simA = 'similarity' in a ? (a.similarity || 0) : ('combined_score' in a ? (a as KnowledgeHybridSearchResult).combined_score || 0 : 0);
      const simB = 'similarity' in b ? (b.similarity || 0) : ('combined_score' in b ? (b as KnowledgeHybridSearchResult).combined_score || 0 : 0);
      return simB - simA;
    });
    
    // 限制最多保留的结果数
    const topChunks = sortedChunks.slice(0, maxTotalChunks);
    console.log(`[GraphService] 最终保留: ${topChunks.length} 条`);
    
    // 格式化知识库内容
    if (topChunks.length === 0) {
      console.log('[GraphService] 知识库未召回任何相关内容，根据用户参数生成默认内容');
      const defaultContent = generateDefaultFn(params);
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
          similarity = (chunk as KnowledgeHybridSearchResult).combined_score ?? null;
        }
        
        if (similarity !== null) {
          similarities.push(similarity);
        }
        
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
      queries: queryResults,
    };
    
    console.log(`[GraphService] 知识库内容格式化完成，共 ${topChunks.length} 条，总长度: ${formattedContext.length} 字符`);
    console.log(`[GraphService] 召回元数据: 平均相似度=${metadata.avgSimilarity?.toFixed(3) || 'N/A'}, 最高=${metadata.maxSimilarity?.toFixed(3) || 'N/A'}, 最低=${metadata.minSimilarity?.toFixed(3) || 'N/A'}`);
    console.log(`[GraphService] ===== 知识库召回流程完成 =====\n`);
    
    return { content: formattedContext, metadata };
  } catch (error) {
    console.error('[GraphService] 知识库检索异常:', error);
    console.log('[GraphService] 根据用户参数生成默认内容作为fallback');
    const defaultContent = generateDefaultFn(params);
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
 * 从系统知识库检索风景摄影相关内容
 */
export async function retrieveSystemKnowledgeForLandscape(
  params: PhotographParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, timeOfDay, weather, season, composition } = params;
  
  const queries = [
    {
      parts: [timeOfDay, weather, season, userPrompt].filter(Boolean) as string[],
      type: '时间/天气/季节/场景',
    },
    {
      parts: [userPrompt, composition].filter(Boolean) as string[],
      type: '场景/构图',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'photograph',
    'landscape',
    queries,
    generateDefaultLandscapeKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索电影画面相关内容
 */
export async function retrieveSystemKnowledgeForCinematic(
  params: PhotographParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, filmStyle, mood, cameraAngle } = params;
  
  const queries = [
    {
      parts: [filmStyle, mood, userPrompt].filter(Boolean) as string[],
      type: '电影风格/情绪氛围/场景',
    },
    {
      parts: [userPrompt, cameraAngle].filter(Boolean) as string[],
      type: '场景/拍摄角度',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'photograph',
    'cinematic',
    queries,
    generateDefaultCinematicKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索产品商业拍摄相关内容
 */
export async function retrieveSystemKnowledgeForCommercial(
  params: PhotographParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, productType, background, props } = params;
  
  const queries = [
    {
      parts: [productType, background, userPrompt].filter(Boolean) as string[],
      type: '产品类型/背景/场景',
    },
    {
      parts: [userPrompt, props].filter(Boolean) as string[],
      type: '场景/道具',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'photograph',
    'commercial',
    queries,
    generateDefaultCommercialKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索纪实摄影相关内容
 */
export async function retrieveSystemKnowledgeForDocumentary(
  params: PhotographParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, eventType, documentaryStyle } = params;
  
  const queries = [
    {
      parts: [eventType, documentaryStyle, userPrompt].filter(Boolean) as string[],
      type: '事件类型/纪实风格/场景',
    },
    {
      parts: [userPrompt, documentaryStyle].filter(Boolean) as string[],
      type: '场景/纪实风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'photograph',
    'documentary',
    queries,
    generateDefaultDocumentaryKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索3D设计相关内容
 */
export async function retrieveSystemKnowledgeFor3d(
  params: DesignParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, modelStyle, material, lighting, perspective } = params;
  
  const queries = [
    {
      parts: [modelStyle, material, lighting, userPrompt].filter(Boolean) as string[],
      type: '模型风格/材质/光照/场景',
    },
    {
      parts: [userPrompt, perspective].filter(Boolean) as string[],
      type: '场景/视角',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'design',
    '3d',
    queries,
    generateDefault3dKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索使用手册设计相关内容
 */
export async function retrieveSystemKnowledgeForManual(
  params: DesignParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, layout, colorScheme, typography } = params;
  
  const queries = [
    {
      parts: [layout, colorScheme, userPrompt].filter(Boolean) as string[],
      type: '布局/配色/内容',
    },
    {
      parts: [userPrompt, typography].filter(Boolean) as string[],
      type: '内容/字体',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'design',
    'manual',
    queries,
    generateDefaultManualKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索画报设计相关内容
 */
export async function retrieveSystemKnowledgeForPoster(
  params: DesignParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, artStyle, theme } = params;
  
  const queries = [
    {
      parts: [artStyle, theme, userPrompt].filter(Boolean) as string[],
      type: '艺术风格/主题/内容',
    },
    {
      parts: [userPrompt, artStyle].filter(Boolean) as string[],
      type: '内容/艺术风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'design',
    'poster',
    queries,
    generateDefaultPosterKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索图标设计相关内容
 */
export async function retrieveSystemKnowledgeForIcon(
  params: DesignParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, iconStyle, size } = params;
  
  const queries = [
    {
      parts: [iconStyle, size, userPrompt].filter(Boolean) as string[],
      type: '图标风格/尺寸/内容',
    },
    {
      parts: [userPrompt, iconStyle].filter(Boolean) as string[],
      type: '内容/图标风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'design',
    'icon',
    queries,
    generateDefaultIconKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索插画相关内容
 */
export async function retrieveSystemKnowledgeForIllustration(
  params: PaintingParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, illustrationStyle, colorPalette } = params;
  
  const queries = [
    {
      parts: [illustrationStyle, colorPalette, userPrompt].filter(Boolean) as string[],
      type: '插图风格/色彩/内容',
    },
    {
      parts: [userPrompt, illustrationStyle].filter(Boolean) as string[],
      type: '内容/插图风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'painting',
    'illustration',
    queries,
    generateDefaultIllustrationKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索漫画相关内容
 */
export async function retrieveSystemKnowledgeForComic(
  params: PaintingParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, comicStyle, panelLayout } = params;
  
  const queries = [
    {
      parts: [comicStyle, panelLayout, userPrompt].filter(Boolean) as string[],
      type: '漫画风格/分镜布局/内容',
    },
    {
      parts: [userPrompt, comicStyle].filter(Boolean) as string[],
      type: '内容/漫画风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'painting',
    'comic',
    queries,
    generateDefaultComicKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索原画相关内容
 */
export async function retrieveSystemKnowledgeForConceptArt(
  params: PaintingParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, conceptArtStyle, detailLevel } = params;
  
  const queries = [
    {
      parts: [conceptArtStyle, detailLevel, userPrompt].filter(Boolean) as string[],
      type: '概念艺术风格/细节程度/内容',
    },
    {
      parts: [userPrompt, conceptArtStyle].filter(Boolean) as string[],
      type: '内容/概念艺术风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'painting',
    'conceptArt',
    queries,
    generateDefaultConceptArtKnowledge,
    params,
    userId
  );
}

/**
 * 从系统知识库检索卡通相关内容
 */
export async function retrieveSystemKnowledgeForCartoon(
  params: PaintingParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata }> {
  const { prompt: userPrompt, cartoonStyle, characterDesign } = params;
  
  const queries = [
    {
      parts: [cartoonStyle, characterDesign, userPrompt].filter(Boolean) as string[],
      type: '卡通风格/角色设计/内容',
    },
    {
      parts: [userPrompt, cartoonStyle].filter(Boolean) as string[],
      type: '内容/卡通风格',
    },
  ];
  
  return retrieveSystemKnowledgeCommon(
    'painting',
    'cartoon',
    queries,
    generateDefaultCartoonKnowledge,
    params,
    userId
  );
}

/** 按 graphType + type 分发到对应的知识库召回函数；无对应实现时返回 null */
async function retrieveSystemKnowledgeByType(
  graphType: 'photograph' | 'design' | 'painting',
  type: string,
  params: PhotographParams | DesignParams | PaintingParams,
  userId?: string
): Promise<{ content: string; metadata: KnowledgeRecallMetadata } | null> {
  if (graphType === 'photograph') {
    if (type === 'portrait') return retrieveSystemKnowledgeForPortrait(params as PhotographParams, userId);
    if (type === 'landscape') return retrieveSystemKnowledgeForLandscape(params as PhotographParams, userId);
    if (type === 'cinematic') return retrieveSystemKnowledgeForCinematic(params as PhotographParams, userId);
    if (type === 'commercial') return retrieveSystemKnowledgeForCommercial(params as PhotographParams, userId);
    if (type === 'documentary') return retrieveSystemKnowledgeForDocumentary(params as PhotographParams, userId);
  }
  if (graphType === 'design') {
    if (type === '3d') return retrieveSystemKnowledgeFor3d(params as DesignParams, userId);
    if (type === 'manual') return retrieveSystemKnowledgeForManual(params as DesignParams, userId);
    if (type === 'poster') return retrieveSystemKnowledgeForPoster(params as DesignParams, userId);
    if (type === 'icon') return retrieveSystemKnowledgeForIcon(params as DesignParams, userId);
    // coverImage 无单独召回实现，返回 null
  }
  if (graphType === 'painting') {
    if (type === 'illustration') return retrieveSystemKnowledgeForIllustration(params as PaintingParams, userId);
    if (type === 'comic') return retrieveSystemKnowledgeForComic(params as PaintingParams, userId);
    if (type === 'conceptArt') return retrieveSystemKnowledgeForConceptArt(params as PaintingParams, userId);
    if (type === 'cartoon') return retrieveSystemKnowledgeForCartoon(params as PaintingParams, userId);
  }
  return null;
}

/**
 * 生成Graph提示词（返回提示词和召回元数据）
 */
export async function generateGraphPrompt(
  graphType: 'photograph' | 'design' | 'painting',
  params: PhotographParams | DesignParams | PaintingParams,
  userId?: string,
  provider?: ProviderType,
  parentTaskId?: string
): Promise<{
  prompt: string;
  knowledgeRecallMetadata?: KnowledgeRecallMetadata;
  /** BasicText: writing-basic-text 的用量记录（已完成 Provider 扣费） */
  promptGenerationUsage?: { mediaUrls: string[]; metadata?: Record<string, any> };
  /** BasicText: writing-basic-text 的 Provider 成本（USD），供用户侧 Billing 使用 */
  promptGenerationCostUsd?: number;
}> {
  const { type, prompt: userPrompt } = params;

  // 1. 提取业务参数
  const businessParams = extractBusinessParams(params, graphType, type);

  // 2.5 根据用户输入语言决定输出语言（中文/英文）
  const outputLanguage = detectOutputLanguage(userPrompt || '');
  const lang = outputLanguage === 'zh' ? 'zh' : 'en';

  // 2. 知识库召回：仅当 prompt_engineering_config 中 use_knowledge=true 时执行
  const promptConfig = await getPromptFullConfig('graph', graphType, type, lang);
  const graphPromptTextMode = resolveGraphPromptTextMode(promptConfig);
  assertSupportedGraphPromptTextMode(graphPromptTextMode);
  let knowledgeContext = '';
  let knowledgeRecallMetadata: KnowledgeRecallMetadata | null = null;
  if (promptConfig?.use_knowledge === true) {
    const result = await retrieveSystemKnowledgeByType(graphType, type, params, userId);
    if (result) {
      knowledgeContext = result.content;
      knowledgeRecallMetadata = result.metadata;
      console.log(`[GraphService] 知识库召回已启用，内容长度: ${knowledgeContext.length} 字符`);
    } else {
      console.log(`[GraphService] 知识库召回已启用，但当前 (graphType=${graphType}, type=${type}) 无对应召回实现，跳过`);
    }
  } else {
    console.log('[GraphService] 知识库召回未启用（use_knowledge 为 false 或未配置）');
  }

  // 2.6 处理参考图（但不立即拼装到提示词，等大模型生成后再拼装）
  let processedReferenceImages: ReferenceImage[] = [];
  let referenceImagePrompt = '';
  
  // 处理通用参考图
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
  
  // 处理 coverImage 类型的特殊图片（subjectImage 和 backgroundImage）
  if (graphType === 'design' && type === 'coverImage') {
    const designParams = params as DesignParams;
    
    // 处理主体图片
    if (designParams.subjectImage) {
      let processedSubjectImages: ReferenceImage[] = [];
      if (typeof designParams.subjectImage === 'string') {
        processedSubjectImages = convertLegacyReferenceImage(designParams.subjectImage);
      } else if (Array.isArray(designParams.subjectImage)) {
        if (designParams.subjectImage.length > 0 && typeof designParams.subjectImage[0] === 'string') {
          processedSubjectImages = convertLegacyReferenceImage(designParams.subjectImage as string[]);
        } else {
          processedSubjectImages = designParams.subjectImage as ReferenceImage[];
        }
      } else {
        processedSubjectImages = [designParams.subjectImage as ReferenceImage];
      }
      
      // 将主体图片合并到参考图列表中（标记为 subject）
      processedSubjectImages.forEach(img => {
        (img as any).role = 'subject'; // 标记为主体图片
      });
      processedReferenceImages = [...processedReferenceImages, ...processedSubjectImages];
      (params as any).subjectImage = processedSubjectImages;
      
      console.log(`[GraphService] 主体图片处理完成 (${processedSubjectImages.length} 张)`);
    }
    
    // 处理背景图片
    if (designParams.backgroundImage) {
      let processedBackgroundImages: ReferenceImage[] = [];
      if (typeof designParams.backgroundImage === 'string') {
        processedBackgroundImages = convertLegacyReferenceImage(designParams.backgroundImage);
      } else if (Array.isArray(designParams.backgroundImage)) {
        if (designParams.backgroundImage.length > 0 && typeof designParams.backgroundImage[0] === 'string') {
          processedBackgroundImages = convertLegacyReferenceImage(designParams.backgroundImage as string[]);
        } else {
          processedBackgroundImages = designParams.backgroundImage as ReferenceImage[];
        }
      } else {
        processedBackgroundImages = [designParams.backgroundImage as ReferenceImage];
      }
      
      // 将背景图片合并到参考图列表中（标记为 background）
      processedBackgroundImages.forEach(img => {
        (img as any).role = 'background'; // 标记为背景图片
      });
      processedReferenceImages = [...processedReferenceImages, ...processedBackgroundImages];
      (params as any).backgroundImage = processedBackgroundImages;
      
      console.log(`[GraphService] 背景图片处理完成 (${processedBackgroundImages.length} 张)`);
    }
    
    // 更新 processedReferenceImages 到 params
    if (processedReferenceImages.length > 0) {
      (params as any).referenceImage = processedReferenceImages;
    }
  }

  // 2.7 针对特定类型做结构化用户需求拼装
  // 注意：这里不包含参考图提示词，参考图提示词会在后面拼装到大模型生成的提示词前面
  let effectiveUserPrompt = userPrompt;
  
  // Photograph 类型
  if (graphType === 'photograph') {
    if (type === 'portrait') {
      const { buildPortraitUserPrompt } = require('./graphconfigs/photograph/portrait');
      effectiveUserPrompt = buildPortraitUserPrompt(params as PhotographParams, outputLanguage);
    } else if (type === 'landscape') {
      const { buildLandscapeUserPrompt } = require('./graphconfigs/photograph/landscape');
      effectiveUserPrompt = buildLandscapeUserPrompt(params as PhotographParams, outputLanguage);
    } else if (type === 'cinematic') {
      const { buildCinematicUserPrompt } = require('./graphconfigs/photograph/cinematic');
      effectiveUserPrompt = buildCinematicUserPrompt(params as PhotographParams, outputLanguage);
    } else if (type === 'commercial') {
      const { buildCommercialUserPrompt } = require('./graphconfigs/photograph/commercial');
      effectiveUserPrompt = buildCommercialUserPrompt(params as PhotographParams, outputLanguage);
    } else if (type === 'documentary') {
      const { buildDocumentaryUserPrompt } = require('./graphconfigs/photograph/documentary');
      effectiveUserPrompt = buildDocumentaryUserPrompt(params as PhotographParams, outputLanguage);
    }
  }
  // Design 类型
  else if (graphType === 'design') {
    if (type === '3d') {
      const { build3dUserPrompt } = require('./graphconfigs/design/3d');
      effectiveUserPrompt = build3dUserPrompt(params as DesignParams, outputLanguage);
    } else if (type === 'manual') {
      const { buildManualUserPrompt } = require('./graphconfigs/design/manual');
      effectiveUserPrompt = buildManualUserPrompt(params as DesignParams, outputLanguage);
    } else if (type === 'poster') {
      const { buildPosterUserPrompt } = require('./graphconfigs/design/poster');
      effectiveUserPrompt = buildPosterUserPrompt(params as DesignParams, outputLanguage);
    } else if (type === 'icon') {
      const { buildIconUserPrompt } = require('./graphconfigs/design/icon');
      effectiveUserPrompt = buildIconUserPrompt(params as DesignParams, outputLanguage);
    } else if (type === 'coverImage') {
      const { buildCoverImageUserPrompt } = require('./graphconfigs/design/coverImage');
      effectiveUserPrompt = buildCoverImageUserPrompt(params as DesignParams, outputLanguage);
    }
  }
  // Painting 类型
  else if (graphType === 'painting') {
    if (type === 'illustration') {
      const { buildIllustrationUserPrompt } = require('./graphconfigs/painting/illustration');
      effectiveUserPrompt = buildIllustrationUserPrompt(params as PaintingParams, outputLanguage);
    } else if (type === 'comic') {
      const { buildComicUserPrompt } = require('./graphconfigs/painting/comic');
      effectiveUserPrompt = buildComicUserPrompt(params as PaintingParams, outputLanguage);
    } else if (type === 'conceptArt') {
      const { buildConceptArtUserPrompt } = require('./graphconfigs/painting/conceptArt');
      effectiveUserPrompt = buildConceptArtUserPrompt(params as PaintingParams, outputLanguage);
    } else if (type === 'cartoon') {
      const { buildCartoonUserPrompt } = require('./graphconfigs/painting/cartoon');
      effectiveUserPrompt = buildCartoonUserPrompt(params as PaintingParams, outputLanguage);
    }
  }

  // 3. 解析规则（优先 DB，回退代码配置）并构建提示词生成请求
  const rules = await getGraphRulesResolved(graphType, type, outputLanguage === 'zh' ? 'zh' : 'en');
  const promptGenerationRequest = buildPromptGenerationRequest(
    graphType,
    type,
    effectiveUserPrompt,
    businessParams,
    knowledgeContext,
    outputLanguage,
    rules
  );

  // 添加调试日志，方便查看实际发送给大模型的提示词
  console.log(
    `[GraphService] 提示词生成开始 (graphType: ${graphType}, type: ${type}, outputLanguage: ${outputLanguage}, userId: ${userId || 'anonymous'})`
  );
  console.log(`[GraphService] 使用规则前缀: ${rules.substring(0, 180)}${rules.length > 180 ? '...' : ''}`);
  console.log(`[GraphService] 业务参数:`, businessParams);
  console.log(`[GraphService] 提示词生成请求前缀: ${promptGenerationRequest.substring(0, 500)}${promptGenerationRequest.length > 500 ? '...' : ''}`);

  // 4. 调用 BasicText 生成提示词（与写作内压缩等统一用 writing-basic-text）
  const finalProvider = provider ?? providerFactory.getDefaultProvider();
  console.log(
    `[GraphService] 使用 BasicText 生成提示词: logicalModel=writing-basic-text, providerOverride=${finalProvider}`
  );

  const basicTextResult = await runBasicText('writing-basic-text', promptGenerationRequest, {
    userId,
    parentTaskId,
    providerOverride: finalProvider,
  });

  const generatedPrompt = basicTextResult.text;
  const promptGenerationUsage = basicTextResult.usage;
  const promptGenerationCostUsd = basicTextResult.costUsd;

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

  // 2.9 检测是否为九宫格模式
  const isGrid9 = (params as any).grid9 === true;
  
  if (isGrid9) {
    console.log(`[GraphService] 检测到九宫格模式，开始生成九宫格 prompt`);
    
    // 导入九宫格相关模块
    const { generateGrid9Variants, getDefaultGrid9Purpose } = await import('./graphconfigs/grid9-variants');
    const { buildGrid9Prompt } = await import('./graphconfigs/grid9-prompt');
    
    // 解析多图用途（未传则按 (graphType, type) 默认）
    const purpose = (params as any).grid9Purpose || getDefaultGrid9Purpose(graphType, type);

    // 生成9个变体配置
    const variants = generateGrid9Variants(
      params,
      graphType,
      type,
      (params as any).grid9Mode,
      purpose
    );
    
    console.log(`[GraphService] 已生成 ${variants.length} 个变体配置，模式: ${variants[0]?.mode || 'unknown'}`);
    
    // 构建九宫格 prompt
    const grid9Prompt = buildGrid9Prompt(
      finalPrompt, // 使用最终拼装后的 prompt 作为基础
      params,
      variants,
      outputLanguage,
      purpose
    );
    
    console.log(`[GraphService] 九宫格 prompt 生成完成，长度: ${grid9Prompt.length} 字符`);
    
    // 返回九宫格 prompt
    return {
      prompt: grid9Prompt,
      knowledgeRecallMetadata: knowledgeRecallMetadata || undefined,
      promptGenerationUsage,
      promptGenerationCostUsd,
    };
  }

  // 返回最终拼装后的提示词和召回元数据（如果存在）
  return {
    prompt: finalPrompt,
    knowledgeRecallMetadata: knowledgeRecallMetadata || undefined,
    promptGenerationUsage,
    promptGenerationCostUsd,
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
  const { referenceImage, aspect_ratio } = params;

  const subType = (params as any).type;

  // 检测是否为九宫格模式
  const isGrid9 = (params as any).grid9 === true;

  // 九宫格模式支持用户选择的宽高比，但需要验证是否为支持的宽高比
  let effectiveAspectRatio = aspect_ratio;
  if (isGrid9) {
    // 验证宽高比是否为支持的格式（1:1、16:9、9:16）
    const supportedAspectRatios = ['1:1', '16:9', '9:16'];
    if (!aspect_ratio || !supportedAspectRatios.includes(aspect_ratio)) {
      // 如果不支持，默认使用 1:1
      console.warn(`[GraphService] 九宫格模式：不支持的宽高比 ${aspect_ratio}，使用默认 1:1`);
      effectiveAspectRatio = '1:1';
    }
  }

  // 根据业务配置解析模型
  const { modelName, provider: resolvedProvider } = await resolveGraphModel(
    graphType,
    subType,
    provider
  );

  if (isGrid9) {
    console.log(
      `[GraphService] 九宫格模式：使用 ${modelName} 模型（graphType=${graphType}, type=${subType}），aspect_ratio: ${effectiveAspectRatio}, image_size: 4K`
    );
  }

  // 准备图片参数
  let imageParams: any = {
    prompt: generatedPrompt,
  };
  
  // 根据模型类型处理 aspect_ratio
  if (modelName === 'seedream-4' || modelName === 'seedream-5') {
    // seedream-4/5 不支持 aspect_ratio 参数，只支持 size ('1k', '2k', '4k')
    // 与 nano-banana 一致，默认写死 4k 画质
    // 注意：seedream-4/5 的 size 参数会决定输出分辨率，但不直接控制宽高比
    // 我们需要在 prompt 中明确说明宽高比要求
    if (!params.size) {
      imageParams.size = '4k'; // 默认 4k，与 nano-banana 系列一致
    } else {
      // 将 '1K'/'2K'/'4K' 转换为 '1k'/'2k'/'4k'（DeerAPI 要求小写）
      const sizeValue = typeof params.size === 'string' ? params.size.toLowerCase() : params.size;
      imageParams.size = sizeValue;
    }
    
    // 在 prompt 中添加宽高比说明（如果提供了 aspect_ratio）
    // 这样模型可以根据 prompt 中的宽高比要求生成对应比例的图片
    if (effectiveAspectRatio) {
      const aspectRatioMap: Record<string, string> = {
        '16:9': '16:9 宽屏横向比例',
        '9:16': '9:16 竖屏纵向比例',
        '1:1': '1:1 正方形',
        '4:3': '4:3 标准横向比例',
        '3:4': '3:4 标准纵向比例',
      };
      const aspectRatioText = aspectRatioMap[effectiveAspectRatio] || `${effectiveAspectRatio} 比例`;
      
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
        console.log(`[GraphService] ${modelName} 不支持 aspect_ratio 参数，已在 prompt 中添加宽高比说明: ${aspectRatioText}`);
      } else {
        imageParams.prompt = generatedPrompt;
        console.log(`[GraphService] prompt 中已包含宽高比信息，无需重复添加`);
      }
    } else {
      imageParams.prompt = generatedPrompt;
    }
  } else {
    // nano-banana-pro 支持 aspect_ratio 参数
    imageParams.aspect_ratio = effectiveAspectRatio;
    imageParams.prompt = generatedPrompt;
    // nano-banana-pro 默认使用 4K 画质（九宫格模式强制4K）
    imageParams.image_size = isGrid9 ? '4K' : '4K';
  }

  // 处理参考图（支持新格式和旧格式）
  // 对于 coverImage 类型，需要合并 subjectImage 和 backgroundImage
  let allReferenceImages: ReferenceImage[] = [];
  
  // 首先处理通用参考图
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
    
    allReferenceImages = [...allReferenceImages, ...processedReferenceImages];
  }
  
  // 对于 coverImage 类型，还需要处理 subjectImage 和 backgroundImage（可选）
  if (graphType === 'design' && (params as DesignParams).type === 'coverImage') {
    const designParams = params as DesignParams;
    
    // 处理主体图片（可选）
    if (designParams.subjectImage) {
      let processedSubjectImages: ReferenceImage[] = [];
      if (typeof designParams.subjectImage === 'string') {
        processedSubjectImages = convertLegacyReferenceImage(designParams.subjectImage);
      } else if (Array.isArray(designParams.subjectImage)) {
        if (designParams.subjectImage.length > 0 && typeof designParams.subjectImage[0] === 'string') {
          processedSubjectImages = convertLegacyReferenceImage(designParams.subjectImage as string[]);
        } else {
          processedSubjectImages = designParams.subjectImage as ReferenceImage[];
        }
      } else {
        processedSubjectImages = [designParams.subjectImage as ReferenceImage];
      }
      allReferenceImages = [...allReferenceImages, ...processedSubjectImages];
    }
    
    // 处理背景图片（可选）
    if (designParams.backgroundImage) {
      let processedBackgroundImages: ReferenceImage[] = [];
      if (typeof designParams.backgroundImage === 'string') {
        processedBackgroundImages = convertLegacyReferenceImage(designParams.backgroundImage);
      } else if (Array.isArray(designParams.backgroundImage)) {
        if (designParams.backgroundImage.length > 0 && typeof designParams.backgroundImage[0] === 'string') {
          processedBackgroundImages = convertLegacyReferenceImage(designParams.backgroundImage as string[]);
        } else {
          processedBackgroundImages = designParams.backgroundImage as ReferenceImage[];
        }
      } else {
        processedBackgroundImages = [designParams.backgroundImage as ReferenceImage];
      }
      allReferenceImages = [...allReferenceImages, ...processedBackgroundImages];
    }
  }
  
  // 使用合并后的所有参考图
  if (allReferenceImages.length > 0) {
    const processedReferenceImages = allReferenceImages;
    
    if (processedReferenceImages.length > 0) {
      // 处理参考图，转换为模型可接受的格式
      const { urls, base64s } = processReferenceImages(
        processedReferenceImages,
        modelName as 'nano-banana' | 'nano-banana-pro' | 'nano-banana-2' | 'nano-banana-2-pro' | 'seedream-4' | 'seedream-5'
      );
      
      console.log(`[GraphService] 处理参考图: ${processedReferenceImages.length} 张, URLs: ${urls.length}, Base64s: ${base64s.length}`);
      
      if (modelName === 'nano-banana-pro') {
        // nano-banana 系列（Gemini）当前不支持直接使用图片 URL，需要先转换为 Base64 / data URI
        const storageRepo = RepositoryFactory.createStorageRepository();
        const toDataUriFromUrl = async (u: string): Promise<string> => {
          // 优先识别内部 /api/v1/media/asset?bucket=...&key=...
          try {
            const parsed = new URL(u);
            if (parsed.pathname.endsWith('/api/v1/media/asset') || parsed.pathname.endsWith('/media/asset')) {
              const bucket = parsed.searchParams.get('bucket') || '';
              const key = parsed.searchParams.get('key') || '';
              if (bucket && key) {
                const buf = await storageRepo.downloadFile(bucket, key);
                const meta = await storageRepo.getFileMetadata(bucket, key);
                const ct =
                  meta?.contentType ||
                  (key.endsWith('.png')
                    ? 'image/png'
                    : key.endsWith('.webp')
                    ? 'image/webp'
                    : key.endsWith('.gif')
                    ? 'image/gif'
                    : 'image/jpeg');
                const b64 = Buffer.from(buf).toString('base64');
                return `data:${ct};base64,${b64}`;
              }
            }
          } catch {
            // ignore
          }

          // 外部 URL：HTTP 拉取后转 base64
          const resp = await fetch(u);
          if (!resp.ok) throw new Error(`下载参考图失败: ${resp.status} ${resp.statusText}`);
          const ct = resp.headers.get('content-type') || 'image/jpeg';
          const ab = await resp.arrayBuffer();
          const b64 = Buffer.from(ab).toString('base64');
          return `data:${ct};base64,${b64}`;
        };

        const imageInputs: string[] = [];
        for (const ref of processedReferenceImages) {
          const c = ref.content;
          if (isBase64(c)) {
            imageInputs.push(c);
            continue;
          }
          if (isUrl(c)) {
            const dataUri = await toDataUriFromUrl(c);
            const base64Data = extractBase64FromDataUri(dataUri);
            const sizeMB = base64Data.length / 1024 / 1024;
            if (sizeMB > 2) {
              const compressed = await compressImage(dataUri, 2, 2048, 2048, 85);
              imageInputs.push(compressed.compressed);
            } else {
              imageInputs.push(dataUri);
            }
          }
        }

        if (imageInputs.length === 1) {
          imageParams.image = imageInputs[0];
        } else if (imageInputs.length > 1) {
          imageParams.image_base64s = imageInputs;
        }
      } else if (modelName === 'nano-banana-2' || modelName === 'nano-banana-2-pro') {
        // nano-banana-2：同一个 modelKey 可能被路由到不同 provider（由 Admin 动态配置决定）。
        // - 若 resolvedProvider=deer：走 DeerAPI Gemini（仅支持 base64/data-uri，不支持 URL）
        // - 若 resolvedProvider=atlascloud：走 AtlasCloud prediction（要求 images 为云端可访问 URL）

        if (resolvedProvider === 'deer') {
          // DeerAPI：将 URL（含内网 asset 代理）统一转为 data URI；最终走 image / image_base64s
          const storageRepo = RepositoryFactory.createStorageRepository();
          const toDataUriFromUrl = async (u: string): Promise<string> => {
            try {
              const parsed = new URL(u);
              if (parsed.pathname.endsWith('/api/v1/media/asset') || parsed.pathname.endsWith('/media/asset')) {
                const bucket = parsed.searchParams.get('bucket') || '';
                const key = parsed.searchParams.get('key') || '';
                if (bucket && key) {
                  const buf = await storageRepo.downloadFile(bucket, key);
                  const meta = await storageRepo.getFileMetadata(bucket, key);
                  const ct =
                    meta?.contentType ||
                    (key.endsWith('.png')
                      ? 'image/png'
                      : key.endsWith('.webp')
                      ? 'image/webp'
                      : key.endsWith('.gif')
                      ? 'image/gif'
                      : 'image/jpeg');
                  const b64 = Buffer.from(buf).toString('base64');
                  return `data:${ct};base64,${b64}`;
                }
              }
            } catch {
              // ignore
            }
            const resp = await fetch(u);
            if (!resp.ok) throw new Error(`下载参考图失败: ${resp.status} ${resp.statusText}`);
            const ct = resp.headers.get('content-type') || 'image/jpeg';
            const ab = await resp.arrayBuffer();
            const b64 = Buffer.from(ab).toString('base64');
            return `data:${ct};base64,${b64}`;
          };

          const imageInputs: string[] = [];
          for (const ref of processedReferenceImages) {
            const c = ref.content;
            if (isBase64(c)) {
              imageInputs.push(c);
              continue;
            }
            if (isUrl(c)) {
              const dataUri = await toDataUriFromUrl(c);
              const base64Data = extractBase64FromDataUri(dataUri);
              const sizeMB = base64Data.length / 1024 / 1024;
              if (sizeMB > 2) {
                const compressed = await compressImage(dataUri, 2, 2048, 2048, 85);
                imageInputs.push(compressed.compressed);
              } else {
                imageInputs.push(dataUri);
              }
            }
          }
          if (imageInputs.length === 1) imageParams.image = imageInputs[0];
          else if (imageInputs.length > 1) imageParams.image_base64s = imageInputs;
        } else if (resolvedProvider === 'atlascloud') {
          // AtlasCloud：把 base64/内网 URL 上传到 AtlasCloud，换成 download_url，再传 images[]
          const { getFirstProviderKey } = await import('../providers');
          const apiKey = (await getFirstProviderKey('atlascloud')) ?? process.env.ATLASCLOUD_API_KEY;
          const base = String(process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai').replace(/\/+$/, '');
          if (!apiKey) throw new Error('AtlasCloud API Key 未配置：provider=atlascloud 或 ATLASCLOUD_API_KEY');

          const storageRepo = RepositoryFactory.createStorageRepository();
          const uploadToAtlasCloud = async (buf: Buffer, filename: string, contentType: string): Promise<string> => {
            const form = new FormData();
            const blob = new Blob([buf], { type: contentType });
            form.append('file', blob, filename);
            const resp = await fetch(`${base}/api/v1/model/uploadMedia`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}` },
              body: form as any,
            });
            const text = await resp.text().catch(() => '');
            let json: any = {};
            try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
            if (!resp.ok) {
              throw new Error(
                `AtlasCloud uploadMedia 失败: ${resp.status} ${resp.statusText} ${(json?.message || json?.error || json?.raw || '').toString()}`.trim()
              );
            }
            const url = json?.data?.download_url ?? json?.download_url;
            if (!url || typeof url !== 'string') throw new Error('AtlasCloud uploadMedia 未返回 download_url');
            return url;
          };

          const isInternalAssetProxy = (u: string): { bucket: string; key: string } | null => {
            try {
              const parsed = new URL(u, 'http://local');
              const path = parsed.pathname || '';
              if (path.endsWith('/api/v1/media/asset') || path.endsWith('/media/asset')) {
                const bucket = parsed.searchParams.get('bucket') || '';
                const key = parsed.searchParams.get('key') || '';
                if (bucket && key) return { bucket, key };
              }
            } catch {
              // ignore
            }
            return null;
          };

          const toAtlasUrl = async (ref: ReferenceImage): Promise<string> => {
            const c = ref.content;
            if (isBase64(c)) {
              const b64 = extractBase64FromDataUri(c);
              const buf = Buffer.from(b64, 'base64');
              const ct =
                c.startsWith('data:image/png') ? 'image/png'
                : c.startsWith('data:image/webp') ? 'image/webp'
                : c.startsWith('data:image/gif') ? 'image/gif'
                : 'image/jpeg';
              return uploadToAtlasCloud(buf, `ref_${ref.type || 'image'}.jpg`, ct);
            }
            if (isUrl(c)) {
              const hit = isInternalAssetProxy(c);
              if (hit) {
                const bufAny = await storageRepo.downloadFile(hit.bucket, hit.key);
                const meta = await storageRepo.getFileMetadata(hit.bucket, hit.key);
                const ct =
                  meta?.contentType ||
                  (hit.key.endsWith('.png') ? 'image/png' : hit.key.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
                const buf = Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as any);
                return uploadToAtlasCloud(buf, `ref_${ref.type || 'image'}`, ct);
              }
              return c;
            }
            return String(c);
          };

          const atlasUrls: string[] = [];
          for (const ref of processedReferenceImages) atlasUrls.push(await toAtlasUrl(ref));
          if (atlasUrls.length > 0) imageParams.images = atlasUrls.slice(0, 14);
        } else {
          // 其他 provider：不做特殊处理（保持现有逻辑）；用户可切换 provider 或改用 Base64
        }
      } else {
        // seedream-4/5 使用 image_input 数组（支持 URL 和 base64）
        const imageInput: string[] = [];
        imageInput.push(...urls);
        
        // seedream-4/5 需要完整的 data URI 格式
        // 对于 Base64 图片，如果太大则自动压缩
        console.log(`[GraphService] 处理 ${modelName} 参考图，开始压缩大图片...`);
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
        
        // 根据文档，Seedream 使用 'image' 参数
        if (imageInput.length > 0) {
          imageParams.image = imageInput;
        }
        imageParams.image_input = imageInput;
        const totalSize = imageInput.reduce((sum: number, img: string): number => sum + img.length, 0);
        const totalSizeMB = totalSize / 1024 / 1024;
        console.log(`[GraphService] ${modelName} image_input 准备完成: ${imageInput.length} 张图片，总大小: ${totalSizeMB.toFixed(2)} MB`);
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
    console.log(`[GraphService] 调用模型 ${modelName} (provider=${resolvedProvider}) 生成图片...`);
    const result = await runByModelKey('graph', modelName, imageParams, {
      providerOverride: resolvedProvider,
    }) as { image_urls?: string[]; mediaUrls?: string[] };
    const urls = result.image_urls ?? result.mediaUrls ?? [];
    console.log(`[GraphService] ${modelName} 生成完成，图片数量: ${urls.length}`);
    return { image_urls: urls, modelName };
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
  provider?: ProviderType,
  parentTaskId?: string
): Promise<{
  prompt: string;
  image_urls: string[];
  modelName: string;
  knowledgeRecallMetadata?: KnowledgeRecallMetadata;
  /** 生图前一次文字模型调用用量，用于计入 Provider 扣费与用户计费 */
  promptGenerationUsage?: { mediaUrls: string[]; metadata?: Record<string, any> };
  /** 生图前一次文字模型调用 Provider 成本（USD），用于用户侧计费 */
  promptGenerationCostUsd?: number;
}> {
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
  const promptResult = await generateGraphPrompt(graphType, params, userId, provider, parentTaskId);

  // 2. 生成图片
  const imageResult = await generateGraphImage(graphType, params, promptResult.prompt, provider);

  return {
    prompt: promptResult.prompt,
    image_urls: imageResult.image_urls,
    modelName: imageResult.modelName,
    knowledgeRecallMetadata: promptResult.knowledgeRecallMetadata,
    promptGenerationUsage: promptResult.promptGenerationUsage,
    promptGenerationCostUsd: promptResult.promptGenerationCostUsd,
  };
}
