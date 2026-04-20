// AdminBusiness shared utility functions
// Extracted from AdminBusiness.tsx

import type {
  GenerateParamsConfig,
  JsonSchema,
  ParsedTemplateMarkup,
  PromptConfigRow,
  SchemaFieldRow,
  Scope,
  TaskTemplateDraft,
  TemplateVarMeta,
} from './AdminBusiness.types';
import type { ProviderPricingRow } from '../api/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RECOMMENDED_GENERATE_PARAMS = {
  temperature: 0.5,
  maxTokens: 1600,
  topP: 0.95,
} as const;

export const GENERATE_PARAM_TOOLTIPS: Record<string, string> = {
  temperature:
    '控制输出的随机性/发散程度。数值越高，表达越多样、越有创意，但也更容易偏离指令；越低越稳定、越「照章办事」。规划、结构化 JSON 等任务通常用中低温度。',
  maxTokens:
    '单次生成允许模型输出的最大 token 数（约等于可生成内容长度上限）。过小容易截断；过大则延迟与计费更高。仅约束「输出侧」，不含输入 prompt 长度。',
  topP:
    '核采样（nucleus sampling）：只在累计概率达到 topP 的候选词集合里采样。越接近 1 保留的候选越多、输出略更多样；越小越保守。常与 temperature 一起调节风格。',
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

function getBusinessTypeForPromptRowLocal(r: Pick<PromptConfigRow, 'scope' | 'type'>): string {
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
}

export { getBusinessTypeForPromptRowLocal as getBusinessTypeForPromptRow };

// ---------------------------------------------------------------------------
// Generate params helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function readGenerateParams(extra: unknown): GenerateParamsConfig | null {
  if (!isRecord(extra)) return null;
  const gp = extra.generateParams;
  if (!isRecord(gp)) return null;
  const temperature = toNum(gp.temperature);
  const maxTokens = toNum(gp.maxTokens);
  const topP = toNum(gp.topP);
  if (temperature == null && maxTokens == null && topP == null) return null;
  return { temperature, maxTokens, topP };
}

