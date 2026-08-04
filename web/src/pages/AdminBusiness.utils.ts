// AdminBusiness shared utility functions
// Extracted from AdminBusiness.tsx

import type {
  BusinessDisplayConfig,
  GenerateParamsConfig,
  JsonSchema,
  ParsedTemplateMarkup,
  PromptConfigRow,
  SchemaFieldRow,
  Scope,
  TaskTemplateDraft,
  TemplateVarMeta,
  VideoBusinessCategory,
} from './AdminBusiness.types';
import type { BusinessPricingRow, ProviderPricingRow } from '../api/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RECOMMENDED_GENERATE_PARAMS = {
  temperature: 0.5,
  /** 新业务默认（全业务下限 20k）；超长成稿可再调到 32k～65k，勿无脑顶满 128k */
  maxTokens: 20_000,
  topP: 0.95,
  /** 成稿推荐关思考；须写入 generateParams.parameters.thinking（显性，禁止运行时偷加） */
  enableThinking: false,
} as const;

/** 主力文本模型输出上限（业务 maxTokens 不应超过绑定模型） */
export const MODEL_MAX_OUTPUT_HINT = {
  'MiniMax-M3': 131_072,
  'gpt-5.6': 128_000,
} as const;

export const GENERATE_PARAM_TOOLTIPS: Record<string, string> = {
  temperature:
    '控制输出的随机性/发散程度。数值越高，表达越多样、越有创意，但也更容易偏离指令；越低越稳定、越「照章办事」。规划、结构化 JSON 等任务通常用中低温度。',
  maxTokens:
    '单次生成允许的最大「输出」token（不含输入）。与模型上下文窗口是两回事。MiniMax-M3：上下文约 1M，max 输出 131072。GPT-5.6（Sol/Terra/Luna）：上下文约 1.05M，max 输出 128000。平台下限 20000（勿再配 8k）。建议：常规业务 20k；结构/enrich 20k～32k；长文 body/成稿 32k～65k；确需再接近模型上限（贵且慢）。过小会截断。',
  topP:
    '核采样（nucleus sampling）：只在累计概率达到 topP 的候选词集合里采样。越接近 1 保留的候选越多、输出略更多样；越小越保守。常与 temperature 一起调节风格。',
  enableThinking:
    'MiniMax-M3 等推理模型的「思考」过程。关闭后 token 预算只用于正文，成稿更稳；开启后可能把预算花在 thinking 上导致截断。此开关写入业务 generateParams.parameters.thinking，运行时不会偷偷默认。',
};

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Business type helpers
// ---------------------------------------------------------------------------

function getBusinessTypeForPromptRowLocal(r: Pick<PromptConfigRow, 'scope' | 'type' | 'subtype'>): string {
  const base = (() => {
    if (r.scope === 'writing') {
      const map: Record<string, string> = {
        outlines: 'writing-outlines',
        articles: 'writing-articles',
        lyrics: 'writing-lyrics',
        'suno-lyrics': 'writing-lyrics',
        'voice-scripts': 'writing-voice-scripts',
        'storyboard-scripts': 'writing-storyboard-scripts',
        'media-post': 'writing-media-post',
        reviews: 'writing-reviews',
        resumes: 'writing-resumes',
      };
      return map[r.type] ?? `writing-${r.type}`;
    }
    return `${r.scope}-${r.type}`;
  })();
  if (r.subtype && r.subtype !== 'default') {
    return `${base}-${r.subtype}`;
  }
  return base;
}

export { getBusinessTypeForPromptRowLocal as getBusinessTypeForPromptRow };

export function readBusinessDisplayFromRow(row: PromptConfigRow): BusinessDisplayConfig {
  const d = (row.extra as Record<string, unknown> | undefined)?.display;
  return d && typeof d === 'object' ? (d as BusinessDisplayConfig) : {};
}

/** 从 taskKey 推断视频大分类（autocut / generator） */
export function readVideoCategoryFromRow(row: PromptConfigRow): VideoBusinessCategory | null {
  if (row.scope !== 'video') return null;
  if (row.type === 'autocut' || row.type === 'edit') return 'autocut';
  if (row.type === 'generator' || ['resource', 'storyboard', 'short', 'commercial'].includes(row.type)) {
    return 'generator';
  }
  return null;
}

/** 列表/标题用短显示名（去掉说明尾巴） */
export function shortenDisplayLabel(raw: string | undefined | null): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  const first = (s.split(/[；;\n]/)[0] ?? s).trim();
  const cleaned = first.replace(/\s*可挂载.+$/u, '').trim();
  return cleaned || undefined;
}

export function resolveTaskKeyDisplay(row: Pick<PromptConfigRow, 'type' | 'extra'>): {
  label: string;
  key: string;
  hasCustomLabel: boolean;
} {
  const custom = shortenDisplayLabel(readBusinessDisplayFromRow(row as PromptConfigRow).taskLabel);
  return {
    label: custom || row.type,
    key: row.type,
    hasCustomLabel: Boolean(custom),
  };
}

export function resolveSubtypeDisplay(row: Pick<PromptConfigRow, 'subtype' | 'extra'>): {
  label: string;
  key: string | null;
  hasCustomLabel: boolean;
} {
  if (!row.subtype) return { label: '—', key: null, hasCustomLabel: false };
  const custom = shortenDisplayLabel(readBusinessDisplayFromRow(row as PromptConfigRow).subtypeLabel);
  return {
    label: custom || row.subtype,
    key: row.subtype,
    hasCustomLabel: Boolean(custom),
  };
}

export function formatBusinessDrawerTitle(row: PromptConfigRow): { title: string; subtitle?: string } {
  const task = resolveTaskKeyDisplay(row);
  const sub = resolveSubtypeDisplay(row);
  const hasCustom = task.hasCustomLabel || sub.hasCustomLabel;
  if (!hasCustom) {
    return {
      title: `编辑业务：${row.scope} / ${row.type}${row.subtype ? ` / ${row.subtype}` : ''}`,
    };
  }
  const titleParts = [task.label];
  if (row.subtype) titleParts.push(sub.label);
  return {
    title: `编辑业务：${titleParts.join(' · ')}`,
    subtitle: `${row.scope} / ${row.type}${row.subtype ? ` / ${row.subtype}` : ''}`,
  };
}

