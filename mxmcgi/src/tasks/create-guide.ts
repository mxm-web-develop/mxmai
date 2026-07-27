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
    fields: CreateGuideInteractiveCardField[];
  } | null;
  webSearch: {
    maxResults?: number;
    depth?: string;
    topicExtractTextKey?: string;
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
      topicExtractTextKey = 'text/expert/industry-hot-topics';
      break;
    }
    webSearch = {
      maxResults,
      depth: typeof p.depth === 'string' ? p.depth : undefined,
      topicExtractTextKey,
    };
  }

  return { interactiveCard, webSearch };
}
