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

export type CreateGuideInteractiveCard = {
  label?: string;
  hint?: string;
  postPreHint?: string;
  fields: CreateGuideInteractiveCardField[];
};

export type CreateGuideNestedTextPreview = {
  /** 如 text/expert/dialogue-content-scan */
  nestedTextTaskKey: string;
  /** 默认 true：C 端不建任务先跑 text 预览，再展示 followUp 卡 */
  clientPreview?: boolean;
  /** loading 文案（通常取第一张卡 postPreHint） */
  loadingHint?: string;
};

/** 答完结构后预生成可编辑大纲（话题写作） */
export type CreateGuideOutlinePreview = {
  clientPreview?: boolean;
  /** 答完该字段后触发，默认 structure_id */
  midPreAfterField?: string;
  /** 回写字段名，默认 outline */
  outlineField?: string;
  /** text/expert/topic-article-outline */
  textKey?: string;
  loadingHint?: string;
};

export type CreateGuide = {
  interactiveCard: CreateGuideInteractiveCard | null;
  /**
   * pre 内「交互卡 → nestedText → 交互卡」的第二张卡。
   * C 端在 nestedTextPreview 完成后继续采集这些字段，再创建任务。
   */
  followUpInteractiveCard?: CreateGuideInteractiveCard | null;
  /** 两张交互卡之间的 nestedText，C 端预跑 */
  nestedTextPreview?: CreateGuideNestedTextPreview | null;
  webSearch: {
    /** 显式：pre 后在 C 端跑话题预览；未写时由前端按 topicCount / topicExtractTextKey 推断 */
    clientPreview?: boolean;
    maxResults?: number;
    depth?: string;
    topicExtractTextKey?: string;
    topicCount?: number;
    /** 中途触发：答完该字段后检索推荐话题（如 voice_id → topic） */
    midPreAfterField?: string;
    /** 推荐写入的字段名，默认 topic */
    topicField?: string;
  } | null;
  outlinePreview?: CreateGuideOutlinePreview | null;
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

function cardFromStep(step: PipelineStep | null | undefined): CreateGuideInteractiveCard | null {
  if (!step || String(step.step || '') !== 'interactiveCard') return null;
  const p = (step.params ?? {}) as Record<string, unknown>;
  const rawFields = Array.isArray(p.fields) ? p.fields : [];
  const fields = rawFields.map(asField).filter((f): f is CreateGuideInteractiveCardField => !!f);
  if (fields.length === 0) return null;
  return {
    label: typeof p.label === 'string' ? p.label : undefined,
    hint: typeof p.hint === 'string' ? p.hint : undefined,
    postPreHint: typeof p.postPreHint === 'string' ? p.postPreHint : undefined,
    fields,
  };
}

function findPreWebSearch(steps: PipelineStep[]): PipelineStep | null {
  for (const step of steps) {
    if (String(step?.step || '') !== 'webSearch') continue;
    const target = String(step.params?.target ?? 'sources.websource').trim();
    if (target === 'sources.websource' || target === '') return step;
  }
  return null;
}

/**
 * 识别 pre：interactiveCard → nestedText → interactiveCard
 * （多人语音等：先收文稿 → text 扫描 → 再收形式/人数/音色）
 */
function extractDualCardNestedTextPreview(pre: PipelineStep[]): {
  first: CreateGuideInteractiveCard | null;
  nestedTextPreview: CreateGuideNestedTextPreview | null;
  followUp: CreateGuideInteractiveCard | null;
} {
  for (let i = 0; i < pre.length - 2; i++) {
    const a = pre[i];
    const b = pre[i + 1];
    const c = pre[i + 2];
    if (String(a?.step || '') !== 'interactiveCard') continue;
    if (String(b?.step || '') !== 'nestedText') continue;
    if (String(c?.step || '') !== 'interactiveCard') continue;
    const nestedKey = String(
      (b as { nestedTextTaskKey?: string }).nestedTextTaskKey ??
        (b?.params as { nestedTextTaskKey?: string } | undefined)?.nestedTextTaskKey ??
        ''
    ).trim();
    if (!nestedKey.startsWith('text/')) continue;
    const first = cardFromStep(a);
    const followUp = cardFromStep(c);
    if (!first || !followUp) continue;
    return {
      first,
      followUp,
      nestedTextPreview: {
        nestedTextTaskKey: nestedKey,
        clientPreview: true,
        loadingHint: first.postPreHint,
      },
    };
  }
  return { first: null, nestedTextPreview: null, followUp: null };
}

/** 从 TaskTemplate.pipeline 抽取 createGuide；无 pre 闸门时返回空结构 */
export function extractCreateGuide(
  pipeline: BusinessPipelineConfig | undefined | null
): CreateGuide {
  const pre = Array.isArray(pipeline?.pre) ? pipeline!.pre! : [];
  const dual = extractDualCardNestedTextPreview(pre);
  const cardStep = pre.find((s) => String(s?.step || '') === 'interactiveCard');
  const searchStep = findPreWebSearch(pre);

  let interactiveCard: CreateGuide['interactiveCard'] = dual.first ?? cardFromStep(cardStep);
  let followUpInteractiveCard: CreateGuide['followUpInteractiveCard'] = dual.followUp;
  let nestedTextPreview: CreateGuide['nestedTextPreview'] = dual.nestedTextPreview;

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

  return {
    interactiveCard,
    followUpInteractiveCard,
    nestedTextPreview,
    webSearch,
    outlinePreview: null,
  };
}

function mergeCard(
  pipelineCard: CreateGuideInteractiveCard | null | undefined,
  templateCard: CreateGuideInteractiveCard | null | undefined
): CreateGuideInteractiveCard | null {
  if (!pipelineCard && !templateCard) return null;
  const tFields = Array.isArray(templateCard?.fields)
    ? templateCard!.fields.map(asField).filter((f): f is CreateGuideInteractiveCardField => !!f)
    : [];
  return {
    label: pipelineCard?.label || templateCard?.label,
    hint: pipelineCard?.hint || templateCard?.hint,
    postPreHint: pipelineCard?.postPreHint || templateCard?.postPreHint,
    fields: pipelineCard?.fields?.length ? pipelineCard.fields : tFields,
  };
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
    interactiveCard?: CreateGuideInteractiveCard | null;
    followUpInteractiveCard?: CreateGuideInteractiveCard | null;
    nestedTextPreview?: CreateGuideNestedTextPreview | null;
    webSearch?: {
      clientPreview?: boolean;
      maxResults?: number;
      depth?: string;
      topicExtractTextKey?: string;
      topicCount?: number;
      midPreAfterField?: string;
      topicField?: string;
    } | null;
    outlinePreview?: CreateGuideOutlinePreview | null;
  };

  const interactiveCard = mergeCard(fromPipeline.interactiveCard, t.interactiveCard);
  const followUpInteractiveCard =
    mergeCard(fromPipeline.followUpInteractiveCard, t.followUpInteractiveCard) ??
    fromPipeline.followUpInteractiveCard ??
    t.followUpInteractiveCard ??
    null;

  let nestedTextPreview: CreateGuide['nestedTextPreview'] =
    fromPipeline.nestedTextPreview ?? t.nestedTextPreview ?? null;
  if (fromPipeline.nestedTextPreview || t.nestedTextPreview) {
    nestedTextPreview = {
      nestedTextTaskKey:
        fromPipeline.nestedTextPreview?.nestedTextTaskKey ||
        t.nestedTextPreview?.nestedTextTaskKey ||
        '',
      clientPreview:
        fromPipeline.nestedTextPreview?.clientPreview ?? t.nestedTextPreview?.clientPreview,
      loadingHint:
        fromPipeline.nestedTextPreview?.loadingHint || t.nestedTextPreview?.loadingHint,
    };
    if (!nestedTextPreview.nestedTextTaskKey) nestedTextPreview = null;
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
      midPreAfterField: pWs?.midPreAfterField ?? tWs?.midPreAfterField,
      topicField: pWs?.topicField ?? tWs?.topicField,
    };
  }

  const tOp = t.outlinePreview;
  const pOp = fromPipeline.outlinePreview;
  let outlinePreview: CreateGuide['outlinePreview'] = null;
  if (pOp || tOp) {
    outlinePreview = {
      clientPreview: pOp?.clientPreview ?? tOp?.clientPreview,
      midPreAfterField: pOp?.midPreAfterField ?? tOp?.midPreAfterField,
      outlineField: pOp?.outlineField ?? tOp?.outlineField,
      textKey: pOp?.textKey ?? tOp?.textKey,
      loadingHint: pOp?.loadingHint ?? tOp?.loadingHint,
    };
  }

  return {
    interactiveCard,
    followUpInteractiveCard,
    nestedTextPreview,
    webSearch,
    outlinePreview,
  };
}
