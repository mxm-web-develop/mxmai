/**
 * Graph 核心服务：提示词（text/format 等）与生图调用。
 * 业务键（graph taskKey / subtype）与规则均来自 DB，本文件不写死业务线枚举。
 */

import { providerFactory, type ProviderType } from '../../models/providers';
import { getGraphRulesResolved, getPromptFullConfig } from '../../prompts';
import type { GraphRuntimeParams } from './type';
import { runByModelKey } from '../../models/run';
import { applyGptImageFormApiOptions } from './gpt-image-form-params';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { resolveGraphModel } from './graph-model-routing';
import {
  type ReferenceImage,
  convertLegacyReferenceImage,
  processReferenceImages,
  isUrl,
  isBase64,
  compressImage,
  extractBase64FromDataUri,
} from './reference-image';
import {
  isUsableReferenceImageContent,
  downloadReferenceImageBuffer,
  referenceImageContentToDataUri,
  parseReferenceImageLocator,
} from '../../task/reference-image';
import {
  isExternallyFetchableReferenceUrl,
} from '../../storage/user-upload-url';
import { resolveReferenceImageForExternalProvider } from '../../task/reference-image-provider-url';
import type { RunBasicTextResult } from '../text/basic-text';
import { runTaskV2 } from '../../tasks/task-engine';
import type { TaskRunV2Request, TaskTemplate } from '../../tasks/types';
import { assertSupportedGraphPromptTextMode, resolveGraphPromptTextMode } from './graph-prompt-text';
import { formatTemplateValue, renderPromptFromTemplate } from '../../tasks/prompt-template';
import { orderGraphReferenceImageUrlsForEdit } from '../../tasks/graph-reference-slots';
import { formatNodeFetchError } from '../utils/format-node-fetch-error';
import { GraphPromptGenerationError } from './graph-prompt-errors';
import {
  applyGridPromptPipelineIfNeeded,
  wrapPromptGenerationRequestWithGrid,
  validateFormatPreservedPanels,
  buildContactSheetBriefing,
  TEXT_FORMAT_STRUCTURE_LOCK,
} from './grid';
import type { GridPromptPlan } from './grid';

/** 脚本或排障：打印发往 text/format 与生图前的完整中间态（勿在生产长期开启） */
function graphAuditStepsEnabled(): boolean {
  const v = process.env.GRAPH_AUDIT_STEPS;
  return v === '1' || v === 'true';
}