export function businessRowSearchText(row: PromptConfigRow): string {
  const task = resolveTaskKeyDisplay(row);
  const sub = resolveSubtypeDisplay(row);
  return [
    row.scope,
    row.type,
    row.subtype ?? '',
    task.label,
    task.key,
    sub.label,
    sub.key ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Generate params helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function thinkingTypeFromParameters(parameters: unknown): 'disabled' | 'adaptive' | undefined {
  if (!isRecord(parameters)) return undefined;
  const t = parameters.thinking;
  if (!isRecord(t)) return undefined;
  const typ = String(t.type ?? '').toLowerCase();
  if (typ === 'disabled') return 'disabled';
  if (typ === 'adaptive' || typ === 'enabled' || typ === 'on') return 'adaptive';
  return undefined;
}

export function readGenerateParams(extra: unknown): GenerateParamsConfig | null {
  if (!isRecord(extra)) return null;
  const gp = extra.generateParams;
  if (!isRecord(gp)) return null;
  const temperature = toNum(gp.temperature);
  const maxTokens = toNum(gp.maxTokens);
  const topP = toNum(gp.topP);
  const parameters = isRecord(gp.parameters) ? (gp.parameters as Record<string, unknown>) : undefined;
  const thinkingType = thinkingTypeFromParameters(parameters);
  const enableThinking =
    thinkingType === 'adaptive' ? true : thinkingType === 'disabled' ? false : undefined;
  if (
    temperature == null &&
    maxTokens == null &&
    topP == null &&
    enableThinking === undefined &&
    !parameters
  ) {
    return null;
  }
  return { temperature, maxTokens, topP, enableThinking, parameters };
}

/**
 * 合并生成参数：保留既有 parameters；enableThinking 显式写 parameters.thinking。
 * 勿把 enableThinking 落成顶层字段。
 */
export function mergeGenerateParams(
  prev: Record<string, unknown> | undefined,
  next: Partial<typeof RECOMMENDED_GENERATE_PARAMS> & { enableThinking?: boolean }
) {
  const prevGp = (prev?.generateParams && typeof prev.generateParams === 'object'
    ? { ...(prev.generateParams as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const prevParams =
    prevGp.parameters && typeof prevGp.parameters === 'object' && !Array.isArray(prevGp.parameters)
      ? { ...(prevGp.parameters as Record<string, unknown>) }
      : {};

  const { enableThinking, ...rest } = next;
  const generateParams: Record<string, unknown> = {
    ...prevGp,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  };
  delete generateParams.enableThinking;

  if (enableThinking !== undefined) {
    generateParams.parameters = {
      ...prevParams,
      thinking: { type: enableThinking ? 'adaptive' : 'disabled' },
      reasoning_split: true,
    };
  } else if (Object.keys(prevParams).length > 0) {
    generateParams.parameters = prevParams;
  }

  return {
    ...prev,
    generateParams,
  } as Record<string, unknown>;
}

/** 在既有 extra.generateParams 上打补丁（保留 parameters） */
export function patchGenerateParamsExtra(
  prevExtra: Record<string, unknown>,
  patch: Partial<GenerateParamsConfig>
): Record<string, unknown> {
  return mergeGenerateParams(prevExtra, {
    temperature: patch.temperature,
    maxTokens: patch.maxTokens,
    topP: patch.topP,
    enableThinking: patch.enableThinking,
  });
}

export function getMetaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  if (!meta) return undefined;
  return toNum(meta[key]);
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

const COST_TO_MXM_TOKEN_RATE_DEFAULT = 1000;
const DEFAULT_MARGIN = 0.2;

export function computeRecommendedTokensFromProviderCost(
  p: ProviderPricingRow,
  costToMxmTokenRate = COST_TO_MXM_TOKEN_RATE_DEFAULT,
  margin = DEFAULT_MARGIN
) {
  const costTokens: { unit?: number; input?: number; output?: number } = {};
  const recommendedTokens: { unit?: number; input?: number; output?: number } = {};
  if (p.charge_mode === 'token_based') {
    const inUsd = p.input_unit_price ?? undefined;
    const outUsd = p.output_unit_price ?? undefined;
    if (inUsd != null) costTokens.input = Number(inUsd) * costToMxmTokenRate;
    if (outUsd != null) costTokens.output = Number(outUsd) * costToMxmTokenRate;
    if (costTokens.input != null) recommendedTokens.input = costTokens.input * (1 + margin);
    if (costTokens.output != null) recommendedTokens.output = costTokens.output * (1 + margin);
  } else {
    const uUsd = p.unit_price;
    costTokens.unit = Number(uUsd) * costToMxmTokenRate;
    recommendedTokens.unit = costTokens.unit * (1 + margin);
  }
  return { costTokens, recommendedTokens };
}

/** 定价 Tab 未挂载时 Form 字段会丢失，保存全部勿用 unit=0 覆盖已有 business_pricing */
export function isPricingFormStaleForSave(
  values: {
    margin?: number;
    unit?: number;
    input?: number;
    output?: number;
  } | null,
  chargeMetric: string,
  configured: BusinessPricingRow | null | undefined
): boolean {
  if (!values) return true;
  if (chargeMetric === 'unknown') return true;
  if (chargeMetric === 'token_based') {
    const inMeta = getMetaNumber(configured?.metadata ?? {}, 'input_price_in_tokens');
    const outMeta = getMetaNumber(configured?.metadata ?? {}, 'output_price_in_tokens');
    const hadConfigured = (inMeta != null && inMeta > 0) || (outMeta != null && outMeta > 0);
    if (!hadConfigured) return false;
    const inV = values.input != null ? Number(values.input) : 0;
    const outV = values.output != null ? Number(values.output) : 0;
    return inV <= 0 && outV <= 0;
  }
  const configuredUnit =
    configured?.price_in_tokens != null ? Number(configured.price_in_tokens) : undefined;
  if (configuredUnit != null && configuredUnit > 0) {
    const unitV = values.unit != null ? Number(values.unit) : 0;
    return unitV <= 0;
  }
  return false;
}

/**
 * 在 business_pricing 多行（含 provider/model_key）中解析与当前路由一致的一行；
 * 若无精确匹配则回退到「无 provider/model」的旧行，再回退到同 business_type+metric+subtype 的第一条。
 */
export function resolveConfiguredBusinessPricing(
  rows: BusinessPricingRow[],
  businessType: string,
  chargeMetric: string,
  subtype: string | null | undefined,
  provider: string | null | undefined,
  modelKey: string | null | undefined
): BusinessPricingRow | null {
  const sub = subtype ?? '';
  const p = provider ?? '';
  const mk = modelKey ?? '';
  const sameTriple = rows.filter(
    (r) => r.business_type === businessType && r.charge_metric === chargeMetric && (r.subtype ?? '') === sub
  );
  if (!sameTriple.length) return null;
  const exact = sameTriple.find((r) => (r.provider ?? '') === p && (r.model_key ?? '') === mk);
  if (exact) return exact;
  const legacy = sameTriple.find((r) => !(r.provider || r.model_key));
  if (legacy) return legacy;
  return sameTriple[0] ?? null;
}

// ---------------------------------------------------------------------------
// Model routing helpers
// ---------------------------------------------------------------------------

export function allowedModelScopesForBusiness(scope: Scope): string[] {
  if (scope === 'graph') return ['graph'];
  if (scope === 'audio') return ['audio'];
  if (scope === 'music') return ['music', 'audio'];
  if (scope === 'video') return ['video'];
  if (scope === 'text') return ['text', 'writing'];
  // writing
  return ['writing', 'text'];
}

/** Provider 下拉：排除 internal 等平台内部占位 */
export function routableProviderOptions(
  modelsByProviderByScope: Record<string, Record<string, string[]>>
): Array<{ value: string; label: string }> {
  const hidden = new Set(['internal']);
  return Object.keys(modelsByProviderByScope)
    .filter((p) => !hidden.has(p))
    .sort((a, b) => a.localeCompare(b))
    .map((p) => ({ value: p, label: p }));
}

export type AiVideoGeneratorRoute = {
  taskKey: string;
  subtype: string;
};

export function isVideoPipelineOrchestratorBusiness(
  extraDraft: Record<string, unknown> | undefined,
  selected: Pick<PromptConfigRow, 'scope' | 'type' | 'subtype'> | null | undefined
): boolean {
  if (selected?.scope !== 'video') return false;
  if (extraDraft?.pipelineOrchestrator === true) return true;
  return selected.type === 'autocut' && selected.subtype === 'voiceover-science-pop';
}

export function readAiVideoGeneratorRoute(
  extraDraft: Record<string, unknown> | undefined
): AiVideoGeneratorRoute {
  const raw = extraDraft?.defaultAiVideoGenerator ?? extraDraft?.aiVideoRoute;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    let taskKey = String((raw as { taskKey?: unknown }).taskKey ?? 'generator').trim() || 'generator';
    const subtype = String((raw as { subtype?: unknown }).subtype ?? 'fragment').trim() || 'fragment';
    if (taskKey === 'resource') taskKey = 'generator';
    return { taskKey, subtype };
  }
  return { taskKey: 'generator', subtype: 'fragment' };
}

export function formatVideoGeneratorRouteValue(taskKey: string, subtype: string | null): string {
  return subtype ? `${taskKey}/${subtype}` : taskKey;
}

export function parseVideoGeneratorRouteValue(value: string): AiVideoGeneratorRoute {
  const slash = value.indexOf('/');
  if (slash < 0) return { taskKey: value.trim() || 'generator', subtype: 'fragment' };
  return {
    taskKey: value.slice(0, slash).trim() || 'generator',
    subtype: value.slice(slash + 1).trim() || 'fragment',
  };
}

export function formatVideoGeneratorBusinessLabel(row: PromptConfigRow): string {
  const task = resolveTaskKeyDisplay(row);
  const sub = resolveSubtypeDisplay(row);
  const name = sub.key ? `${task.label} · ${sub.label}` : task.label;
  return `${name}（video/${row.type}/${row.subtype ?? '-'}）`;
}

export function videoGeneratorBusinessOptions(rows: PromptConfigRow[]): Array<{ value: string; label: string }> {
  return rows
    .filter((r) => r.scope === 'video' && readVideoCategoryFromRow(r) === 'generator' && r.is_active !== false)
    .map((r) => ({
      value: formatVideoGeneratorRouteValue(r.type, r.subtype),
      label: formatVideoGeneratorBusinessLabel(r),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'));
}

export function syncAiVideoGeneratorToPipelineDraft(
  draft: TaskTemplateDraft,
  route: AiVideoGeneratorRoute
): TaskTemplateDraft {
  const patchSteps = (steps: import('./AdminBusiness.types').PipelineStepDraft[] | undefined) =>
    (steps ?? []).map((s) => {
      if (s.step !== 'buildVideoEditTimeline' && s.step !== 'buildSciencePopTimeline') return s;
      return {
        ...s,
        params: {
          ...(s.params ?? {}),
          aiVideoTaskKey: route.taskKey,
          aiVideoSubtype: route.subtype,
        },
      };
    });
  const pipeline = draft.pipeline;
  if (!pipeline?.pre?.length && !pipeline?.enrich?.length && !pipeline?.post?.length) return draft;
  return {
    ...draft,
    pipeline: {
      pre: patchSteps(pipeline.pre),
      enrich: patchSteps(pipeline.enrich),
      post: patchSteps(pipeline.post),
    },
  };
}

// ---------------------------------------------------------------------------
// Template / Schema helpers
// ---------------------------------------------------------------------------

function composeLegacyPromptToUnifiedLocal(p: {
  systemTemplate?: string;
  userTemplate?: string;
  outputFormatTemplate?: string;
  rulesFallback?: string;
  outputFormatFallback?: string;
}): string {
  const sys = (p.systemTemplate || p.rulesFallback || '').trim();
  const userTpl =
    p.userTemplate != null && String(p.userTemplate).trim() !== ''
      ? String(p.userTemplate).trim()
      : '${prompt}';
  const out = (p.outputFormatTemplate || p.outputFormatFallback || '').trim();
  const parts: string[] = [];
  if (sys) parts.push(sys);
  parts.push(`【用户需求】\n${userTpl}`);
  if (out) parts.push(`【输出要求】\n${out}`);
  return parts.join('\n\n').trim();
}

export function ensureTaskTemplate(
  tpl: unknown,
  opts?: { rules?: string; outputFormat?: string }
): TaskTemplateDraft {
  const formSchema: JsonSchema =
    (tpl as Record<string, unknown> | null)?.formSchema && typeof (tpl as Record<string, unknown>).formSchema === 'object'
      ? ((tpl as Record<string, unknown>).formSchema as JsonSchema)
      : { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: {}, required: [] };
  const prompt = (tpl as Record<string, unknown> | null)?.prompt && typeof (tpl as Record<string, unknown>).prompt === 'object'
    ? ((tpl as Record<string, unknown>).prompt as Record<string, unknown>)
    : {};
  const knowledge = (tpl as Record<string, unknown> | null)?.knowledge && typeof (tpl as Record<string, unknown>).knowledge === 'object' ? ((tpl as Record<string, unknown>).knowledge as Record<string, unknown>) : null;
  const strategyRaw = knowledge?.strategy;
  const strategy: 'global' | 'per_section' | 'none' =
    strategyRaw === 'per_section' || strategyRaw === 'none' || strategyRaw === 'global' ? strategyRaw : 'global';

  let unified = typeof prompt.unifiedTemplate === 'string' ? String(prompt.unifiedTemplate).trim() : '';
  if (!unified) {
    unified = composeLegacyPromptToUnifiedLocal({
      systemTemplate: String(prompt.systemTemplate ?? ''),
      userTemplate: prompt.userTemplate != null ? String(prompt.userTemplate) : undefined,
      outputFormatTemplate: String(prompt.outputFormatTemplate ?? ''),
      rulesFallback: undefined,
      outputFormatFallback: opts?.outputFormat,
    });
  }
  const unifiedMarkup =
    typeof prompt.unifiedTemplateMarkup === 'string' && String(prompt.unifiedTemplateMarkup).trim()
      ? String(prompt.unifiedTemplateMarkup)
      : unified;

  const rawContract = (tpl as Record<string, unknown> | null)?.contractSchema;
  const contractSchema: JsonSchema =
    rawContract && typeof rawContract === 'object'
      ? (rawContract as JsonSchema)
      : formSchema;

  return {
    formSchema,
    contractSchema,
    prompt: {
      unifiedTemplate: unified,
      unifiedTemplateMarkup: unifiedMarkup,
    },
    knowledge: (tpl as Record<string, unknown> | null)?.knowledge && typeof (tpl as Record<string, unknown>).knowledge === 'object'
      ? {
          useKnowledge: !!(knowledge as Record<string, unknown>).useKnowledge,
          defaultKnowledgeBaseIds: Array.isArray((knowledge as Record<string, unknown>).defaultKnowledgeBaseIds)
            ? ((knowledge as Record<string, unknown>).defaultKnowledgeBaseIds as unknown[]).map(String)
            : [],
          strategy,
        }
      : { useKnowledge: false, defaultKnowledgeBaseIds: [], strategy: 'global' },
    storage: (() => {
      const storage = (tpl as Record<string, unknown> | null)?.storage;
      const formSchemaForStorage =
        (tpl as Record<string, unknown> | null)?.formSchema && typeof (tpl as Record<string, unknown>).formSchema === 'object'
          ? ((tpl as Record<string, unknown>).formSchema as JsonSchema)
          : formSchema;
      if (storage && typeof storage === 'object') {
        const s = storage as Record<string, unknown>;
        return {
          scope: (s.scope as Scope) ?? 'writing',
          extension: String(s.extension ?? 'md'),
          mime: s.mime != null ? String(s.mime) : undefined,
          bucket: s.bucket != null ? String(s.bucket) : undefined,
          pathTemplate: s.pathTemplate != null ? String(s.pathTemplate) : undefined,
          filenameTemplate: s.filenameTemplate != null ? String(s.filenameTemplate) : undefined,
        };
      }
      const storageForm = readStorageFormFromSchema(formSchemaForStorage);
      if (storageForm) {
        const format = extensionToWritingFormat(storageForm);
        return createWritingStorageBlock(format, 'writing');
      }
      return undefined;
    })(),
    uiSchema: (() => {
      const uiSchema = (tpl as Record<string, unknown> | null)?.uiSchema;
      return uiSchema && typeof uiSchema === 'object' ? (uiSchema as Record<string, unknown>) : undefined;
    })(),
    extra: (() => {
      const extra = (tpl as Record<string, unknown> | null)?.extra;
      return extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : undefined;
    })(),
    pipeline: (() => {
      const raw = tpl as Record<string, unknown> | null;
      const pipe = raw?.pipeline;
      if (pipe && typeof pipe === 'object') {
        const p = pipe as Record<string, unknown>;
        return {
          pre: Array.isArray(p.pre) ? (p.pre as import('./AdminBusiness.types').PipelineStepDraft[]) : undefined,
          enrich: Array.isArray(p.enrich) ? (p.enrich as import('./AdminBusiness.types').PipelineStepDraft[]) : undefined,
          post: Array.isArray(p.post) ? (p.post as import('./AdminBusiness.types').PipelineStepDraft[]) : undefined,
        };
      }
      const pre = raw?.inputPipeline;
      const post = raw?.outputPipeline;
      if (Array.isArray(pre) || Array.isArray(post)) {
        return {
          pre: Array.isArray(pre) ? (pre as import('./AdminBusiness.types').PipelineStepDraft[]) : undefined,
          post: Array.isArray(post) ? (post as import('./AdminBusiness.types').PipelineStepDraft[]) : undefined,
        };
      }
      return undefined;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Schema field manipulation
// ---------------------------------------------------------------------------

const UI_TYPES = [
  'text',
  'string',
  'number',
  'scale',
  'boolean',
  'selection',
  'multiSelection',
  'referenceImages',
  'eshopGarmentBatch',
  'gridStoryboardImages',
  'kbRecall',
  'mxmKbInput',
  'textFileOrPaste',
  'minimaxVoice',
  'webSearch',
  'domainSearch',
  'colorPicker',
] as const;
type UiType = (typeof UI_TYPES)[number];

export { UI_TYPES };
export type { UiType };

function arrayItemsStringEnumForSchema(d: Record<string, unknown>): string[] {
  if (String(d.type) !== 'array') return [];
  const raw = d.items;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const it = raw as Record<string, unknown>;
  if (String(it.type) !== 'string') return [];
  const en = it.enum;
  if (!Array.isArray(en) || en.length === 0) return [];
  return en.map((x) => String(x));
}

export function schemaTypeToUiType(d: Record<string, unknown>): string {
  const xUi = d['x-ui-type'];
  if (
    xUi === 'text' ||
    xUi === 'string' ||
    xUi === 'number' ||
    xUi === 'scale' ||
    xUi === 'selection' ||
    xUi === 'multiSelection' ||
    xUi === 'checkboxGroup' ||
    xUi === 'referenceImages' ||
    xUi === 'eshopGarmentBatch' ||
    xUi === 'gridStoryboardImages' ||
    xUi === 'kbRecall' ||
    xUi === 'mxmKbInput' ||
    xUi === 'textFileOrPaste' ||
    xUi === 'minimaxVoice' ||
    xUi === 'webSearch' ||
    xUi === 'domainSearch' ||
    xUi === 'colorPicker' ||
    xUi === 'switch'
  )
    return xUi === 'switch' ? 'boolean' : String(xUi);
  const t = String(d.type ?? 'string');
  if (t === 'boolean') return 'boolean';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'array' && arrayItemsStringEnumForSchema(d).length > 0) return 'multiSelection';
  if (Array.isArray(d.enum) && d.enum.length > 0) return 'selection';
  if (t === 'string') return 'string';
  return 'string';
}

/** 系统保留字段：不应进入 Admin 可编辑的 schema。 */
const SYSTEM_SCHEMA_FIELDS = ['uid', 'storage_form', 'storeToMinio', 'writing_type'] as const;
export const SYSTEM_SCHEMA_FIELD_SET = new Set<string>(SYSTEM_SCHEMA_FIELDS as unknown as string[]);

/** 写作统一 Markdown 落盘；历史枚举值仅作兼容解析，Admin 不再提供多格式选项 */
export const WRITING_STORAGE_FORMAT_OPTIONS: Array<{
  value: import('./AdminBusiness.types').WritingStorageFormat;
  label: string;
  extension: string;
  mime: string;
}> = [
  { value: 'markdown', label: 'Markdown (.md)', extension: 'md', mime: 'text/markdown; charset=utf-8' },
];

function extensionToWritingFormat(ext: string): import('./AdminBusiness.types').WritingStorageFormat {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  if (normalized === 'md' || normalized === 'markdown') return 'markdown';
  const found = WRITING_STORAGE_FORMAT_OPTIONS.find((o) => o.extension === normalized || o.value === normalized);
  return found?.value ?? 'markdown';
}

function readStorageFormFromSchema(formSchema: JsonSchema): string | undefined {
  const sf = (formSchema.properties ?? {}).storage_form;
  if (!sf || typeof sf !== 'object') return undefined;
  const d = sf as Record<string, unknown>;
  if (d.const != null) return String(d.const);
  if (d.default != null) return String(d.default);
  return undefined;
}

export function resolveWritingStorageFormat(_draft: TaskTemplateDraft): import('./AdminBusiness.types').WritingStorageFormat {
  // 写作模块统一 Markdown 落盘；忽略历史 storage_form / extension
  return 'markdown';
}

export function createWritingStorageBlock(
  format: import('./AdminBusiness.types').WritingStorageFormat,
  scope: Scope = 'writing'
): NonNullable<TaskTemplateDraft['storage']> {
  const opt =
    WRITING_STORAGE_FORMAT_OPTIONS.find((o) => o.value === format) ?? WRITING_STORAGE_FORMAT_OPTIONS[0];
  return {
    scope,
    extension: opt.extension,
    mime: opt.mime,
    pathTemplate: 'writing/${userId}/${date}/',
    filenameTemplate: `writing_\${taskId}_\${uuid}.${opt.extension}`,
  };
}

/** 将基础配置中的 storage 同步到 formSchema 隐藏字段（storage_form / storeToMinio） */
export function syncWritingStorageToFormSchema(draft: TaskTemplateDraft): TaskTemplateDraft {
  const props = { ...((draft.formSchema.properties ?? {}) as Record<string, unknown>) };
  if (!draft.storage) {
    props.storeToMinio = { type: 'boolean', default: false, const: false, 'x-user-visible': false };
    return { ...draft, formSchema: { ...draft.formSchema, properties: props } };
  }
  const format = resolveWritingStorageFormat(draft);
  const opt = WRITING_STORAGE_FORMAT_OPTIONS.find((o) => o.value === format) ?? WRITING_STORAGE_FORMAT_OPTIONS[0];
  props.storage_form = { type: 'string', default: opt.value, const: opt.value, 'x-user-visible': false };
  props.storeToMinio = { type: 'boolean', default: true, const: true, 'x-user-visible': false };
  return {
    ...draft,
    storage: {
      ...draft.storage,
      extension: opt.extension,
      mime: opt.mime,
    },
    formSchema: { ...draft.formSchema, properties: props },
  };
}

export function ensureWritingStorageDefaults(
  draft: TaskTemplateDraft,
  scope: Scope
): TaskTemplateDraft {
  if (scope !== 'writing') return draft;
  if (draft.storage) return draft;
  return syncWritingStorageToFormSchema({
    ...draft,
    storage: createWritingStorageBlock('markdown', scope),
  });
}

export function stripSystemSchemaFields(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema };
  const props = (next.properties ?? {}) as Record<string, unknown>;
  const nextProps: Record<string, unknown> = { ...props };
  for (const k of SYSTEM_SCHEMA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(nextProps, k)) delete nextProps[k];
  }
  next.properties = nextProps;
  if (Array.isArray(next.required)) {
    next.required = next.required.map(String).filter((k) => !SYSTEM_SCHEMA_FIELD_SET.has(k));
  }
  return next;
}

export function schemaPropsToFieldRows(schema: JsonSchema): SchemaFieldRow[] {
  const sanitized = stripSystemSchemaFields(schema);
  const props = (sanitized.properties ?? {}) as Record<string, unknown>;
  const requiredSet = new Set<string>((sanitized.required ?? []).map(String));
  // mxm-warp：Admin 编辑全部合同字段（含 business / x-user-visible:false）
  return Object.entries(props).map(([name, def]) => {
    const d = def && typeof def === 'object' ? (def as Record<string, unknown>) : {};
    const enumArr = Array.isArray(d.enum) ? d.enum : undefined;
    const itemEnumArr =
      String(d.type) === 'array' && arrayItemsStringEnumForSchema(d).length > 0
        ? arrayItemsStringEnumForSchema(d)
        : undefined;
    const effectiveEnum = enumArr ?? itemEnumArr;
    const enumText = effectiveEnum ? effectiveEnum.map((x) => String(x)).join('\n') : '';
    const enumLabels = Array.isArray(d['x-enum-labels']) ? (d['x-enum-labels'] as string[]) : undefined;
    const enumLabelsText = enumLabels ? enumLabels.map((x) => String(x)).join('\n') : '';
    const type = schemaTypeToUiType(d);
    const defaultText =
      d.default !== undefined && d.default !== null
        ? (type === 'multiSelection' ||
            type === 'referenceImages' ||
            type === 'eshopGarmentBatch' ||
            type === 'gridStoryboardImages' ||
            type === 'kbRecall' ||
            type === 'mxmKbInput' ||
            type === 'textFileOrPaste' ||
            type === 'minimaxVoice' ||
            type === 'webSearch' ||
            type === 'domainSearch' ||
            type === 'colorPicker') &&
          (Array.isArray(d.default) || (type === 'gridStoryboardImages' && typeof d.default === 'object'))
          ? JSON.stringify(d.default)
          : String(d.default)
        : '';
    const zoneRaw = d['x-zone'];
    const zone: import('./AdminBusiness.types').ContractFieldZone =
      zoneRaw === 'basic' ? 'basic' : 'business';
    const userVisible =
      d['x-user-visible'] !== undefined ? d['x-user-visible'] !== false : zone === 'basic';
    return {
      key: name,
      name,
      type,
      title: d.title != null ? String(d.title) : undefined,
      description: d.description != null ? String(d.description) : undefined,
      required: requiredSet.has(name),
      userVisible,
      zone,
      enumText: enumText ?? '',
      enumLabelsText: enumLabelsText ?? '',
      defaultText: defaultText ?? '',
    };
  });
}

export function fieldRowsToSchema(
  base: JsonSchema,
  rows: SchemaFieldRow[]
): JsonSchema {
  const next: JsonSchema = { ...base, type: base.type ?? 'object' };
  const props: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const baseProps = (base.properties ?? {}) as Record<string, unknown>;
  const baseRequired = Array.isArray(base.required) ? base.required.map(String) : [];
  // 保留 x-user-visible:false 的管线字段（如 design.type=poster），避免 Admin 保存时从 schema 抹掉
  for (const [key, def] of Object.entries(baseProps)) {
    if (!def || typeof def !== 'object') continue;
    if ((def as Record<string, unknown>)['x-user-visible'] !== false) continue;
    props[key] = { ...(def as Record<string, unknown>) };
    if (baseRequired.includes(key)) required.push(key);
  }
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    if (SYSTEM_SCHEMA_FIELD_SET.has(name)) continue;
    const def: Record<string, unknown> = {};
    const enumLines = String(r.enumText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const uiType = UI_TYPES.includes(r.type as UiType) ? (r.type as UiType) : 'string';
    if (uiType === 'referenceImages') {
      def.type = 'array';
      def['x-ui-type'] = 'referenceImages';
      def.minItems = r.required ? 1 : 0;
      def.maxItems = 14;
      def.items = {
        type: 'object',
        additionalProperties: false,
        properties: {
          content: { type: 'string', title: '图片 URL / Base64' },
          type: {
            type: 'string',
            title: '用途类型',
            enum: ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'],
            default: 'main-subject',
          },
          purpose: { type: 'string', title: '用途说明（可选）' },
        },
        required: ['content', 'type'],
      };
    } else if (uiType === 'eshopGarmentBatch') {
      def.type = 'array';
      def['x-ui-type'] = 'eshopGarmentBatch';
      def.minItems = r.required ? 1 : 0;
      def.items = {
        type: 'object',
        required: ['images'],
        properties: {
          label: { type: 'string', title: 'SKU 标签', default: '' },
          shoot_preset: { type: 'string', title: '场景预设（可选）' },
          garment_material: { type: 'string', title: '面料质感（可选）' },
          prompt: { type: 'string', title: 'SKU 补充 prompt（可选）', 'x-ui-type': 'textarea', default: '' },
          images: {
            type: 'array',
            title: '服装图',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', title: '图片 URL / Base64' },
                type: {
                  type: 'string',
                  title: '用途类型',
                  enum: ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'],
                  default: 'outfits',
                },
                purpose: { type: 'string', title: '用途说明（可选）' },
              },
              required: ['content', 'type'],
            },
          },
        },
      };
    } else if (uiType === 'gridStoryboardImages') {
      def.type = 'object';
      def['x-ui-type'] = 'gridStoryboardImages';
      def['x-supports-last-frame'] = true;
      def.properties = {
        enabled: { type: 'boolean', default: false, title: '启用宫格分镜' },
        layout: { type: 'string', enum: ['2x2', '3x3', '4x4'], default: '3x3', title: '布局' },
        source_image: {
          type: ['object', 'null'],
          title: '源图',
          properties: {
            content: { type: 'string' },
            type: { type: 'string', default: 'main-subject' },
          },
        },
        cells: {
          type: 'array',
          title: '逐格描述',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              purpose: { type: 'string' },
            },
          },
        },
        first_frame_index: { type: 'integer', default: 0, title: '首帧格位' },
        last_frame_index: { type: ['integer', 'null'], title: '尾帧格位（可选）' },
      };
    } else if (uiType === 'kbRecall') {
      def.type = 'object';
      def['x-ui-type'] = 'kbRecall';
      def['x-max-items'] = 5;
      def.properties = {
        items: {
          type: 'array',
          title: '召回项',
          items: {
            type: 'object',
            properties: {
              folderId: { type: 'string', title: '知识库' },
              query: { type: 'string', title: '召回问题' },
              limit: {
                type: 'integer',
                default: 8,
                minimum: 1,
                maximum: 20,
                'x-user-visible': false,
              },
            },
          },
        },
      };
    } else if (uiType === 'mxmKbInput') {
      def.type = 'object';
      def['x-ui-type'] = 'mxmKbInput';
      def['x-resolve-phase'] = 'pre';
      def.properties = {
        text: { type: 'string', title: '文本' },
        mentions: {
          type: 'array',
          title: '引用',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              id: { type: 'string' },
              label: { type: 'string' },
              folderId: { type: 'string' },
              query: { type: 'string' },
            },
          },
        },
      };
      def.default = { text: '', mentions: [] };
    } else if (uiType === 'textFileOrPaste') {
      def.type = 'string';
      def['x-ui-type'] = 'textFileOrPaste';
      def['x-max-chars'] = 120000;
      def.minLength = 1;
      def.default = '';
    } else if (uiType === 'minimaxVoice') {
      def.type = 'object';
      def['x-ui-type'] = 'minimaxVoice';
      def['x-voice-model'] = 'speech-2.8-hd';
      def.properties = {
        mode: { type: 'string', enum: ['system', 'clone'], default: 'system', title: '来源' },
        voice_id: { type: 'string', title: 'voice_id' },
        label: { type: 'string', title: '显示名' },
      };
      def.default = { mode: 'system', voice_id: 'female-shaonv', label: '少女音色' };
    } else if (uiType === 'domainSearch') {
      def.type = 'object';
      def['x-ui-type'] = 'domainSearch';
      def['x-max-items'] = 5;
      def.properties = {
        items: {
          type: 'array',
          title: '检索项',
          items: {
            type: 'object',
            properties: {
              domain: {
                type: 'string',
                title: '数据领域',
                enum: ['auto', 'legal', 'finance', 'stock', 'crypto', 'business'],
                'x-enum-labels': ['自动', '法律', '金融', '股市', '区块链', '商业'],
                default: 'auto',
              },
              searchDepth: {
                type: 'string',
                title: '检索深度',
                enum: ['quick', 'standard', 'deep'],
                'x-enum-labels': ['快速', '标准', '深度'],
                default: 'standard',
              },
              query: { type: 'string', title: '检索问题' },
            },
          },
        },
      };
    } else if (uiType === 'webSearch') {
      def.type = 'object';
      def['x-ui-type'] = 'webSearch';
      def['x-max-items'] = 5;
      def.properties = {
        items: {
          type: 'array',
          title: '检索项',
          items: {
            type: 'object',
            properties: {
              searchDepth: {
                type: 'string',
                title: '检索深度',
                enum: ['quick', 'standard', 'deep'],
                'x-enum-labels': ['快速', '标准', '深度'],
                default: 'standard',
              },
              query: { type: 'string', title: '检索问题' },
              maxResults: {
                type: 'integer',
                default: 6,
                minimum: 1,
                maximum: 15,
                'x-user-visible': false,
              },
            },
          },
        },
      };
    } else if (uiType === 'colorPicker') {
      def.type = 'string';
      def['x-ui-type'] = 'colorPicker';
      def.pattern = '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$';
      def.default = '#002FA7';
    } else if (uiType === 'number') {
      def.type = 'number';
      def['x-ui-type'] = 'number';
    } else if (uiType === 'scale') {
      def.type = 'integer';
      def['x-ui-type'] = 'scale';
      if (typeof def.minimum !== 'number') def.minimum = 1;
      if (typeof def.maximum !== 'number') def.maximum = 10;
    } else if (uiType === 'boolean') {
      def.type = 'boolean';
      def['x-ui-type'] = 'switch';
    } else if (uiType === 'selection') {
      def.type = 'string';
      def['x-ui-type'] = 'selection';
    } else if (uiType === 'multiSelection') {
      def.type = 'array';
      def['x-ui-type'] = 'multiSelection';
      def.uniqueItems = true;
      def.minItems = r.required ? 1 : 0;
      def.items = {
        type: 'string',
        enum: enumLines,
      };
    } else if (uiType === 'text') {
      def.type = 'string';
      def['x-ui-type'] = 'text';
    } else {
      def.type = 'string';
      def['x-ui-type'] = 'string';
    }
    if (r.title) def.title = String(r.title);
    if (r.description) def.description = String(r.description);
    const zone = r.zone === 'basic' ? 'basic' : 'business';
    def['x-zone'] = zone;
    const userVisible = r.userVisible !== undefined ? r.userVisible : zone === 'basic';
    if (userVisible === false) def['x-user-visible'] = false;
    if (enumLines.length > 0) def.enum = enumLines;
    const labelLines = String(r.enumLabelsText || '')
      .split('\n')
      .map((s) => s.trim());
    if (labelLines.length > 0) def['x-enum-labels'] = labelLines.slice(0, enumLines.length);
    if (r.defaultText != null && String(r.defaultText).trim() !== '') {
      const dt = String(r.defaultText).trim();
      if (uiType === 'referenceImages' || uiType === 'eshopGarmentBatch' || uiType === 'gridStoryboardImages' || uiType === 'kbRecall' || uiType === 'mxmKbInput' || uiType === 'textFileOrPaste' || uiType === 'minimaxVoice' || uiType === 'webSearch' || uiType === 'domainSearch') {
        try {
          const parsed = JSON.parse(dt);
          def.default = parsed;
        } catch {
          def.default = dt;
        }
      } else if (uiType === 'multiSelection') {
        try {
          const parsed = JSON.parse(dt);
          if (Array.isArray(parsed)) def.default = parsed;
        } catch {
          // 无合法 JSON 数组则省略 default
        }
      } else if (uiType === 'boolean') {
        const low = dt.toLowerCase();
        def.default = low === 'true' || low === '1' || low === 'yes';
      } else {
        def.default = uiType === 'number' ? Number(dt) : dt;
      }
    }
    props[name] = def;
    if (r.required) required.push(name);
  }
  next.properties = props;
  next.required = Array.from(new Set(required));
  if (!next.$schema) next.$schema = 'http://json-schema.org/draft-07/schema#';
  return stripSystemSchemaFields(next);
}

// ---------------------------------------------------------------------------
// Template vars extraction
// ---------------------------------------------------------------------------

export function extractTemplateVars(text: string): string[] {
  const out: string[] = [];
  const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

function escapeAttr(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function isValidTemplateVarName(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

/** rtext PromptTempDesigner 默认 placeholder，仅 UI 占位，不是 schema 字段名 */
const RTEXT_TEMPLATE_PLACEHOLDER_LABEL = '模版字符内容';

/**
 * 从 <template> 属性 + 内文解析变量名。
 * rtext 序列化为 key="…" placeholder="模版字符内容"；旧 Admin 生成 name="…"。
 * 不可把 placeholder 当成变量名，否则正确蓝块也会误报 ${模版字符内容}。
 */
function resolveTemplateVarName(attrs: Record<string, string>, innerText: string): string {
  const innerId = innerText.replace(/[^a-zA-Z0-9_]/g, '').trim();
  if (attrs.name && isValidTemplateVarName(attrs.name)) return attrs.name;
  if (attrs.key && isValidTemplateVarName(attrs.key)) return attrs.key;
  if (innerId && isValidTemplateVarName(innerId)) return innerId;
  const ph = attrs.placeholder?.trim();
  if (ph && ph !== RTEXT_TEMPLATE_PLACEHOLDER_LABEL && isValidTemplateVarName(ph)) return ph;
  return attrs.name || attrs.key || innerId || ph || '';
}

export function buildMarkupFromTemplate(template: string, schema: JsonSchema): string {
  if (!template) return '';
  // 与 parseTemplateMarkup / 后端插值一致：先把 {{var}} 规范为 ${var} 再生成 <template>
  const tpl = template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, name: string) => `\${${name}}`);
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  const requiredArr = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const requiredSet = new Set<string>(requiredArr);

  const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let lastIndex = 0;
  let out = '';
  let m: RegExpExecArray | null;

  while ((m = re.exec(tpl)) !== null) {
    const varName = m[1];
    out += tpl.slice(lastIndex, m.index);
    const defRaw = props[varName];
    const def =
      defRaw && typeof defRaw === 'object'
        ? (defRaw as Record<string, unknown>)
        : {};
    const type = typeof def.type === 'string' ? String(def.type) : 'string';
    const label = typeof def.title === 'string' ? String(def.title) : varName;
    const defValueRaw = (def as { default?: unknown }).default;
    const required = requiredSet.has(varName);
    const attrParts: string[] = [
      `key="${escapeAttr(varName)}"`,
      `name="${escapeAttr(varName)}"`,
      `type="${escapeAttr(type)}"`,
      `label="${escapeAttr(label)}"`,
      `required="${required ? 'true' : 'false'}"`,
    ];
    if (defValueRaw !== undefined && defValueRaw !== null && String(defValueRaw) !== '') {
      attrParts.push(`defaultValue="${escapeAttr(String(defValueRaw))}"`);
    }
    out += `<template ${attrParts.join(' ')}>${varName}</template>`;
    lastIndex = re.lastIndex;
  }

  out += tpl.slice(lastIndex);
  return out;
}

export function parseTemplateMarkup(markup: string): ParsedTemplateMarkup {
  if (!markup) return { text: '', vars: [] };
  const vars: TemplateVarMeta[] = [];
  const re = /<template\b([^>]*)>([\s\S]*?)<\/template>/gi;
  let lastIndex = 0;
  let out = '';
  let m: RegExpExecArray | null;

  function parseAttrs(attrStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*"([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrStr)) !== null) {
      attrs[am[1]] = am[2];
    }
    return attrs;
  }

  while ((m = re.exec(markup)) !== null) {
    const full = m[0];
    const attrStr = m[1] ?? '';
    const inner = m[2] ?? '';
    out += markup.slice(lastIndex, m.index);
    const attrs = parseAttrs(attrStr);
    const innerText = String(inner).trim();
    const name = resolveTemplateVarName(attrs, innerText);
    if (!name) {
      lastIndex = re.lastIndex;
      out += full;
      continue;
    }
    const meta: TemplateVarMeta = {
      name,
      type: attrs.type,
      label: attrs.label,
      defaultValue: attrs.defaultValue,
      required: attrs.required === 'true',
    };
    vars.push(meta);
    out += `\${${name}}`;
    lastIndex = re.lastIndex;
  }
  out += markup.slice(lastIndex);
  // 纯文本里的 ${field}（手写未包 <template> 时也要识别，否则「未在 Prompt 中使用」误报、与后端 collectTemplateVars 不一致）
  const seenNames = new Set(vars.map((v) => v.name));
  for (const name of extractTemplateVars(out)) {
    if (name && !seenNames.has(name)) {
      seenNames.add(name);
      vars.push({ name, required: false });
    }
  }
  // 纯文本里的 {{field}}（未包在 <template> 内）：转为 ${field} 并纳入变量列表，供校验与后端插值
  const mustacheRe = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const seen = new Set(vars.map((v) => v.name));
  for (const mm of out.matchAll(mustacheRe)) {
    const name = mm[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      vars.push({ name, required: false });
    }
  }
  out = out.replace(mustacheRe, (_m, name: string) => `\${${name}}`);
  return { text: out, vars };
}

/** Output Prompt 侧栏：合同骨架预览（空结构示意） */
export function buildContractSkeletonPreview(schema: JsonSchema | undefined): Record<string, unknown> {
  const props = (schema?.properties ?? {}) as Record<string, unknown>;
  const basic: Record<string, unknown> = {};
  const business: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(props)) {
    const d = def && typeof def === 'object' ? (def as Record<string, unknown>) : {};
    const zone = d['x-zone'] === 'basic' ? 'basic' : 'business';
    const placeholder =
      d.type === 'array' ? [] : d.type === 'object' ? {} : d.type === 'number' || d.type === 'integer' ? 0 : '';
    if (zone === 'basic') basic[name] = placeholder;
    else business[name] = placeholder;
  }
  return {
    meta: {
      version: 'mxm-warp/1',
      scope: '…',
      taskKey: '…',
      subtype: '…',
      taskId: '…',
    },
    basic,
    business,
    sources: { websource: null },
    assets: {},
    enrich_search: { result: null },
  };
}

export { COST_TO_MXM_TOKEN_RATE_DEFAULT, DEFAULT_MARGIN };