export function mergeGenerateParams(
  prev: Record<string, unknown> | undefined,
  next: Partial<typeof RECOMMENDED_GENERATE_PARAMS>
) {
  const prevGp = (prev?.generateParams && typeof prev.generateParams === 'object'
    ? (prev.generateParams as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  return {
    ...prev,
    generateParams: {
      ...prevGp,
      ...Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined)
      ),
    },
  } as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Model routing helpers
// ---------------------------------------------------------------------------

export function allowedModelScopesForBusiness(scope: Scope): string[] {
  if (scope === 'graph') return ['graph'];
  if (scope === 'audio') return ['audio'];
  if (scope === 'music') return ['music', 'audio'];
  if (scope === 'video') return ['video'];
  if (scope === 'outline') return ['outline', 'writing', 'text', 'default'];
  if (scope === 'text') return ['text', 'writing', 'default'];
  // writing
  return ['writing', 'text', 'default'];
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
      rulesFallback: opts?.rules,
      outputFormatFallback: opts?.outputFormat,
    });
  }
  const unifiedMarkup =
    typeof prompt.unifiedTemplateMarkup === 'string' && String(prompt.unifiedTemplateMarkup).trim()
      ? String(prompt.unifiedTemplateMarkup)
      : unified;

  return {
    formSchema,
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
      if (!storage || typeof storage !== 'object') return undefined;
      const s = storage as Record<string, unknown>;
      return {
        scope: (s.scope as Scope) ?? 'writing',
        extension: String(s.extension ?? 'json'),
        mime: s.mime != null ? String(s.mime) : undefined,
        bucket: s.bucket != null ? String(s.bucket) : undefined,
        pathTemplate: s.pathTemplate != null ? String(s.pathTemplate) : undefined,
        filenameTemplate: s.filenameTemplate != null ? String(s.filenameTemplate) : undefined,
      };
    })(),
    uiSchema: (() => {
      const uiSchema = (tpl as Record<string, unknown> | null)?.uiSchema;
      return uiSchema && typeof uiSchema === 'object' ? (uiSchema as Record<string, unknown>) : undefined;
    })(),
    extra: (() => {
      const extra = (tpl as Record<string, unknown> | null)?.extra;
      return extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : undefined;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Schema field manipulation
// ---------------------------------------------------------------------------

const UI_TYPES = ['text', 'string', 'number', 'selection', 'referenceImages'] as const;
type UiType = (typeof UI_TYPES)[number];

export { UI_TYPES };
export type { UiType };

export function schemaTypeToUiType(d: Record<string, unknown>): string {
  const xUi = d['x-ui-type'];
  if (xUi === 'text' || xUi === 'string' || xUi === 'number' || xUi === 'selection' || xUi === 'referenceImages') return xUi;
  const t = String(d.type ?? 'string');
  if (t === 'number' || t === 'integer') return 'number';
  if (Array.isArray(d.enum) && d.enum.length > 0) return 'selection';
  if (t === 'string') return 'string';
  return 'string';
}

/** 系统保留字段：不应进入 Admin 可编辑的 schema。 */
const SYSTEM_SCHEMA_FIELDS = ['uid'] as const;
export const SYSTEM_SCHEMA_FIELD_SET = new Set<string>(SYSTEM_SCHEMA_FIELDS as unknown as string[]);

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
  return Object.entries(props).map(([name, def]) => {
    const d = def && typeof def === 'object' ? (def as Record<string, unknown>) : {};
    const enumArr = Array.isArray(d.enum) ? d.enum : undefined;
    const enumText = enumArr ? enumArr.map((x) => String(x)).join('\n') : '';
    const enumLabels = Array.isArray(d['x-enum-labels']) ? (d['x-enum-labels'] as string[]) : undefined;
    const enumLabelsText = enumLabels ? enumLabels.map((x) => String(x)).join('\n') : '';
    const defaultText = d.default != null ? String(d.default) : '';
    const type = schemaTypeToUiType(d);
    const userVisible = d['x-user-visible'] !== false;
    return {
      key: name,
      name,
      type,
      title: d.title != null ? String(d.title) : undefined,
      description: d.description != null ? String(d.description) : undefined,
      required: requiredSet.has(name),
      userVisible,
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
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    if (SYSTEM_SCHEMA_FIELD_SET.has(name)) continue;
    const def: Record<string, unknown> = {};
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
    } else if (uiType === 'number') {
      def.type = 'number';
      def['x-ui-type'] = 'number';
    } else if (uiType === 'selection') {
      def.type = 'string';
      def['x-ui-type'] = 'selection';
    } else if (uiType === 'text') {
      def.type = 'string';
      def['x-ui-type'] = 'text';
    } else {
      def.type = 'string';
      def['x-ui-type'] = 'string';
    }
    if (r.title) def.title = String(r.title);
    if (r.description) def.description = String(r.description);
    if (r.userVisible === false) def['x-user-visible'] = false;
    const enumLines = String(r.enumText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (enumLines.length > 0) def.enum = enumLines;
    const labelLines = String(r.enumLabelsText || '')
      .split('\n')
      .map((s) => s.trim());
    if (labelLines.length > 0) def['x-enum-labels'] = labelLines.slice(0, enumLines.length);
    if (r.defaultText != null && String(r.defaultText).trim() !== '') {
      const dt = String(r.defaultText).trim();
      if (uiType === 'referenceImages') {
        try {
          const parsed = JSON.parse(dt);
          def.default = parsed;
        } catch {
          def.default = dt;
        }
      } else {
        def.default = uiType === 'number' ? Number(dt) : dt;
      }
    }
    props[name] = def;
    if (r.required) required.push(name);
  }
  next.properties = props;
  next.required = required;
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

export function buildMarkupFromTemplate(template: string, schema: JsonSchema): string {
  if (!template) return '';
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  const requiredArr = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const requiredSet = new Set<string>(requiredArr);

  const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let lastIndex = 0;
  let out = '';
  let m: RegExpExecArray | null;

  while ((m = re.exec(template)) !== null) {
    const varName = m[1];
    out += template.slice(lastIndex, m.index);
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

  out += template.slice(lastIndex);
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
    const name = attrs.name || innerText.replace(/[^a-zA-Z0-9_]/g, '').trim();
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
  return { text: out, vars };
}

export { COST_TO_MXM_TOKEN_RATE_DEFAULT, DEFAULT_MARGIN };