function summarizeImageParamsForAudit(imageParams: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(imageParams)) {
    if (k === 'prompt') {
      out[k] = typeof v === 'string' ? `(chars=${v.length})` : v;
    } else if (k === 'image_input' && Array.isArray(v)) {
      out[k] = (v as string[]).map((img, i) => {
        if (typeof img !== 'string') return { i, kind: 'non-string' };
        if (img.startsWith('data:')) return { i, kind: 'data-uri', chars: img.length };
        if (img.startsWith('http://') || img.startsWith('https://')) return { i, kind: 'url', url: img };
        return { i, kind: 'string', chars: img.length, head: img.slice(0, 64) };
      });
    } else if ((k === 'image_base64s' || k === 'images') && Array.isArray(v)) {
      out[k] = (v as unknown[]).map((x, i) => ({
        i,
        chars: typeof x === 'string' ? x.length : 0,
        head: typeof x === 'string' && x.startsWith('http') ? x.slice(0, 120) : undefined,
      }));
    } else if (k === 'image') {
      if (Array.isArray(v)) {
        out[k] = (v as string[]).map((x, i) => ({ i, chars: typeof x === 'string' ? x.length : 0 }));
      } else if (typeof v === 'string') {
        const s = v;
        out[k] = s.startsWith('data:') ? { kind: 'data-uri', chars: s.length } : { kind: 'string', chars: s.length };
      } else {
        out[k] = v;
      }
    } else if (k === 'image_input_meta') {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * AtlasCloud 生图：参考图需为公网可拉取的 URL；base64/内网 asset 先走 uploadMedia。
 */
async function atlasCloudUploadReferenceImagesAsPublicUrls(
  processedReferenceImages: ReferenceImage[],
  userId?: string
): Promise<string[]> {
  const { getFirstProviderKey } = await import('../providers');
  const apiKey = (await getFirstProviderKey('atlascloud')) ?? process.env.ATLASCLOUD_API_KEY;
  const base = String(process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai').replace(/\/+$/, '');
  if (!apiKey) throw new Error('AtlasCloud API Key 未配置：provider=atlascloud 或 ATLASCLOUD_API_KEY');

  const storageRepo = RepositoryFactory.createStorageRepository();
  const uploadToAtlasCloud = async (buf: Buffer, filename: string, contentType: string): Promise<string> => {
    const form = new FormData();
    const blob = new Blob([buf], { type: contentType });
    form.append('file', blob, filename);
    const uploadUrl = `${base}/api/v1/model/uploadMedia`;
    let resp: Response;
    try {
      resp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form as any,
      });
    } catch (e) {
      throw new Error(`AtlasCloud uploadMedia 网络异常: ${formatNodeFetchError(uploadUrl, e)}`);
    }
    const text = await resp.text().catch(() => '');
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
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
    const locator = parseReferenceImageLocator(c);
    if (locator?.kind === 'media-object' || locator?.kind === 'media-asset') {
      try {
        const externalUrl = await resolveReferenceImageForExternalProvider(c, userId);
        if (isExternallyFetchableReferenceUrl(externalUrl)) {
          return externalUrl;
        }
      } catch (e) {
        console.warn(
          '[GraphService] 参考图公网 URL 解析失败，回退 download+uploadMedia:',
          e instanceof Error ? e.message : e
        );
      }
      const { buffer, contentType, filename } = await downloadReferenceImageBuffer(c, userId);
      return uploadToAtlasCloud(buffer, filename || `ref_${ref.type || 'image'}.jpg`, contentType);
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
    throw new Error(`AtlasCloud 参考图无法解析: ${String(c).substring(0, 80)}`);
  };

  const atlasUrls: string[] = [];
  for (const ref of processedReferenceImages) atlasUrls.push(await toAtlasUrl(ref));
  return atlasUrls;
}

type OutputLanguage = 'zh' | 'en';

function detectOutputLanguage(userPrompt: string): OutputLanguage {
  // 简单规则：包含中文字符就输出中文，否则输出英文
  return /[\u4e00-\u9fff]/.test(userPrompt) ? 'zh' : 'en';
}

/** 不参与「用户选择的业务参数」文本拼装的字段（大图/参考图走生图侧，避免污染 text/format 输入） */
const GRAPH_BUSINESS_PARAM_DENY = new Set([
  'referenceImage',
  'subjectImage',
  'backgroundImage',
  'model_images',
  'clothing_images',
  'environment_images',
  /** design 子业务：产品参考 / Logo 走 referenceImage 合并，勿写入 text/format 参数列表 */
  'product_images',
  'logo_images',
  /** 任务展示名等 UI 元数据 */
  'metadata',
  /** Task V2 子业务键，仅用于加载 prompt 配置，勿写入 text/format 业务参数字符串 */
  'graphBusinessSubtype',
  'parallel_count',
  'parallel_index',
  'parallel_total',
  'parent_task_id',
]);

function isCoverImagePipeline(params: GraphRuntimeParams): boolean {
  return String(params.type ?? '').trim() === 'coverImage';
}

/**
 * 将请求 params 中除参考图槽位外的字段作为业务参数写入提示词拼装（字段集合由 deny 列表约束，业务语义由 DB 模板/rules 承担）。
 */
function extractBusinessParams(params: GraphRuntimeParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const p = params;
  for (const [key, value] of Object.entries(p)) {
    if (GRAPH_BUSINESS_PARAM_DENY.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  if (typeof out.aspect_ratio === 'string' && out.aspect_ratio.trim()) {
    out.aspect_ratio = formatTemplateValue('aspect_ratio', out.aspect_ratio);
  }
  return out;
}

/**
 * 构建发给 text/format（或其它 promptTextTaskKey）的拼装稿。
 *
 * 契约：当解析得到的 rules 正文为空时，**全文**由
 * `taskTemplate.prompt.unifiedTemplate` 插值后的 `params.prompt` 承担（含业务规则、知识占位、schema 字段与输出约定），
 * 本函数**不再**追加知识库块、业务参数列表、【输出要求】等任何段落。
 *
 * 仅当 rules 非空时保留旧式拼装（历史数据兼容；新配置应把规则写进 unified / text-format）。
 */
function buildPromptGenerationRequest(
  graphTaskKey: string,
  type: string,
  userPrompt: string,
  businessParams: Record<string, any>,
  knowledgeContext: string,
  outputLanguage: OutputLanguage,
  rules: string
): string {
  if (!rules?.trim()) {
    return (userPrompt ?? '').trim();
  }

  const businessParamsDesc = Object.entries(businessParams)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  let prompt = rules.trim();

  if (knowledgeContext) {
    prompt += `\n\n【知识库内容】\n${knowledgeContext}\n`;
    console.log(`[GraphService] 已添加知识库内容到提示词生成请求，长度: ${knowledgeContext.length} 字符`);
  } else {
    console.log('[GraphService] 未添加知识库内容（knowledgeContext 为空）');
  }

  if (businessParamsDesc) {
    prompt += `\n\n【用户选择的业务参数】\n${businessParamsDesc}\n`;
  }

  prompt += `\n\n【用户需求】\n${userPrompt}\n`;

  const languageHint = outputLanguage === 'zh' ? '中文' : '英文';
  prompt += `\n\n【输出要求】\n- 输出语言：${languageHint}\n- 只输出最终图片生成提示词本身，不要包含其他说明文字：`;

  return prompt;
}

/**
 * 知识库召回结果元数据
 */
export interface KnowledgeRecallMetadata {
  source: 'knowledge_base';
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
 * 生成 Graph 提示词（返回提示词和召回元数据）
 * @param graphTaskKey `scope=graph` 的任务 taskKey（与 DB 任务定义一致）
 */
export async function generateGraphPrompt(
  graphTaskKey: string,
  params: GraphRuntimeParams,
  userId?: string,
  provider?: ProviderType,
  parentTaskId?: string,
  taskMetadata?: Record<string, unknown>
): Promise<{
  prompt: string;
  /** text scope / useConfiguredPrompt 输出经 trim 去引号后、尚未拼接参考图前缀的文案（便于对照 format转换结果） */
  promptTextFormatOnly: string;
  knowledgeRecallMetadata?: KnowledgeRecallMetadata;
  /** BasicText: writing-basic-text 的用量记录（已完成 Provider 扣费） */
  promptGenerationUsage?: { mediaUrls: string[]; metadata?: Record<string, any> };
  /** BasicText: writing-basic-text 的 Provider 成本（USD），供用户侧 Billing 使用 */
  promptGenerationCostUsd?: number;
  gridPromptPlan?: GridPromptPlan;
  frozenParamsHash?: string;
}> {
  const paramsRec = params as Record<string, unknown>;
  const type = paramsRec.type;
  const userPrompt = typeof params.prompt === 'string' ? params.prompt : String(params.prompt ?? '');
  /** Task V2 的 subtype（如 productposter、taobaonvzhuang-2）；与 design 管线里的 params.type（poster/3d）不是同一概念 */
  const graphBusinessSubtype =
    typeof paramsRec.graphBusinessSubtype === 'string' && paramsRec.graphBusinessSubtype.trim()
      ? String(paramsRec.graphBusinessSubtype).trim()
      : null;
  const pipelineTypeStr = typeof type === 'string' ? type.trim() : String(type ?? '').trim();
  const promptConfigSubtype = graphBusinessSubtype ?? (pipelineTypeStr ? pipelineTypeStr : null);

  /** 供宫格 preset（x-enum-prompt-append）解析 */
  let graphFormSchema: { properties?: Record<string, unknown> } | undefined;
  /** 执行期重插 unifiedTemplate（勿仅用落库 params.prompt） */
  let graphTaskTemplate: TaskTemplate | null = null;

  // 与 TaskV2 一致：空 referenceImage 时从表单各 referenceImages 槽位合并；仅合并 reference 时拆回槽位（供审计与部分客户端）
  try {
    const { loadTaskDefinition } = await import('../../tasks/task-definition');
    const {
      applyFormSchemaDefaults,
      mergeGraphReferenceImageFromFormSlots,
      hydrateGraphImageSlotParamsFromReferenceImage,
    } = await import('../../tasks/graph-reference-slots');
    const { template } = await loadTaskDefinition({
      scope: 'graph',
      taskKey: graphTaskKey,
      subtype: promptConfigSubtype,
      lang: 'zh',
    });
    graphTaskTemplate = template;
    if (template?.formSchema) {
      graphFormSchema = template.formSchema as { properties?: Record<string, unknown> };
      const p = params as Record<string, any>;
      mergeGraphReferenceImageFromFormSlots(p, graphFormSchema);
      hydrateGraphImageSlotParamsFromReferenceImage(p, graphFormSchema);
      mergeGraphReferenceImageFromFormSlots(p, graphFormSchema);
      applyFormSchemaDefaults(p, graphFormSchema);
    }
  } catch (e) {
    console.warn('[GraphService] graph reference slot merge/hydrate skipped:', e instanceof Error ? e.message : e);
  }

  // 1. 提取业务参数（不含 referenceImage 等，由 DB rules + 生图链路表达）
  const businessParams = extractBusinessParams(params);

  const knowledgeContext = '';
  const knowledgeRecallMetadata: KnowledgeRecallMetadata | null = null;

  // 2.6 处理参考图（供 generateGraphImage；不拼进 text/format 输入）
  let processedReferenceImages: ReferenceImage[] = [];
  
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
    
    processedReferenceImages = processedReferenceImages.filter((ref) =>
      isUsableReferenceImageContent(ref.content)
    );
    // 将处理后的参考图保存回 params，供后续 generateGraphImage 使用
    (params as any).referenceImage = processedReferenceImages;
  }
  
  // coverImage：合并 subjectImage / backgroundImage 到参考图列表（管线 type 由表单决定，不限定 graph 大类）
  if (isCoverImagePipeline(params)) {
    const p = params as Record<string, any>;

    if (p.subjectImage) {
      let processedSubjectImages: ReferenceImage[] = [];
      if (typeof p.subjectImage === 'string') {
        processedSubjectImages = convertLegacyReferenceImage(p.subjectImage);
      } else if (Array.isArray(p.subjectImage)) {
        if (p.subjectImage.length > 0 && typeof p.subjectImage[0] === 'string') {
          processedSubjectImages = convertLegacyReferenceImage(p.subjectImage as string[]);
        } else {
          processedSubjectImages = p.subjectImage as ReferenceImage[];
        }
      } else {
        processedSubjectImages = [p.subjectImage as ReferenceImage];
      }
      
      // 将主体图片合并到参考图列表中（标记为 subject）
      processedSubjectImages.forEach(img => {
        (img as any).role = 'subject'; // 标记为主体图片
      });
      processedReferenceImages = [...processedReferenceImages, ...processedSubjectImages];
      p.subjectImage = processedSubjectImages;
      
      console.log(`[GraphService] 主体图片处理完成 (${processedSubjectImages.length} 张)`);
    }
    
    if (p.backgroundImage) {
      let processedBackgroundImages: ReferenceImage[] = [];
      if (typeof p.backgroundImage === 'string') {
        processedBackgroundImages = convertLegacyReferenceImage(p.backgroundImage);
      } else if (Array.isArray(p.backgroundImage)) {
        if (p.backgroundImage.length > 0 && typeof p.backgroundImage[0] === 'string') {
          processedBackgroundImages = convertLegacyReferenceImage(p.backgroundImage as string[]);
        } else {
          processedBackgroundImages = p.backgroundImage as ReferenceImage[];
        }
      } else {
        processedBackgroundImages = [p.backgroundImage as ReferenceImage];
      }
      
      // 将背景图片合并到参考图列表中（标记为 background）
      processedBackgroundImages.forEach(img => {
        (img as any).role = 'background'; // 标记为背景图片
      });
      processedReferenceImages = [...processedReferenceImages, ...processedBackgroundImages];
      p.backgroundImage = processedBackgroundImages;
      
      console.log(`[GraphService] 背景图片处理完成 (${processedBackgroundImages.length} 张)`);
    }
    
    // 更新 processedReferenceImages 到 params
    if (processedReferenceImages.length > 0) {
      (params as any).referenceImage = processedReferenceImages;
    }
  }

  // 2.7 用户需求：优先用「当前 params + DB unifiedTemplate」重算正文；落库 params.prompt 仅为创建时快照，可能与合并参考图/Admin 更新不同步
  let effectiveUserPrompt = (userPrompt ?? '').trim();
  if (graphTaskTemplate?.prompt?.unifiedTemplate?.trim()) {
    try {
      const { finalPrompt: renderedUnified } = renderPromptFromTemplate({
        prompt: graphTaskTemplate.prompt,
        paramsSchema: graphTaskTemplate.formSchema,
        params: params as Record<string, unknown>,
        contextVars: {
          userId: userId ?? '',
          taskId: parentTaskId ?? '',
          uuid: '',
          timestamp: Date.now(),
          date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          subtype: graphBusinessSubtype ?? '',
        },
      });
      const t = renderedUnified.trim();
      if (t.length > 0) {
        effectiveUserPrompt = t;
      }
    } catch (e) {
      console.warn(
        '[GraphService] unifiedTemplate 执行期重算失败，回退 params.prompt:',
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // 2.5 输出语言与 text/format 配置：在 effective briefing 确定后再判中/英（执行期 unified 优先于落库 prompt）
  const outputLanguage = detectOutputLanguage(effectiveUserPrompt || userPrompt || '');
  const lang = outputLanguage === 'zh' ? 'zh' : 'en';

  const promptConfig = await getPromptFullConfig('graph', graphTaskKey, promptConfigSubtype, lang);
  const graphPromptTextMode = resolveGraphPromptTextMode(promptConfig);
  assertSupportedGraphPromptTextMode(graphPromptTextMode);

  if (promptConfig?.use_knowledge === true) {
    throw new Error(
      'graph 的 prompt_engineering_config.extra.use_knowledge=true 已不再由 graph-service 执行类型化知识库检索。' +
        '请将所需上下文写入 unifiedTemplate（或关闭 use_knowledge）。'
    );
  }

  let gridPromptPlan: GridPromptPlan | undefined;
  let frozenParamsHash: string | undefined;
  const paramsRecord = params as Record<string, unknown>;
  try {
    const gridPipeline = await applyGridPromptPipelineIfNeeded({
      params: paramsRecord,
      formSchema: graphFormSchema,
      effectiveUserPrompt,
      parentTaskId,
      userId,
      metadata: taskMetadata,
    });
    if (gridPipeline) {
      gridPromptPlan = gridPipeline.plan;
      frozenParamsHash = gridPipeline.plan.frozenParamsHash;
    }
  } catch (gridErr) {
    if (gridErr instanceof GraphPromptGenerationError) throw gridErr;
    throw new GraphPromptGenerationError(
      `宫格 Prompt 规划失败: ${gridErr instanceof Error ? gridErr.message : String(gridErr)}`,
      { phase: 'prompt_generation', cause: 'grid_pipeline' }
    );
  }

  // 3. 解析规则（仅 DB）并构建提示词生成请求
  const rules = await getGraphRulesResolved(
    graphTaskKey,
    String(promptConfigSubtype ?? pipelineTypeStr),
    outputLanguage === 'zh' ? 'zh' : 'en'
  );
  let promptGenerationRequest = buildPromptGenerationRequest(
    graphTaskKey,
    pipelineTypeStr,
    effectiveUserPrompt,
    businessParams,
    knowledgeContext,
    outputLanguage,
    rules
  );

  if (gridPromptPlan) {
    promptGenerationRequest = wrapPromptGenerationRequestWithGrid(
      promptGenerationRequest,
      buildContactSheetBriefing(gridPromptPlan)
    );
  }

  if (graphAuditStepsEnabled()) {
    console.log(`[GraphService][AUDIT] step=business_params JSON=${JSON.stringify(businessParams)}`);
    console.log(`[GraphService][AUDIT] step=effective_user_prompt\n${effectiveUserPrompt || '(empty)'}`);
    console.log(`[GraphService][AUDIT] step=graph_rules_len=${rules.length}`);
    console.log(`[GraphService][AUDIT] step=graph_rules_body\n${rules}`);
    console.log(`[GraphService][AUDIT] step=prompt_generation_request_len=${promptGenerationRequest.length}`);
    console.log(`[GraphService][AUDIT] step=prompt_generation_request_body\n${promptGenerationRequest}`);
  }

  // 添加调试日志，方便查看实际发送给大模型的提示词
  console.log(
    `[GraphService] 提示词生成开始 (graphTaskKey: ${graphTaskKey}, pipelineType: ${pipelineTypeStr || '(empty)'}, outputLanguage: ${outputLanguage}, userId: ${userId || 'anonymous'})`
  );
  console.log(`[GraphService] 使用规则前缀: ${rules.substring(0, 180)}${rules.length > 180 ? '...' : ''}`);
  console.log(`[GraphService] 业务参数:`, businessParams);
  console.log(`[GraphService] 提示词生成请求前缀: ${promptGenerationRequest.substring(0, 500)}${promptGenerationRequest.length > 500 ? '...' : ''}`);

  // 4. 调用 text scope 生成提示词（Business Pipeline 已在 task-engine pre 阶段完成时跳过）
  const promptTextTaskKey = promptConfig?.promptTextTaskKey;
  const paramsRecordForPipeline = params as Record<string, unknown>;
  const graphPipelineFormatted =
    paramsRecordForPipeline.graphPipelineFormatted === true &&
    typeof paramsRecordForPipeline.prompt === 'string' &&
    paramsRecordForPipeline.prompt.trim().length > 0;

  let generatedPrompt: string;
  let promptGenerationUsage: RunBasicTextResult['usage'] | undefined;
  let promptGenerationCostUsd: number | undefined;

  if (graphPipelineFormatted) {
    generatedPrompt = String(paramsRecordForPipeline.prompt).trim();
    console.log(
      `[GraphService] 使用 Business Pipeline 预生成的 prompt（跳过 promptTextTaskKey 内联调用），长度=${generatedPrompt.length}`
    );
  } else if (promptTextTaskKey) {
    // 动态调用 text scope
    // promptTextTaskKey 格式: "text/format/nano-banana-format" -> scope=text, taskKey=format, subtype=nano-banana-format
    const textTaskKeyParts = (promptTextTaskKey || '').split('/');
    const textScope = textTaskKeyParts[0] || 'text';
    const textTaskKey = textTaskKeyParts[1] || '';
    const textSubtype = textTaskKeyParts.slice(2).join('/') || null;

    console.log(
      `[GraphService] 使用 text scope 生成提示词: scope=${textScope}, taskKey=${textTaskKey}, subtype=${textSubtype}, userId=${userId || 'anonymous'}`
    );

    if (!userId) {
      throw new GraphPromptGenerationError(
        `graph 业务 (${graphTaskKey}/${pipelineTypeStr || '?'}) 配置了 promptTextTaskKey=${promptTextTaskKey}，但缺少 userId。` +
          `text scope 调用需要 userId 来进行余额预检和用量记录。请确保 graph-task 有有效的 userId。`,
        {
          phase: 'prompt_text_task',
          promptTextTaskKey,
          graphTaskKey,
          graphSubtype: pipelineTypeStr || null,
        }
      );
    }

    if (!textTaskKey) {
      throw new GraphPromptGenerationError(
        `graph 业务 (${graphTaskKey}/${pipelineTypeStr || '?'}) 配置的 promptTextTaskKey=${promptTextTaskKey} 格式无效，无法解析出 taskKey。`,
        {
          phase: 'prompt_text_task',
          promptTextTaskKey,
          graphTaskKey,
          graphSubtype: pipelineTypeStr || null,
        }
      );
    }

    // text/format 易「套模板」偏题：前置硬约束，避免丢掉表单里的品名/价格/场景，或擅自改成无关 stock 场景
    const textFormatParts = [
      '[TEXT_FORMAT_LOCK]',
      'The following block is the ONLY briefing. Output ONE English image prompt.',
      '- Read the ENTIRE briefing before writing. Compress by analyzing and merging facts—not by truncating the opening or dropping later sections.',
      '- Preserve every product name, headline, price line, CTA, aspect ratio, module/service name (architecture), and layout named in the briefing as explicit instructions.',
      '- Do NOT replace the product, host/character, or scene with unrelated clichés unless the briefing explicitly names that scene.',
      '- Reference pixels are attached out-of-band: honor identity lock / product lock from the briefing and reference summaries; do not invent a different face or SKU.',
      '- Never emit "avoid text", "no text", "without typography", or similar if the briefing requires on-image copy.',
      '[/TEXT_FORMAT_LOCK]',
    ];
    if (gridPromptPlan) {
      textFormatParts.push('', TEXT_FORMAT_STRUCTURE_LOCK);
    }
    textFormatParts.push('', promptGenerationRequest);
    const textFormatPrompt = textFormatParts.join('\n');

    const textTaskRequest: TaskRunV2Request = {
      scope: textScope as 'text',
      taskKey: textTaskKey,
      subtype: textSubtype,
      params: { prompt: textFormatPrompt },
    };

    if (graphAuditStepsEnabled()) {
      console.log(
        `[GraphService][AUDIT] step=runTaskV2_text JSON=${JSON.stringify({
          scope: textTaskRequest.scope,
          taskKey: textTaskRequest.taskKey,
          subtype: textTaskRequest.subtype,
          paramsPromptLen: String((textTaskRequest.params as { prompt?: string })?.prompt ?? '').length,
        })}`
      );
    }

    const textTaskResult = await runTaskV2(textTaskRequest, userId);

    if (!textTaskResult.success) {
      throw new GraphPromptGenerationError(
        `text scope 调用失败：taskKey=${promptTextTaskKey}, graph业务=${graphTaskKey}/${pipelineTypeStr || '?'}。` +
          `请检查该 text 业务是否已正确配置（task definitions + model routing）。`,
        {
          phase: 'prompt_text_task',
          promptTextTaskKey,
          textScope,
          textTaskKey,
          textSubtype,
          graphTaskKey,
          graphSubtype: pipelineTypeStr || null,
          nestedTaskId: textTaskResult.taskId,
          cause: 'runTaskV2 returned success=false',
        }
      );
    }

    if (!textTaskResult.syncResult) {
      throw new GraphPromptGenerationError(
        `text scope 返回结构异常：taskKey=${promptTextTaskKey}, graph业务=${graphTaskKey}/${pipelineTypeStr || '?'}。` +
          `期望 syncResult 存在（scope=text 为同步执行）。` +
          `实际 status=${textTaskResult.status}, taskId=${textTaskResult.taskId}。` +
          `若 MXMCGI_ROLE=api，请确保 worker 进程已启动；嵌套 text 在 api 模式下不应走异步队列。`,
        {
          phase: 'prompt_text_task',
          promptTextTaskKey,
          textScope,
          textTaskKey,
          textSubtype,
          graphTaskKey,
          graphSubtype: pipelineTypeStr || null,
          nestedTaskId: textTaskResult.taskId,
          cause: 'missing syncResult',
        }
      );
    }

    const textResultMetadata = textTaskResult.syncResult.metadata ?? {};
    generatedPrompt = textTaskResult.syncResult.text ?? '';
    promptGenerationUsage = (textResultMetadata.usage ?? textResultMetadata.usageMeta) as typeof promptGenerationUsage;
    promptGenerationCostUsd = typeof textResultMetadata.costUsd === 'number' ? textResultMetadata.costUsd : undefined;

    console.log(
      `[GraphService] text scope 生成完成: taskKey=${promptTextTaskKey}, prompt长度=${generatedPrompt.length}, costUsd=${promptGenerationCostUsd}`
    );
  } else {
    // 未配置 promptTextTaskKey，显式报错（不走旧写死逻辑）
    throw new GraphPromptGenerationError(
      `graph 业务 (${graphTaskKey}/${pipelineTypeStr || '?'}) 未配置 promptTextTaskKey，无法生成 prompt。` +
        `请在 Admin「Prompt」Tab 中选择该 graph 业务关联的 text 格式业务（如 text/format/nano-banana-format）。`,
      {
        phase: 'prompt_config',
        graphTaskKey,
        graphSubtype: pipelineTypeStr || null,
      }
    );
  }

  console.log(`[GraphService] 生成的提示词前缀: ${generatedPrompt.substring(0, 220)}${generatedPrompt.length > 220 ? '...' : ''}`);

  // 清理生成的提示词（移除可能的引号、多余的空格等）
  let cleanedPrompt = generatedPrompt.trim().replace(/^["']|["']$/g, '');

  if (gridPromptPlan && !validateFormatPreservedPanels(cleanedPrompt, gridPromptPlan.totalCells)) {
    console.warn(
      `[GraphService] text/format 未保留 ${gridPromptPlan.totalCells} 个 Panel，回退平台 contact sheet 英文`
    );
    cleanedPrompt = gridPromptPlan.contactSheetPromptEn;
  }

  // 2.8 V2 契约：Graph prompt（含参考图摘要/审美/知识/约束）应在 text/format 之前完成拼装，
  // text/format 输出即为最终可用于生图的 prompt。此处不再进行二次拼接，避免职责漂移。
  const finalPrompt = cleanedPrompt;

  if (!finalPrompt.trim()) {
    throw new GraphPromptGenerationError(
      `text/format 返回空 prompt（taskKey=${promptTextTaskKey ?? '?'}）。` +
        `请检查 text 业务路由的 provider/model 是否可用（如 maxplan 需 upstream=MiniMax-M3）。` +
        `空 prompt 会导致下游 Atlas/gpt-image 报 Missing required parameter: prompt。`,
      {
        phase: 'prompt_text_task',
        promptTextTaskKey,
        graphTaskKey,
        graphSubtype: pipelineTypeStr || null,
        cause: 'empty_format_output',
      },
    );
  }

  // 返回最终拼装后的提示词和召回元数据（如果存在）
  return {
    prompt: finalPrompt,
    promptTextFormatOnly: cleanedPrompt,
    knowledgeRecallMetadata: knowledgeRecallMetadata || undefined,
    promptGenerationUsage,
    promptGenerationCostUsd,
    gridPromptPlan,
    frozenParamsHash,
  };
}

/**
 * 生成 Graph 图片
 * @param graphTaskKey `scope=graph` 的任务 taskKey（与 DB 任务定义一致）
 */
export async function generateGraphImage(
  graphTaskKey: string,
  params: GraphRuntimeParams,
  generatedPrompt: string,
  provider?: ProviderType,
  userId?: string
): Promise<{ image_urls: string[]; modelName: string; deerapiImagePrompt: string }> {
  /** 与 generateGraphPrompt 一致：路由键用 Task V2 的 graphBusinessSubtype，勿误用表单里的管线 type（如 design 的 poster/3d） */
  const paramsRec = params as Record<string, unknown>;
  const graphBusinessSubtype =
    typeof paramsRec.graphBusinessSubtype === 'string' && paramsRec.graphBusinessSubtype.trim()
      ? String(paramsRec.graphBusinessSubtype).trim()
      : null;
  const pipelineType = paramsRec.type;
  const routingSubType =
    graphBusinessSubtype ??
    (typeof pipelineType === 'string' && pipelineType.trim() ? pipelineType.trim() : 'default');

  // 与 generateGraphPrompt 对齐再合并一次：生图阶段若 referenceImage 丢失而各 referenceImages 槽位仍有 URL，
  // 部分 provider 会走无图 text-to-image，参考像素不进请求。
  let graphFormSchemaForRefOrder: { properties?: Record<string, unknown> } | undefined;
  try {
    const { loadTaskDefinition } = await import('../../tasks/task-definition');
    const {
      mergeGraphReferenceImageFromFormSlots,
      hydrateGraphImageSlotParamsFromReferenceImage,
      applyFormSchemaDefaults,
    } = await import('../../tasks/graph-reference-slots');
    const { template } = await loadTaskDefinition({
      scope: 'graph',
      taskKey: graphTaskKey,
      subtype: routingSubType,
      lang: 'zh',
    });
    if (template?.formSchema) {
      const p = params as Record<string, any>;
      const fs = template.formSchema as { properties?: Record<string, unknown> };
      graphFormSchemaForRefOrder = fs;
      mergeGraphReferenceImageFromFormSlots(p, fs);
      hydrateGraphImageSlotParamsFromReferenceImage(p, fs);
      mergeGraphReferenceImageFromFormSlots(p, fs);
      applyFormSchemaDefaults(p, fs);
    }
  } catch (e) {
    console.warn('[GraphService] generateGraphImage 参考图槽位再合并跳过:', e instanceof Error ? e.message : e);
  }

  const { referenceImage, aspect_ratio } = params as Record<string, any>;

  const effectiveAspectRatio = aspect_ratio;

  // 根据业务配置解析模型
  const { modelName, provider: resolvedProvider } = await resolveGraphModel(
    graphTaskKey,
    routingSubType,
    provider
  );

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
    imageParams.image_size = '4K';
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
  
  if (isCoverImagePipeline(params)) {
    const p = params as Record<string, any>;
    if (p.subjectImage) {
      let processedSubjectImages: ReferenceImage[] = [];
      if (typeof p.subjectImage === 'string') {
        processedSubjectImages = convertLegacyReferenceImage(p.subjectImage);
      } else if (Array.isArray(p.subjectImage)) {
        if (p.subjectImage.length > 0 && typeof p.subjectImage[0] === 'string') {
          processedSubjectImages = convertLegacyReferenceImage(p.subjectImage as string[]);
        } else {
          processedSubjectImages = p.subjectImage as ReferenceImage[];
        }
      } else {
        processedSubjectImages = [p.subjectImage as ReferenceImage];
      }
      allReferenceImages = [...allReferenceImages, ...processedSubjectImages];
    }
    if (p.backgroundImage) {
      let processedBackgroundImages: ReferenceImage[] = [];
      if (typeof p.backgroundImage === 'string') {
        processedBackgroundImages = convertLegacyReferenceImage(p.backgroundImage);
      } else if (Array.isArray(p.backgroundImage)) {
        if (p.backgroundImage.length > 0 && typeof p.backgroundImage[0] === 'string') {
          processedBackgroundImages = convertLegacyReferenceImage(p.backgroundImage as string[]);
        } else {
          processedBackgroundImages = p.backgroundImage as ReferenceImage[];
        }
      } else {
        processedBackgroundImages = [p.backgroundImage as ReferenceImage];
      }
      allReferenceImages = [...allReferenceImages, ...processedBackgroundImages];
    }
  }
  
  // 使用合并后的所有参考图
  if (allReferenceImages.length > 0) {
    const processedReferenceImages = allReferenceImages;
    
    if (processedReferenceImages.length > 0) {
      // 处理参考图，转换为模型可接受的格式
      const { urls, base64s } = processReferenceImages(processedReferenceImages, modelName);
      
      console.log(`[GraphService] 处理参考图: ${processedReferenceImages.length} 张, URLs: ${urls.length}, Base64s: ${base64s.length}`);
      
      if (modelName === 'nano-banana-pro') {
        const imageInputs: string[] = [];
        for (const ref of processedReferenceImages) {
          const c = ref.content;
          if (isBase64(c)) {
            imageInputs.push(c);
            continue;
          }
          if (isUrl(c) || parseReferenceImageLocator(c)) {
            const dataUri = await referenceImageContentToDataUri(c, userId);
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
      } else if (
        modelName === 'nano-banana-2' ||
        modelName === 'nano-banana-2-pro' ||
        (typeof modelName === 'string' &&
          modelName.startsWith('gpt-image') &&
          (resolvedProvider === 'atlascloud' ||
            resolvedProvider === 'deer' ||
            resolvedProvider === 'qhai' ||
            resolvedProvider === 'jiekou' ||
            resolvedProvider === 'openrouter'))
      ) {
        // nano-banana-2 / gpt-image：参考图处理
        // - qhai/jiekou：generations 或 v3 + reference_images
        // - deer：/images/edits（已下架）
        // - openrouter：chat/completions + modalities + 多模态 input（如 openai/gpt-5-image）
        // - atlascloud：参考图上传为公网 URL

        if (
          resolvedProvider === 'deer' ||
          resolvedProvider === 'qhai' ||
          resolvedProvider === 'jiekou' ||
          resolvedProvider === 'openrouter'
        ) {
          const imageInputs: string[] = [];
          for (const ref of processedReferenceImages) {
            const c = ref.content;
            if (isBase64(c)) {
              imageInputs.push(c);
              continue;
            }
            if (isUrl(c) || parseReferenceImageLocator(c)) {
              const dataUri = await referenceImageContentToDataUri(c, userId);
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
          const atlasUrls = await atlasCloudUploadReferenceImagesAsPublicUrls(
            processedReferenceImages,
            userId
          );
          if (atlasUrls.length > 0) {
            const orderedUrls = orderGraphReferenceImageUrlsForEdit(
              processedReferenceImages as Array<{ groupKey?: string; type?: string }>,
              atlasUrls,
              graphFormSchemaForRefOrder
            );
            imageParams.images = orderedUrls.slice(0, 14);
            // Atlas /edit：请求体以 images[] 为主；AtlasCloudProvider.buildGenerateBody 会在缺省时把 image 设为 images[0]。
            // 若此处再把 image 指到服饰，上游往往只消费主图，导致「模特参考不生效、多图像没区分」。
            if (String(modelName).startsWith('gpt-image')) {
              delete imageParams.image;
              console.log(
                `[GraphService] Atlas gpt-image：参考图已按 formSchema 槽位顺序上传，共 ${imageParams.images.length} 张 URL`
              );
            }
          }
        } else {
          // 其他 provider：不做特殊处理（保持现有逻辑）；用户可切换 provider 或改用 Base64
        }
      } else {
        // seedream-4/5 使用 image_input 数组（支持 URL 和 base64）
        const imageInput: string[] = [];
        const imageInputMeta: Array<{ groupKey?: string; type?: string; purpose?: string }> = [];

        // URL 输入（保持与 processedReferenceImages 的相对顺序一致）
        for (const ref of processedReferenceImages) {
          if (!isUrl(ref.content) && !parseReferenceImageLocator(ref.content)) continue;
          imageInput.push(ref.content);
          imageInputMeta.push({
            groupKey: (ref as any).groupKey,
            type: (ref as any).type,
            purpose: (ref as any).purpose,
          });
        }
        
        // seedream-4/5 需要完整的 data URI 格式
        // 对于 Base64 图片，如果太大则自动压缩
        console.log(`[GraphService] 处理 ${modelName} 参考图，开始压缩大图片...`);
        for (const ref of processedReferenceImages) {
          if (isUrl(ref.content) || parseReferenceImageLocator(ref.content)) {
            // URL / Gateway 代理路径已经在 imageInput 中，跳过
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
            imageInputMeta.push({
              groupKey: (ref as any).groupKey,
              type: (ref as any).type,
              purpose: (ref as any).purpose,
            });
          }
        }
        
        // 根据文档，Seedream 使用 'image' 参数
        if (imageInput.length > 0) {
          imageParams.image = imageInput;
        }
        imageParams.image_input = imageInput;
        // 供 deer/openai edits 调试与 filename 标记使用（不影响其他 provider）
        (imageParams as any).image_input_meta = imageInputMeta;
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
    if (graphAuditStepsEnabled()) {
      console.log(
        `[GraphService][AUDIT] step=image_params_summary JSON=${JSON.stringify(summarizeImageParamsForAudit(imageParams as Record<string, unknown>))}`
      );
      console.log(`[GraphService][AUDIT] step=image_prompt_body\n${String(imageParams.prompt ?? '')}`);
    }
    console.log(`[GraphService] 调用模型 ${modelName} (provider=${resolvedProvider}) 生成图片...`);
    applyGptImageFormApiOptions(imageParams, params as Record<string, unknown>, modelName, {
      provider: resolvedProvider,
    });
    const result = await runByModelKey('graph', modelName, imageParams, {
      providerOverride: resolvedProvider,
    }) as { image_urls?: string[]; mediaUrls?: string[] };
    const urls = result.image_urls ?? result.mediaUrls ?? [];
    console.log(`[GraphService] ${modelName} 生成完成，图片数量: ${urls.length}`);
    return { image_urls: urls, modelName, deerapiImagePrompt: String(imageParams.prompt ?? generatedPrompt) };
  } catch (error) {
    console.error(`[GraphService] 模型 ${modelName} 生成失败:`, error);
    throw error;
  }
}
