/**
 * 从 pipeline.pre 抽取 C 端创建引导配置（交互卡字段 + pre 联网检索参数）。
 */
import type { BusinessPipelineConfig, PipelineStep } from './types';

export type CreateGuideInteractiveCardField = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  default?: string | number | boolean;
  'x-ui'?: string;
  [k: string]: unknown;
};

export type CreateGuide = {
  interactiveCard: {
    label?: string;
    hint?: string;
    postPreHint?: string;
    fields: CreateGuideInteractiveCardField[];
  } | null;
  webSearch: {
    /** 显式：pre 后在 C 端跑话题预览；未写时由前端按 topicCount / topicExtractTextKey 推断 */
    clientPreview?: boolean;
    maxResults?: number;
    depth?: string;
    topicExtractTextKey?: string;
    topicCount?: number;
  } | null;
};

function asField(raw: unknown): CreateGuideInteractiveCardField | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  if (!name) return null;
  const field: CreateGuideInteractiveCardField = { name };
  if (typeof o.type === 'string') field.type = o.type;
  if (typeof o.title === 'string') field.title = o.title;
  if (typeof o.description === 'string') field.description = o.description;
  if (typeof o.required === 'boolean') field.required = o.required;
  if (Array.isArray(o.enum)) field.enum = o.enum.map(String);
  if (typeof o.default === 'string' || typeof o.default === 'number' || typeof o.default === 'boolean') {
    field.default = o.default;
  }
  if (typeof o['x-ui'] === 'string') field['x-ui'] = o['x-ui'];
  for (const [k, v] of Object.entries(o)) {
    if (k in field || k === 'name') continue;
    field[k] = v;
  }
  return field;
}

function findPreWebSearch(steps: PipelineStep[]): PipelineStep | null {
  for (const step of steps) {
    if (String(step?.step || '') !== 'webSearch') continue;
    const target = String(step.params?.target ?? 'sources.websource').trim();
    if (target === 'sources.websource' || target === '') return step;
  }
  return null;
}

function findInteractiveCard(steps: PipelineStep[]): PipelineStep | null {
  for (const step of steps) {
    if (String(step?.step || '') === 'interactiveCard') return step;
  }
  return null;
}

/** 从 TaskTemplate.pipeline 抽取 createGuide；无 pre 闸门时返回空结构 */
export function extractCreateGuide(
  pipeline: BusinessPipelineConfig | undefined | null
): CreateGuide {
  const pre = Array.isArray(pipeline?.pre) ? pipeline!.pre! : [];
  const cardStep = findInteractiveCard(pre);
  const searchStep = findPreWebSearch(pre);

  let interactiveCard: CreateGuide['interactiveCard'] = null;
  if (cardStep) {
    const p = (cardStep.params ?? {}) as Record<string, unknown>;
    const rawFields = Array.isArray(p.fields) ? p.fields : [];
    const fields = rawFields.map(asField).filter((f): f is CreateGuideInteractiveCardField => !!f);
    interactiveCard = {
      label: typeof p.label === 'string' ? p.label : undefined,
      hint: typeof p.hint === 'string' ? p.hint : undefined,
      postPreHint: typeof p.postPreHint === 'string' ? p.postPreHint : undefined,
      fields,
    };
  }

  let webSearch: CreateGuide['webSearch'] = null;
  if (searchStep) {
    const p = (searchStep.params ?? {}) as Record<string, unknown>;
    const maxResults =
      typeof p.maxResults === 'number' && Number.isFinite(p.maxResults)
        ? Math.max(1, Math.min(200, Math.floor(p.maxResults)))
        : undefined;
    // 优先独立热点提取节点的 textKey；兼容旧 webSearch.topicExtractTextKey
    let topicExtractTextKey =
      typeof p.topicExtractTextKey === 'string' ? p.topicExtractTextKey.trim() || undefined : undefined;
    for (const step of pre) {
      if (String(step?.step || '') !== 'extractHotTopics') continue;
      const sp = (step.params ?? {}) as Record<string, unknown>;
      const key = String(sp.textKey ?? (step as { nestedTextTaskKey?: string }).nestedTextTaskKey ?? '').trim();
      if (key.startsWith('text/')) {
        topicExtractTextKey = key;
        break;
      }
      // 有 extractHotTopics 但未写 textKey：仍标记需要客户端预览，具体 key 由运行时再定
      if (!topicExtractTextKey) topicExtractTextKey = 'text/expert/industry-hot-topics';
      break;
    }
    const clientPreview =
      typeof p.clientPreview === 'boolean'
        ? p.clientPreview
        : typeof (p as { client_preview?: unknown }).client_preview === 'boolean'
          ? Boolean((p as { client_preview?: unknown }).client_preview)
          : undefined;
    const topicCountRaw = p.topicCount ?? p.topic_count;
    const topicCount =
      typeof topicCountRaw === 'number' && Number.isFinite(topicCountRaw)
        ? Math.max(1, Math.min(50, Math.floor(topicCountRaw)))
        : undefined;
    webSearch = {
      ...(clientPreview !== undefined ? { clientPreview } : {}),
      maxResults,
      depth: typeof p.depth === 'string' ? p.depth : undefined,
      topicExtractTextKey,
      ...(topicCount !== undefined ? { topicCount } : {}),
    };
  }

  return { interactiveCard, webSearch };
}

/**
 * 合并 pipeline 抽取结果与 taskTemplate.createGuide 显式配置。
 * pipeline 字段优先；createGuide 补充 postPreHint / clientPreview / topicCount 等。
 */
export function mergeCreateGuide(
  fromPipeline: CreateGuide,
  fromTemplate: unknown
): CreateGuide {
  if (!fromTemplate || typeof fromTemplate !== 'object' || Array.isArray(fromTemplate)) {
    return fromPipeline;
  }
  const t = fromTemplate as {
    interactiveCard?: {
      label?: string;
      hint?: string;
      postPreHint?: string;
      fields?: unknown[];
    } | null;
    webSearch?: {
      clientPreview?: boolean;
      maxResults?: number;
      depth?: string;
      topicExtractTextKey?: string;
      topicCount?: number;
    } | null;
  };

  const tCard = t.interactiveCard;
  const pCard = fromPipeline.interactiveCard;
  let interactiveCard: CreateGuide['interactiveCard'] = null;
  if (pCard || tCard) {
    const tFields = Array.isArray(tCard?.fields)
      ? tCard!.fields.map(asField).filter((f): f is CreateGuideInteractiveCardField => !!f)
      : [];
    interactiveCard = {
      label: pCard?.label || tCard?.label,
      hint: pCard?.hint || tCard?.hint,
      postPreHint: pCard?.postPreHint || tCard?.postPreHint,
      fields: pCard?.fields?.length ? pCard.fields : tFields,
    };
  }

  const tWs = t.webSearch;
  const pWs = fromPipeline.webSearch;
  let webSearch: CreateGuide['webSearch'] = null;
  if (pWs || tWs) {
    webSearch = {
      clientPreview: pWs?.clientPreview ?? tWs?.clientPreview,
      maxResults: pWs?.maxResults ?? tWs?.maxResults,
      depth: pWs?.depth ?? tWs?.depth,
      topicExtractTextKey: pWs?.topicExtractTextKey ?? tWs?.topicExtractTextKey,
      topicCount: pWs?.topicCount ?? tWs?.topicCount,
    };
  }

  return { interactiveCard, webSearch };
}
