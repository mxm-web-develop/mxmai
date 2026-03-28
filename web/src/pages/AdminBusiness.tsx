import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listPromptConfig,
  getPromptConfigByKey,
  deletePromptConfig,
  upsertPromptConfig,
  type PromptConfigBody,
  getProvidersRouting,
  getProvidersOptions,
  postProvidersRouting,
  deleteProvidersRouting,
  getProviderPricing,
  getBusinessPricing,
  upsertBusinessPricing,
  type ProviderRoutingEntry,
  type ProviderPricingRow,
  type BusinessPricingRow,
} from '../api/client';
import { Alert, Button, Divider, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Segmented, Space, Switch, Tabs, Table, Tag, Tooltip, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { PromptTempDesigner } from '@mxmweb/rtext';
import AdminSensitiveWords from './AdminSensitiveWords';
import AdminKnowledgeDefaults from './AdminKnowledgeDefaults';
import AdminPayment from './AdminPayment';

type Scope = 'writing' | 'outline' | 'graph' | 'audio' | 'video';

type PromptConfigRow = {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
  extra?: Record<string, unknown> | null;
  is_active: boolean;
  updated_at?: string;
};

type BusinessPricingView = {
  businessType: string;
  subtype: string | null;
  chargeMetric: string;
  resolved?: { provider: string; model_key: string; overridden?: boolean };
  providerCost?: ProviderPricingRow;
  costTokens?: { unit?: number; input?: number; output?: number };
  recommendedTokens?: { unit?: number; input?: number; output?: number };
  configured?: BusinessPricingRow | null;
};

type JsonSchema = {
  $schema?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

type PipelineStep = { step: string; params?: Record<string, unknown> };

type SchemaFieldRow = {
  key: string;
  name: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  enumText: string;
  /** 枚举展示名（与 enum 一一对应），对应 schema 的 x-enum-labels，每行一个 */
  enumLabelsText: string;
  defaultText: string;
};

type TaskTemplateDraft = {
  formSchema: JsonSchema;
  prompt: {
    systemTemplate: string;
    userTemplate?: string;
    outputFormatTemplate: string;
    systemTemplateMarkup?: string;
    userTemplateMarkup?: string;
    outputFormatTemplateMarkup?: string;
  };
  inputPipeline?: PipelineStep[];
  outputPipeline?: PipelineStep[];
  knowledge?: {
    useKnowledge: boolean;
    defaultKnowledgeBaseIds?: string[];
    strategy?: 'global' | 'per_section' | 'none';
  };
  storage?: {
    scope: Scope;
    extension: string;
    mime?: string;
    bucket?: string;
    pathTemplate?: string;
    filenameTemplate?: string;
  };
  uiSchema?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 成本折算系数：将 Provider 成本（内部币种）折算为 MXM-TOKEN
const COST_TO_MXM_TOKEN_RATE_DEFAULT = 1000;
const DEFAULT_MARGIN = 0.2;

function getBusinessTypeForPromptRow(r: Pick<PromptConfigRow, 'scope' | 'type'>): string {
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

function toNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function getMetaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  if (!meta) return undefined;
  return toNum(meta[key]);
}

function computeRecommendedTokensFromProviderCost(
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

function allowedModelScopesForBusiness(scope: Scope): string[] {
  if (scope === 'graph') return ['graph'];
  if (scope === 'audio') return ['audio'];
  if (scope === 'video') return ['video'];
  if (scope === 'outline') return ['outline', 'writing', 'text', 'default'];
  // writing
  return ['writing', 'text', 'default'];
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function ensureTaskTemplate(tpl: unknown): TaskTemplateDraft {
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
  return {
    formSchema,
    prompt: {
      systemTemplate: String(prompt.systemTemplate ?? '').trim(),
      userTemplate: prompt.userTemplate != null ? String(prompt.userTemplate) : undefined,
      outputFormatTemplate: String(prompt.outputFormatTemplate ?? '').trim(),
      systemTemplateMarkup:
        typeof prompt.systemTemplateMarkup === 'string'
          ? String(prompt.systemTemplateMarkup)
          : String(prompt.systemTemplate ?? '').trim(),
      userTemplateMarkup:
        typeof prompt.userTemplateMarkup === 'string'
          ? String(prompt.userTemplateMarkup)
          : prompt.userTemplate != null
          ? String(prompt.userTemplate)
          : '',
      outputFormatTemplateMarkup:
        typeof prompt.outputFormatTemplateMarkup === 'string'
          ? String(prompt.outputFormatTemplateMarkup)
          : String(prompt.outputFormatTemplate ?? '').trim(),
    },
    inputPipeline: Array.isArray((tpl as Record<string, unknown> | null)?.inputPipeline) ? (((tpl as Record<string, unknown>).inputPipeline as unknown) as PipelineStep[]) : [{ step: 'noop' }],
    outputPipeline: Array.isArray((tpl as Record<string, unknown> | null)?.outputPipeline) ? (((tpl as Record<string, unknown>).outputPipeline as unknown) as PipelineStep[]) : [{ step: 'noop' }],
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

/** 前端组件用的 UI 类型，便于渲染 input/textarea/number/select */
const UI_TYPES = ['text', 'string', 'number', 'selection'] as const;
type UiType = (typeof UI_TYPES)[number];

function schemaTypeToUiType(d: Record<string, unknown>): string {
  const xUi = d['x-ui-type'];
  if (xUi === 'text' || xUi === 'string' || xUi === 'number' || xUi === 'selection') return xUi;
  const t = String(d.type ?? 'string');
  if (t === 'number' || t === 'integer') return 'number';
  if (Array.isArray(d.enum) && d.enum.length > 0) return 'selection';
  if (t === 'string') return 'string';
  return 'string';
}

function schemaPropsToFieldRows(schema: JsonSchema): SchemaFieldRow[] {
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  const requiredSet = new Set<string>((schema.required ?? []).map(String));
  return Object.entries(props).map(([name, def]) => {
    const d = def && typeof def === 'object' ? (def as Record<string, unknown>) : {};
    const enumArr = Array.isArray(d.enum) ? d.enum : undefined;
    const enumText = enumArr ? enumArr.map((x) => String(x)).join('\n') : '';
    const enumLabels = Array.isArray(d['x-enum-labels']) ? (d['x-enum-labels'] as string[]) : undefined;
    const enumLabelsText = enumLabels ? enumLabels.map((x) => String(x)).join('\n') : '';
    const defaultText = d.default != null ? String(d.default) : '';
    const type = schemaTypeToUiType(d);
    return {
      key: name,
      name,
      type,
      title: d.title != null ? String(d.title) : undefined,
      description: d.description != null ? String(d.description) : undefined,
      required: requiredSet.has(name),
      enumText: enumText ?? '',
      enumLabelsText: enumLabelsText ?? '',
      defaultText: defaultText ?? '',
    };
  });
}

function fieldRowsToSchema(
  base: JsonSchema,
  rows: SchemaFieldRow[]
): JsonSchema {
  const next: JsonSchema = { ...base, type: base.type ?? 'object' };
  const props: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const def: Record<string, unknown> = {};
    const uiType = UI_TYPES.includes(r.type as UiType) ? (r.type as UiType) : 'string';
    if (uiType === 'number') {
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
      def.default = uiType === 'number' ? Number(dt) : dt;
    }
    props[name] = def;
    if (r.required) required.push(name);
  }
  next.properties = props;
  next.required = required;
  if (!next.$schema) next.$schema = 'http://json-schema.org/draft-07/schema#';
  return next;
}

function stepListToText(steps: PipelineStep[] | undefined): string {
  return prettyJson(steps ?? []);
}

function textToStepList(text: string): PipelineStep[] {
  const parsed = safeJsonParse<unknown>(text);
  if (!parsed.ok) throw new Error(parsed.error);
  if (!Array.isArray(parsed.value)) throw new Error('必须是 JSON 数组');
  return (parsed.value as unknown[]).map((x) => {
    if (!x || typeof x !== 'object') return { step: 'noop' };
    const obj = x as Record<string, unknown>;
    const step = typeof obj.step === 'string' ? obj.step : 'noop';
    const params = obj.params && typeof obj.params === 'object' ? (obj.params as Record<string, unknown>) : undefined;
    return { step, params };
  });
}

function extractTemplateVars(text: string): string[] {
  const out: string[] = [];
  const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

function escapeAttr(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildMarkupFromTemplate(template: string, schema: JsonSchema): string {
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

type TemplateVarMeta = {
  name: string;
  type?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
};

type ParsedTemplateMarkup = {
  text: string;
  vars: TemplateVarMeta[];
};

function parseTemplateMarkup(markup: string): ParsedTemplateMarkup {
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

const SYSTEM_SCHEMA_FIELDS = ['uid', 'label', 'prompt', 'language'] as const;
const SYSTEM_SCHEMA_FIELD_SET = new Set<string>(SYSTEM_SCHEMA_FIELDS as unknown as string[]);

export default function AdminBusiness() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<PromptConfigRow[]>([]);
  const [scopeFilter, setScopeFilter] = useState<Scope>('writing');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<PromptConfigRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<TaskTemplateDraft | null>(null);
  const [extraDraft, setExtraDraft] = useState<Record<string, unknown>>({});
  const [isActive, setIsActive] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [systemTemplateMarkup, setSystemTemplateMarkup] = useState('');
  const [userTemplateMarkup, setUserTemplateMarkup] = useState('');
  const [outputFormatMarkup, setOutputFormatMarkup] = useState('');

  const [schemaMode, setSchemaMode] = useState<'guided' | 'json'>('guided');
  const [schemaRows, setSchemaRows] = useState<SchemaFieldRow[]>(() => schemaPropsToFieldRows({ type: 'object', properties: {}, required: [] }));
  const [schemaJson, setSchemaJson] = useState('{}');
  const [promptVarSearch, setPromptVarSearch] = useState('');
  /** Prompt 页内当前编辑的类型，三种 prompt 可切换设置 */
  const [activePromptType, setActivePromptType] = useState<'system' | 'user' | 'outputFormat'>('system');
  /** Drawer 内当前 Tab：schema | prompt | pipelines | knowledge_storage */
  const [drawerTabKey, setDrawerTabKey] = useState<string>('schema');

  const [inputPipelineText, setInputPipelineText] = useState(stepListToText([{ step: 'noop' }]));
  const [outputPipelineText, setOutputPipelineText] = useState(stepListToText([{ step: 'noop' }]));

  const [saving, setSaving] = useState(false);

  const [routing, setRouting] = useState<Record<string, ProviderRoutingEntry>>({});
  const [modelsByProviderByScope, setModelsByProviderByScope] = useState<Record<string, Record<string, string[]>>>({});
  const [providerPricing, setProviderPricing] = useState<ProviderPricingRow[]>([]);
  const [businessPricing, setBusinessPricing] = useState<BusinessPricingRow[]>([]);

  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingForm] = Form.useForm<{
    margin: number;
    unit?: number;
    input?: number;
    output?: number;
    min_charge_tokens?: number;
  }>();

  const pricingMarginPct = Form.useWatch('margin', pricingForm);
  const pricingUnit = Form.useWatch('unit', pricingForm);
  const pricingInput = Form.useWatch('input', pricingForm);
  const pricingOutput = Form.useWatch('output', pricingForm);
  const pricingSyncRef = useRef<{ source: 'margin' | 'price' | null }>({ source: null });

  const [routeProvider, setRouteProvider] = useState<string>('');
  const [routeModel, setRouteModel] = useState<string>('');
  const [routeSaving, setRouteSaving] = useState(false);

  // create
  const [createOpen, setCreateOpen] = useState(false);
  const [createScope, setCreateScope] = useState<Scope>('writing');
  const [createTaskKey, setCreateTaskKey] = useState('');
  const [createSubtype, setCreateSubtype] = useState('');

  const loadList = useCallback(async () => {
    if (!isLoggedIn || !isAdmin) return;
    setLoading(true);
    try {
      const [res, routingRes, optionsRes, providerPricingRes, businessPricingRes] = await Promise.all([
        listPromptConfig({ scope: scopeFilter, type: undefined }),
        getProvidersRouting(),
        getProvidersOptions(),
        getProviderPricing(),
        getBusinessPricing(),
      ]);
      const raw = res.data as { data?: { items?: PromptConfigRow[] } } | undefined;
      const items = raw?.data?.items as PromptConfigRow[] | undefined;
      if (!res.error && Array.isArray(items)) setList(items);
      else setList([]);

      const rdata = (routingRes.data as { data?: Record<string, ProviderRoutingEntry> } | undefined)?.data ?? {};
      const optData = (optionsRes.data as {
        data?: { modelsByProviderByScope?: Record<string, Record<string, string[]>> };
      } | undefined)?.data;
      const pp = (providerPricingRes.data as { data?: ProviderPricingRow[] } | undefined)?.data ?? [];
      const bp = (businessPricingRes.data as { data?: BusinessPricingRow[] } | undefined)?.data ?? [];
      setRouting(rdata);
      setModelsByProviderByScope(optData?.modelsByProviderByScope ?? {});
      setProviderPricing(pp);
      setBusinessPricing(bp);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, isAdmin, scopeFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const visibleList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const k = `${r.scope}/${r.type}/${r.subtype ?? ''}`.toLowerCase();
      return k.includes(q);
    });
  }, [list, search]);

  const providerPricingIndex = useMemo(() => {
    const map = new Map<string, ProviderPricingRow>();
    for (const r of providerPricing) {
      map.set(`${r.provider}||${r.scope}||${r.model_key}`, r);
    }
    return map;
  }, [providerPricing]);

  const businessPricingIndex = useMemo(() => {
    const map = new Map<string, BusinessPricingRow>();
    for (const r of businessPricing) {
      const key = `${r.business_type}||${r.charge_metric}||${r.subtype ?? ''}`;
      map.set(key, r);
    }
    return map;
  }, [businessPricing]);

  const pricingViewsById = useMemo(() => {
    const result = new Map<string, BusinessPricingView>();
    for (const r of visibleList) {
      const businessType = getBusinessTypeForPromptRow(r);
      const resolved = routing[businessType];
      const provider = resolved?.provider;
      const modelKey = resolved?.model;
      const resolvedObj = provider && modelKey ? { provider, model_key: modelKey, overridden: resolved.overridden } : undefined;

      const pp =
        provider && modelKey
          ? providerPricingIndex.get(`${provider}||${r.scope}||${modelKey}`) ??
            providerPricingIndex.get(`${provider}||default||${modelKey}`)
          : undefined;

      const chargeMetric = pp?.charge_mode ?? 'unknown';
      const configured = businessPricingIndex.get(`${businessType}||${chargeMetric}||${r.subtype ?? ''}`) ?? null;
      const { costTokens, recommendedTokens } = pp
        ? computeRecommendedTokensFromProviderCost(pp)
        : { costTokens: undefined, recommendedTokens: undefined };

      result.set(r.id, {
        businessType,
        subtype: r.subtype ?? null,
        chargeMetric,
        resolved: resolvedObj,
        providerCost: pp,
        costTokens: costTokens ?? undefined,
        recommendedTokens: recommendedTokens ?? undefined,
        configured,
      });
    }
    return result;
  }, [visibleList, routing, providerPricingIndex, businessPricingIndex]);

  const hydratePricingFormByRow = useCallback((row: PromptConfigRow) => {
    const view = pricingViewsById.get(row.id);
    const marginFromMeta = toNum(view?.configured?.metadata?.margin);
    const configuredMeta = view?.configured?.metadata ?? {};
    const inputFromMeta = getMetaNumber(configuredMeta, 'input_price_in_tokens');
    const outputFromMeta = getMetaNumber(configuredMeta, 'output_price_in_tokens');

    const rec = view?.recommendedTokens;
    const cost = view?.costTokens;
    const configuredUnit = view?.configured?.price_in_tokens;
    const configuredIn = inputFromMeta;
    const configuredOut = outputFromMeta;

    // margin 优先取 metadata；否则按“已配置收费 / 成本折算”反推；再否则默认 20%
    let margin = marginFromMeta != null ? marginFromMeta : undefined;
    if (margin == null && view?.chargeMetric === 'token_based') {
      const parts: number[] = [];
      if (cost?.input != null && configuredIn != null && cost.input > 0) parts.push(configuredIn / cost.input - 1);
      if (cost?.output != null && configuredOut != null && cost.output > 0) parts.push(configuredOut / cost.output - 1);
      if (parts.length) margin = parts.reduce((a, b) => a + b, 0) / parts.length;
    } else if (margin == null && view?.chargeMetric !== 'token_based') {
      if (cost?.unit != null && configuredUnit != null && cost.unit > 0) margin = Number(configuredUnit) / cost.unit - 1;
    }
    if (margin == null || !Number.isFinite(margin)) margin = DEFAULT_MARGIN;

    pricingForm.setFieldsValue({
      margin: Math.round(margin * 100),
      unit: view?.configured?.price_in_tokens ?? (rec?.unit != null ? Number(rec.unit.toFixed(4)) : undefined),
      input: inputFromMeta ?? (rec?.input != null ? Number(rec.input.toFixed(4)) : undefined),
      output: outputFromMeta ?? (rec?.output != null ? Number(rec.output.toFixed(4)) : undefined),
      min_charge_tokens: view?.configured?.min_charge_tokens != null ? Number(view.configured.min_charge_tokens) : 0,
    });
  }, [pricingForm, pricingViewsById]);

  const saveBusinessPricingForSelected = async () => {
    if (!selected) return;
    const values = await pricingForm.validateFields().catch(() => null);
    if (!values) return;
    const view = pricingViewsById.get(selected.id);
    if (!view) return;
    setPricingSaving(true);
    try {
      const margin = Number(values.margin) / 100;
      const payload: Record<string, unknown> = {
        margin,
      };
      if (view.chargeMetric === 'token_based') {
        payload.input_price_in_tokens = values.input ?? null;
        payload.output_price_in_tokens = values.output ?? null;
      }

      const res = await upsertBusinessPricing({
        id: view.configured?.id,
        business_type: view.businessType,
        charge_metric: view.chargeMetric,
        subtype: selected.subtype ?? null,
        provider: view.resolved?.provider ?? null,
        model_key: view.resolved?.model_key ?? null,
        price_in_tokens: view.chargeMetric === 'token_based' ? 0 : Number(values.unit ?? 0),
        min_charge_tokens: Number(values.min_charge_tokens ?? 0),
        metadata: payload,
      });
      if (res.error) {
        message.error(`保存失败：${res.error}`);
        return;
      }
      message.success('已保存业务收费');
      const refreshed = await getBusinessPricing();
      const bp = (refreshed.data as { data?: BusinessPricingRow[] } | undefined)?.data ?? [];
      setBusinessPricing(bp);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPricingSaving(false);
    }
  };

  // 双向联动（编辑页“模型与定价”Tab）：
  // - 改收益%：按成本自动算 MXM-TOKEN 并回填
  // - 改 MXM-TOKEN：反向算收益% 并回填
  useEffect(() => {
    if (!drawerOpen || !selected) return;
    const view = pricingViewsById.get(selected.id);
    const pp = view?.providerCost;
    const cost = view?.costTokens;
    if (!pp || !cost) return;

    const marginPct = typeof pricingMarginPct === 'number' && Number.isFinite(pricingMarginPct) ? pricingMarginPct : 20;
    const margin = marginPct / 100;

    // 1) margin 驱动 price
    if (pricingSyncRef.current.source === 'margin') {
      const { recommendedTokens } = computeRecommendedTokensFromProviderCost(pp, COST_TO_MXM_TOKEN_RATE_DEFAULT, margin);
      if (view.chargeMetric === 'token_based') {
        pricingForm.setFieldsValue({
          input: recommendedTokens.input != null ? Number(recommendedTokens.input.toFixed(4)) : undefined,
          output: recommendedTokens.output != null ? Number(recommendedTokens.output.toFixed(4)) : undefined,
        });
      } else {
        pricingForm.setFieldsValue({
          unit: recommendedTokens.unit != null ? Number(recommendedTokens.unit.toFixed(4)) : undefined,
        });
      }
      pricingSyncRef.current.source = null;
      return;
    }

    // 2) price 驱动 margin
    if (pricingSyncRef.current.source === 'price') {
      const parts: number[] = [];
      if (view.chargeMetric === 'token_based') {
        if (cost.input != null && pricingInput != null && cost.input > 0) parts.push(pricingInput / cost.input - 1);
        if (cost.output != null && pricingOutput != null && cost.output > 0) parts.push(pricingOutput / cost.output - 1);
      } else {
        if (cost.unit != null && pricingUnit != null && cost.unit > 0) parts.push(pricingUnit / cost.unit - 1);
      }
      if (parts.length) {
        const m = parts.reduce((a, b) => a + b, 0) / parts.length;
        pricingForm.setFieldsValue({ margin: Math.round(m * 100) });
      }
      pricingSyncRef.current.source = null;
      return;
    }
  }, [
    drawerOpen,
    selected,
    pricingViewsById,
    pricingForm,
    pricingMarginPct,
    pricingUnit,
    pricingInput,
    pricingOutput,
  ]);

  const templateVars = useMemo(() => {
    const props = draft?.formSchema?.properties ?? {};
    return Object.keys(props);
  }, [draft?.formSchema]);

  const promptVarsUsed = useMemo(() => {
    if (!draft) return [];
    const sys = draft.prompt.systemTemplate ?? '';
    const usr = draft.prompt.userTemplate ?? '';
    const out = draft.prompt.outputFormatTemplate ?? '';
    return Array.from(new Set([...extractTemplateVars(sys), ...extractTemplateVars(usr), ...extractTemplateVars(out)]));
  }, [draft]);

  const missingSchemaVars = useMemo(() => {
    const schemaVars = new Set(templateVars);
    return promptVarsUsed.filter((v) => !schemaVars.has(v));
  }, [promptVarsUsed, templateVars]);

  const openRow = useCallback(async (row: PromptConfigRow) => {
    setSelected(row);
    setDraft(null);
    setExtraDraft({});
    setIsActive(row.is_active);
    setDrawerOpen(true);
    setDetailLoading(true);
    const res = await getPromptConfigByKey({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype ?? undefined,
      lang: 'zh',
    });
    setDetailLoading(false);
    const data = (res.data as { data?: PromptConfigRow } | undefined)?.data;
    if (res.error || !data) {
      message.error(res.error || '加载失败');
      return;
    }
    const extra = (data.extra ?? row.extra ?? {}) as Record<string, unknown>;
    const taskTemplate = (extra as Record<string, unknown>)?.taskTemplate;
    const tpl = ensureTaskTemplate(taskTemplate);
    setDraft(tpl);
    setExtraDraft(extra);
    setIsActive(data.is_active ?? row.is_active ?? true);

    const sysRaw = tpl.prompt.systemTemplateMarkup ?? tpl.prompt.systemTemplate ?? '';
    const usrRaw = tpl.prompt.userTemplateMarkup ?? tpl.prompt.userTemplate ?? '';
    const outRaw = tpl.prompt.outputFormatTemplateMarkup ?? tpl.prompt.outputFormatTemplate ?? '';

    const sysMarkup = sysRaw.includes('<template')
      ? sysRaw
      : buildMarkupFromTemplate(sysRaw, tpl.formSchema);
    const usrMarkup = usrRaw.includes('<template')
      ? usrRaw
      : buildMarkupFromTemplate(usrRaw, tpl.formSchema);
    const outMarkup = outRaw.includes('<template')
      ? outRaw
      : buildMarkupFromTemplate(outRaw, tpl.formSchema);

    setSystemTemplateMarkup(sysMarkup);
    setUserTemplateMarkup(usrMarkup);
    setOutputFormatMarkup(outMarkup);

    setSchemaMode('guided');
    setSchemaRows(schemaPropsToFieldRows(tpl.formSchema));
    setSchemaJson(prettyJson(tpl.formSchema));
    setInputPipelineText(stepListToText(tpl.inputPipeline));
    setOutputPipelineText(stepListToText(tpl.outputPipeline));
    hydratePricingFormByRow(row);
    const businessType = getBusinessTypeForPromptRow(row);
    const resolved = routing[businessType];
    setRouteProvider(resolved?.provider ?? '');
    setRouteModel(resolved?.model ?? '');
    setDrawerTabKey('schema');
  }, [hydratePricingFormByRow, routing]);

  const saveBusinessRouteForSelected = async () => {
    if (!selected || !routeProvider || !routeModel) {
      message.warning('请选择 provider 和 model');
      return;
    }
    const businessType = getBusinessTypeForPromptRow(selected);
    setRouteSaving(true);
    try {
      const res = await postProvidersRouting({
        logicalModel: businessType,
        provider: routeProvider,
        model: routeModel,
      });
      if (res.error) {
        message.error(`保存路由失败：${res.error}`);
        return;
      }
      message.success('已切换业务物理模型');
      await loadList();
    } finally {
      setRouteSaving(false);
    }
  };

  const clearBusinessRouteOverrideForSelected = async () => {
    if (!selected) return;
    const businessType = getBusinessTypeForPromptRow(selected);
    setRouteSaving(true);
    try {
      const res = await deleteProvidersRouting(businessType);
      if (res.error) {
        message.error(`清除覆盖失败：${res.error}`);
        return;
      }
      message.success('已恢复默认路由');
      await loadList();
      const resolved = routing[businessType];
      setRouteProvider(resolved?.provider ?? '');
      setRouteModel(resolved?.model ?? '');
    } finally {
      setRouteSaving(false);
    }
  };

  const currentRoutableModels = useMemo(() => {
    if (!selected || !routeProvider) return [];
    const allowedScopes = allowedModelScopesForBusiness(selected.scope as Scope);
    const modelSet = new Set<string>();
    for (const s of allowedScopes) {
      const arr = modelsByProviderByScope?.[routeProvider]?.[s] ?? [];
      for (const m of arr) modelSet.add(m);
    }
    const withPrice: Array<{ value: string; label: string }> = [];
    for (const m of modelSet) {
      let matchedScope: string | null = null;
      let pricing: ProviderPricingRow | undefined;
      for (const s of allowedScopes) {
        const p = providerPricingIndex.get(`${routeProvider}||${s}||${m}`);
        if (p) {
          matchedScope = s;
          pricing = p;
          break;
        }
      }
      if (!pricing) continue;
      const costLabel =
        pricing.charge_mode === 'token_based'
          ? `in:${pricing.input_unit_price ?? '-'} / out:${pricing.output_unit_price ?? '-'} ${pricing.currency ?? 'USD'}`
          : `${pricing.unit_price ?? 0} ${pricing.currency ?? 'USD'}`;
      withPrice.push({
        value: m,
        label: `${m} · ${matchedScope ?? 'default'} · ${costLabel}`,
      });
    }
    return withPrice.sort((a, b) => a.value.localeCompare(b.value));
  }, [selected, routeProvider, modelsByProviderByScope, providerPricingIndex]);

  const routeDirty = useMemo(() => {
    if (!selected) return false;
    const businessType = getBusinessTypeForPromptRow(selected);
    const resolved = routing[businessType];
    const currentProvider = resolved?.provider ?? '';
    const currentModel = resolved?.model ?? '';
    return routeProvider !== currentProvider || routeModel !== currentModel;
  }, [selected, routing, routeProvider, routeModel]);

  const handleCreate = async () => {
    const taskKey = createTaskKey.trim();
    const subtype = createSubtype.trim();
    if (!taskKey) {
      message.warning('taskKey 不能为空');
      return;
    }
    const initial: TaskTemplateDraft = ensureTaskTemplate({
      formSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          prompt: { type: 'string', title: '写作需求', minLength: 1 },
          uid: { type: 'string', title: '任务 UID', description: '前端生成的唯一 ID，用于调试/追踪' },
        },
        required: ['prompt', 'uid'],
      },
      prompt: {
        systemTemplate: '',
        userTemplate: '【用户需求】\n${prompt}',
        outputFormatTemplate: '',
      },
      inputPipeline: [{ step: 'noop' }],
      outputPipeline: [{ step: 'noop' }],
    });
    const row: PromptConfigRow = {
      id: `new:${createScope}/${taskKey}/${subtype || '-'}`,
      scope: createScope,
      type: taskKey,
      subtype: subtype || null,
      extra: { taskTemplate: initial },
      is_active: true,
    };
    setCreateOpen(false);
    setSelected(row);
    setDraft(initial);
    setExtraDraft({ taskTemplate: initial });
    setIsActive(true);
    setDrawerOpen(true);
    setSystemTemplateMarkup(initial.prompt.systemTemplateMarkup ?? initial.prompt.systemTemplate ?? '');
    setUserTemplateMarkup(initial.prompt.userTemplateMarkup ?? initial.prompt.userTemplate ?? '');
    setOutputFormatMarkup(
      initial.prompt.outputFormatTemplateMarkup ?? initial.prompt.outputFormatTemplate ?? ''
    );
    setSchemaMode('guided');
    setSchemaRows(schemaPropsToFieldRows(initial.formSchema));
    setSchemaJson(prettyJson(initial.formSchema));
    setInputPipelineText(stepListToText(initial.inputPipeline));
    setOutputPipelineText(stepListToText(initial.outputPipeline));
    setDrawerTabKey('schema');
  };

  const handleToggleBusinessActive = async (row: PromptConfigRow, nextActive: boolean) => {
    try {
      const detail = await getPromptConfigByKey({
        scope: row.scope,
        type: row.type,
        subtype: row.subtype ?? undefined,
      });
      const full = (detail.data as { data?: Record<string, unknown> } | undefined)?.data;
      if (detail.error || !full) {
        message.error(detail.error || '读取业务配置失败');
        return;
      }
      const body: PromptConfigBody = {
        scope: row.scope,
        type: row.type,
        subtype: row.subtype ?? undefined,
        rules_i18n: (full.rules_i18n as Record<string, string> | undefined) ?? {},
        output_format_i18n: (full.output_format_i18n as Record<string, string> | undefined) ?? {},
        form_options_i18n: (full.form_options_i18n as Record<string, unknown> | undefined) ?? undefined,
        extra: (full.extra as Record<string, unknown> | undefined) ?? undefined,
        is_active: nextActive,
      };
      const res = await upsertPromptConfig(body);
      if (res.error) {
        message.error(`更新状态失败：${res.error}`);
        return;
      }
      message.success(nextActive ? '已启用业务' : '已停用业务');
      await loadList();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteBusiness = async (row: PromptConfigRow) => {
    const res = await deletePromptConfig(row.id);
    if (res.error) {
      message.error(`删除失败：${res.error}`);
      return;
    }
    message.success('业务已删除');
    await loadList();
  };

  const buildTaskTemplateFromUi = (): TaskTemplateDraft => {
    if (!draft) throw new Error('draft is null');
    const next = { ...draft };

    // schema
    if (schemaMode === 'guided') {
      next.formSchema = fieldRowsToSchema(next.formSchema, schemaRows);
    } else {
      const parsed = safeJsonParse<JsonSchema>(schemaJson);
      if (!parsed.ok) throw new Error(`Schema JSON 无效: ${parsed.error}`);
      next.formSchema = parsed.value;
    }

    // pipelines
    next.inputPipeline = textToStepList(inputPipelineText);
    next.outputPipeline = textToStepList(outputPipelineText);

    // prompt：从 rtext Markup 解析 <template>，生成执行端 `${var}` 模板，同时保留 *Markup
    const parsedSys = parseTemplateMarkup(systemTemplateMarkup);
    const parsedUser = parseTemplateMarkup(userTemplateMarkup);
    const parsedOut = parseTemplateMarkup(outputFormatMarkup);

    next.prompt = {
      ...next.prompt,
      systemTemplate: parsedSys.text.trim(),
      userTemplate: (() => {
        const t = parsedUser.text.trim();
        return t ? t : undefined;
      })(),
      outputFormatTemplate: parsedOut.text.trim(),
      systemTemplateMarkup,
      userTemplateMarkup,
      outputFormatTemplateMarkup: outputFormatMarkup,
    };

    // 根据模板中的变量元信息，自动补全 Schema 中缺失的字段定义
    const allVarsMetaMap = new Map<string, TemplateVarMeta>();
    for (const meta of [...parsedSys.vars, ...parsedUser.vars, ...parsedOut.vars]) {
      const prev = allVarsMetaMap.get(meta.name) ?? ({} as TemplateVarMeta);
      allVarsMetaMap.set(meta.name, {
        name: meta.name,
        type: meta.type ?? prev.type,
        label: meta.label ?? prev.label,
        defaultValue: meta.defaultValue ?? prev.defaultValue,
        required: meta.required ?? prev.required,
      });
    }
    if (Object.keys(next.formSchema.properties ?? {}).length === 0) {
      next.formSchema.properties = {};
    }
    const props = (next.formSchema.properties ?? {}) as Record<string, unknown>;
    const requiredArr = Array.isArray(next.formSchema.required) ? next.formSchema.required.map(String) : [];
    const requiredSet = new Set<string>(requiredArr);
    for (const [varName, meta] of allVarsMetaMap.entries()) {
      if (!Object.prototype.hasOwnProperty.call(props, varName)) {
        const def: Record<string, unknown> = {};
        def.type = meta.type ?? 'string';
        if (meta.label) def.title = meta.label;
        if (meta.defaultValue != null && String(meta.defaultValue).trim() !== '') {
          def.default =
            def.type === 'integer' || def.type === 'number'
              ? Number(meta.defaultValue)
              : String(meta.defaultValue);
        }
        (props as Record<string, Record<string, unknown>>)[varName] = def;
      }
      if (meta.required) {
        requiredSet.add(varName);
      }
    }
    next.formSchema.properties = props;
    next.formSchema.required = Array.from(requiredSet);

    return next;
  };

  const handleSave = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      const tpl = buildTaskTemplateFromUi();
      if (!tpl.prompt.systemTemplate.trim()) throw new Error('Prompt.systemTemplate 不能为空');
      if (!tpl.prompt.outputFormatTemplate.trim()) throw new Error('Prompt.outputFormatTemplate 不能为空');
      if (!tpl.formSchema || typeof tpl.formSchema !== 'object') throw new Error('formSchema 无效');
      if ((tpl.formSchema.type ?? 'object') !== 'object') throw new Error('formSchema.type 必须为 object');
      const missingVars = extractTemplateVars(
        `${tpl.prompt.systemTemplate ?? ''}\n${tpl.prompt.userTemplate ?? ''}\n${tpl.prompt.outputFormatTemplate ?? ''}`
      ).filter((v) => !(tpl.formSchema.properties && Object.prototype.hasOwnProperty.call(tpl.formSchema.properties, v)));
      if (missingVars.length > 0) {
        throw new Error(`Prompt 使用了未在 Schema 定义的变量：${missingVars.join(', ')}`);
      }

      const extra = { ...(extraDraft ?? {}), taskTemplate: tpl };
      const body: PromptConfigBody = {
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype ?? undefined,
        extra,
        is_active: isActive,
      };
      const res = await upsertPromptConfig(body);
      if (res.error) throw new Error(res.error);

      message.success('已保存');
      await loadList();
      // reload selected row from list
      const refreshed = await getPromptConfigByKey({
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype ?? undefined,
        lang: 'zh',
      });
      const refreshedRow = (refreshed.data as { data?: PromptConfigRow } | undefined)?.data;
      if (!refreshed.error && refreshedRow) {
        setSelected((prev) => (prev ? { ...prev, ...refreshedRow } : prev));
        const extraNew = (refreshedRow.extra ?? extra) as Record<string, unknown>;
        setExtraDraft(extraNew);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>业务管理</h2>
        <p>请先使用 Admin 账号登录。</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-business-page">

      <div className="admin-providers-content-wrap">
        <div className="admin-providers-content-inner">
          <Tabs
            defaultActiveKey="taskTemplate"
            items={[
              {
                key: 'taskTemplate',
                label: 'TaskTemplate',
                children: (
                  <>
                    <div className="admin-business-toolbar">
                      <Space size={10} wrap>
                        <Select<Scope>
                          value={scopeFilter}
                          onChange={(v) => setScopeFilter(v)}
                          style={{ width: 190, maxWidth: '100%' }}
                          options={[
                            { value: 'writing', label: '写作 (writing)' },
                            { value: 'outline', label: '大纲 (outline)' },
                            { value: 'graph', label: '图文 (graph)' },
                            { value: 'audio', label: '音频 (audio)' },
                            { value: 'video', label: '视频 (video)' },
                          ]}
                        />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="搜索 taskKey / subtype…"
                          style={{ width: 300, maxWidth: '100%' }}
                          allowClear
                        />
                        <Button onClick={() => loadList()} loading={loading}>
                          刷新
                        </Button>
                        <Button
                          type="primary"
                          onClick={() => {
                            setCreateScope(scopeFilter);
                            setCreateTaskKey('');
                            setCreateSubtype('');
                            setCreateOpen(true);
                          }}
                        >
                          新建业务
                        </Button>
                      </Space>
                    </div>

                    <div className="admin-business-panel admin-business-tableOnly">
                      <div className="admin-business-panel-head">
                        <div>
                          <div className="admin-business-panel-title">业务列表</div>
                          <div className="admin-business-panel-subtitle">按 scope + taskKey + subtype 管理</div>
                        </div>
                        <div className="admin-business-panel-meta">
                          <Typography.Text type="secondary">共 {visibleList.length} 条</Typography.Text>
                        </div>
                      </div>
                      <div className="admin-business-panel-body admin-business-table-wrap">
                        <Table<PromptConfigRow>
                          size="small"
                          rowKey="id"
                          dataSource={visibleList}
                          loading={loading}
                          tableLayout="fixed"
                          pagination={{ pageSize: 10, showSizeChanger: false }}
                          columns={[
                            
                            { title: 'taskKey', dataIndex: 'type', ellipsis: true },
                            {
                              title: '启用',
                              dataIndex: 'is_active',
                              width: 64,
                              render: (v: boolean) => (
                                <span
                                  className={[
                                    'admin-business-status-dot',
                                    v ? 'is-on' : 'is-off',
                                  ].join(' ')}
                                  aria-label={v ? 'enabled' : 'disabled'}
                                />
                              ),
                            },
                            { title: 'subtype', dataIndex: 'subtype', ellipsis: true, render: (v: string | null) => v ?? '-' },
                            {
                              title: '当前物理模型',
                              width: 220,
                              render: (_: unknown, r: PromptConfigRow) => {
                                const v = pricingViewsById.get(r.id);
                                if (!v?.resolved) return '—';
                                return (
                                  <Space size={6}>
                                    <Tag color={v.resolved.overridden ? 'gold' : 'blue'}>
                                      {v.resolved.provider}/{v.resolved.model_key}
                                    </Tag>
                                    {v.resolved.overridden ? <span className="muted">覆盖</span> : null}
                                  </Space>
                                );
                              },
                            },
                            {
                              title: '业务收费(MXM-TOKEN)',
                              width: 180,
                              render: (_: unknown, r: PromptConfigRow) => {
                                const v = pricingViewsById.get(r.id);
                                if (!v) return '—';
                                const tip = (
                                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                                    <div>
                                      <strong>路由</strong>：{v.resolved ? `${v.resolved.provider}/${v.resolved.model_key}` : '—'}
                                      {v.resolved?.overridden ? '（已覆盖）' : ''}
                                    </div>
                                    <div>
                                      <strong>成本(折算)</strong>：
                                      {v.chargeMetric === 'token_based'
                                        ? ` in:${v.costTokens?.input != null ? v.costTokens.input.toFixed(2) : '—'} / out:${v.costTokens?.output != null ? v.costTokens.output.toFixed(2) : '—'}`
                                        : v.costTokens?.unit != null
                                          ? ` ${v.costTokens.unit.toFixed(2)}`
                                          : ' —'}
                                      {' '}MXM-TOKEN
                                    </div>
                                    <div>
                                      <strong>建议收费</strong>：
                                      {v.chargeMetric === 'token_based'
                                        ? ` in:${v.recommendedTokens?.input != null ? v.recommendedTokens.input.toFixed(2) : '—'} / out:${v.recommendedTokens?.output != null ? v.recommendedTokens.output.toFixed(2) : '—'}`
                                        : v.recommendedTokens?.unit != null
                                          ? ` ${v.recommendedTokens.unit.toFixed(2)}`
                                          : ' —'}
                                      {' '}MXM-TOKEN
                                    </div>
                                  </div>
                                );
                                if (v.chargeMetric === 'token_based') {
                                  const meta = v.configured?.metadata ?? {};
                                  const inP = getMetaNumber(meta, 'input_price_in_tokens');
                                  const outP = getMetaNumber(meta, 'output_price_in_tokens');
                                  const rec = v.recommendedTokens;
                                  const displayIn = inP ?? (rec?.input != null ? Number(rec.input.toFixed(2)) : undefined);
                                  const displayOut = outP ?? (rec?.output != null ? Number(rec.output.toFixed(2)) : undefined);
                                  if (displayIn == null && displayOut == null) return '—';
                                  return (
                                    <Tooltip title={tip}>
                                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        in:{displayIn ?? '—'} / out:{displayOut ?? '—'}
                                      </span>
                                    </Tooltip>
                                  );
                                }
                                const unit =
                                  v.configured?.price_in_tokens ??
                                  (v.recommendedTokens?.unit != null ? Number(v.recommendedTokens.unit.toFixed(2)) : undefined);
                                return unit != null ? (
                                  <Tooltip title={tip}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit}</span>
                                  </Tooltip>
                                ) : (
                                  '—'
                                );
                              },
                            },
                            { title: '更新时间', dataIndex: 'updated_at', width: 176, render: (v: string) => (v ? new Date(v).toLocaleString() : '-') },
                            {
                              title: '操作',
                              width: 240,
                              render: (_: unknown, r: PromptConfigRow) => (
                                <Space size={6}>
                                  <Button type="link" size="small" onClick={() => void openRow(r)}>
                                    编辑
                                  </Button>
                                  {r.is_active ? (
                                    <Popconfirm
                                      title="确定停用该业务？停用后不会对外提供该业务能力。"
                                      onConfirm={() => void handleToggleBusinessActive(r, false)}
                                    >
                                      <Button type="link" size="small" danger>
                                        停用
                                      </Button>
                                    </Popconfirm>
                                  ) : (
                                    <Button
                                      type="link"
                                      size="small"
                                      style={{ color: '#52c41a' }}
                                      onClick={() => void handleToggleBusinessActive(r, true)}
                                    >
                                      启用
                                    </Button>
                                  )}
                                  <Popconfirm
                                    title="确定删除该业务配置？此操作不可恢复。"
                                    onConfirm={() => void handleDeleteBusiness(r)}
                                  >
                                    <Button type="link" size="small" danger>
                                      删除
                                    </Button>
                                  </Popconfirm>
                                </Space>
                              ),
                            },
                          ]}
                          scroll={{ x: 'max-content', y: 'calc(80vh - 280px)' }}
                        />
                        {!loading && visibleList.length === 0 ? (
                          <div style={{ padding: 24 }}>
                            <Empty description="暂无业务配置（可点击“新建业务”创建）" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                ),
              },
              {
                key: 'wallet',
                label: '充值 / 币种',
                children: <AdminPayment embedded />,
              },
              {
                key: 'sensitive',
                label: '敏感词',
                children: <AdminSensitiveWords embedded />,
              },
              {
                key: 'knowledge',
                label: '系统知识库',
                children: <AdminKnowledgeDefaults embedded />,
              },
            ]}
          />
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        width={880}
        destroyOnClose={false}
        onClose={() => { setDrawerOpen(false); setPromptVarSearch(''); }}
        styles={{ body: { padding: 0 } }}
        title={
          selected ? (
            <div className="admin-business-drawer-title">
              <div className="admin-business-editor-path">
                <span className="mono">{selected.scope}</span>
                <span className="sep">/</span>
                <span className="mono">{selected.type}</span>
                {selected.subtype ? (
                  <>
                    <span className="sep">/</span>
                    <span className="mono">{selected.subtype}</span>
                  </>
                ) : null}
              </div>
              {/* <div className="admin-business-editor-vars">
                可用变量：
                <span className="mono">
                  {templateVars.length ? templateVars.map((v) => `\${${v}}`).join('  ') : '（从 Schema properties 推导）'}
                </span>
              </div> */}
            </div>
          ) : (
            '业务编辑器'
          )
        }
        extra={
          <Space size={10}>
            <div className="admin-business-active">
              <Switch checked={isActive} onChange={setIsActive} />
              <span>启用</span>
            </div>
            <Button type="primary" onClick={handleSave} loading={saving} disabled={detailLoading || !draft}>
              保存发布
            </Button>
          </Space>
        }
      >
        <div className="admin-business-drawer-body">
          {!selected ? (
            <div style={{ padding: 18 }}>
              <Empty description="请选择一个业务，或点击“新建业务”。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : detailLoading || !draft ? (
            <div style={{ padding: 18 }} className="muted">
              加载中...
            </div>
          ) : (
            <div className="admin-business-editorBodyInner">
              <Tabs
                activeKey={drawerTabKey}
                onChange={setDrawerTabKey}
                items={[
                  {
                    key: 'schema',
                    label: 'Schema',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="muted">编辑模式：</span>
                          <Select
                            value={schemaMode}
                            onChange={(v) => setSchemaMode(v)}
                            style={{ width: 180 }}
                            options={[
                              { value: 'guided', label: '可视化（字段列表）' },
                              { value: 'json', label: '高级（JSON）' },
                            ]}
                          />
                          <Button
                            onClick={() => {
                              const parsed = safeJsonParse<JsonSchema>(schemaJson);
                              const nextSchema =
                                schemaMode === 'guided'
                                  ? fieldRowsToSchema(draft.formSchema, schemaRows)
                                  : parsed.ok
                                  ? parsed.value
                                  : draft.formSchema;
                              setSchemaJson(prettyJson(nextSchema));
                            }}
                          >
                            同步到 JSON
                          </Button>
                          {schemaMode === 'guided' && (
                            <Button
                              type="primary"
                              onClick={() => {
                                setSchemaRows((prev) => [
                                  ...prev,
                                  { key: `field_${Date.now()}`, name: '', type: 'string', required: false, enumText: '', enumLabelsText: '', defaultText: '' },
                                ]);
                              }}
                            >
                              新增字段
                            </Button>
                          )}
                        </div>

                        {schemaMode === 'guided' ? (
                          <div>
                            <div style={{ marginTop: 8, minHeight: 460, overflow: 'hidden' }} className="schema-table-wrap">
                              <Table
                                size="small"
                                rowKey="key"
                                pagination={false}
                                dataSource={schemaRows}
                                tableLayout="fixed"
                                scroll={{ x: 'max-content', y: 'calc(80vh - 260px)' }}
                                columns={[
                                  {
                                    title: '字段名',
                                    dataIndex: 'name',
                                    width: 96,
                                    ellipsis: true,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Input
                                        size="small"
                                        value={r.name}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                                        }}
                                        style={{ width: '100%', minWidth: 0 }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '类型',
                                    dataIndex: 'type',
                                    width: 110,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Select
                                        size="small"
                                        value={r.type}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(v) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, type: v } : x)))}
                                        options={[
                                          { value: 'text', label: 'text（多行）' },
                                          { value: 'string', label: 'string（单行）' },
                                          { value: 'number', label: 'number（数字）' },
                                          { value: 'selection', label: 'selection（下拉）' },
                                        ]}
                                        style={{ width: '100%' }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '标题',
                                    dataIndex: 'title',
                                    width: 100,
                                    ellipsis: true,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Input
                                        size="small"
                                        value={r.title}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(e) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                                        style={{ width: '100%', minWidth: 0 }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '必填',
                                    dataIndex: 'required',
                                    width: 52,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Switch
                                        size="small"
                                        checked={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim()) ? true : !!r.required}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(v) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, required: v } : x)))}
                                      />
                                    ),
                                  },
                                  {
                                    title: '枚举',
                                    dataIndex: 'enumText',
                                    width: 120,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Input.TextArea
                                        value={r.enumText}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(e) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, enumText: e.target.value } : x)))}
                                        rows={1}
                                        autoSize={{ minRows: 1, maxRows: 3 }}
                                        style={{ width: '100%', minWidth: 0, resize: 'none' }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '枚举展示名',
                                    dataIndex: 'enumLabelsText',
                                    width: 120,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Input.TextArea
                                        value={r.enumLabelsText}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        placeholder="如：文章、口播稿"
                                        onChange={(e) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, enumLabelsText: e.target.value } : x)))}
                                        rows={1}
                                        autoSize={{ minRows: 1, maxRows: 3 }}
                                        style={{ width: '100%', minWidth: 0, resize: 'none' }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '默认值',
                                    dataIndex: 'defaultText',
                                    width: 80,
                                    render: (_: unknown, r: SchemaFieldRow, idx: number) => (
                                      <Input
                                        size="small"
                                        value={r.defaultText}
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim())}
                                        onChange={(e) => setSchemaRows((prev) => prev.map((x, i) => (i === idx ? { ...x, defaultText: e.target.value } : x)))}
                                        style={{ width: '100%', minWidth: 0 }}
                                      />
                                    ),
                                  },
                                  {
                                    title: '操作',
                                    width: 80,
                                    render: (_: unknown, __: unknown, idx: number) => (
                                      <Button
                                        danger
                                        size="small"
                                        disabled={SYSTEM_SCHEMA_FIELD_SET.has(String(schemaRows[idx]?.name || '').trim())}
                                        onClick={() => setSchemaRows((prev) => prev.filter((_, i) => i !== idx))}
                                      >
                                        删除
                                      </Button>
                                    ),
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Alert
                              type="info"
                              showIcon
                              message="提示：系统 Schema 字段（uid/label）不可编辑"
                              description="高级 JSON 模式可编辑复杂 x-* 扩展，但保存时会校验系统字段未被修改。"
                            />
                            <Input.TextArea
                              value={schemaJson}
                              onChange={(e) => setSchemaJson(e.target.value)}
                              rows={18}
                              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                            />
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'prompt',
                    label: 'Prompt',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontWeight: 700 }}>Prompt（模板变量与 Schema 联动）</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          使用下方「可用变量」可复制 <code>{'<template ...>'}</code> 片段到剪贴板；三种 prompt 可切换设置，均可使用此联动功能。
                        </div>
                        <div style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px dashed rgba(148,163,184,0.4)' }}>
                          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>可用变量（来自 Schema）</span>
                            <Input
                              allowClear
                              size="small"
                              placeholder="搜索变量名或标题…"
                              value={promptVarSearch}
                              onChange={(e) => setPromptVarSearch(e.target.value)}
                              style={{ width: 180 }}
                            />
                          </div>
                          <Space size={[6, 6]} wrap>
                              {Object.entries(
                                ((
                                  schemaMode === 'guided' && draft
                                    ? fieldRowsToSchema(draft.formSchema, schemaRows)
                                    : draft?.formSchema
                                )?.properties ?? {}) as Record<string, unknown>
                              )
                                .filter(([name, defRaw]) => {
                                  if (!promptVarSearch.trim()) return true;
                                  const def =
                                    defRaw && typeof defRaw === 'object'
                                      ? (defRaw as Record<string, unknown>)
                                      : {};
                                  const title = def.title != null ? String(def.title) : name;
                                  const q = promptVarSearch.trim().toLowerCase();
                                  return (
                                    name.toLowerCase().includes(q) ||
                                    String(title).toLowerCase().includes(q)
                                  );
                                })
                                .map(([name, defRaw]) => {
                                  const def =
                                    defRaw && typeof defRaw === 'object'
                                      ? (defRaw as Record<string, unknown>)
                                      : {};
                                  const title = def.title != null ? String(def.title) : name;
                                  const effectiveSchema =
                                    schemaMode === 'guided' && draft
                                      ? fieldRowsToSchema(draft.formSchema, schemaRows)
                                      : draft?.formSchema;
                                  const requiredSet = new Set<string>(
                                    (effectiveSchema?.required ?? []).map((x) => String(x))
                                  );
                                  const isRequired = requiredSet.has(name);
                                  const isSystem = SYSTEM_SCHEMA_FIELD_SET.has(name);
                                  const label = isSystem ? `${name}（系统）` : name;
                                  const type = def.type != null ? String(def.type) : 'string';
                                  const defaultValue =
                                    def.default !== undefined && def.default !== null
                                      ? String(def.default)
                                      : '';
                                  const snippetAttrs = [
                                    `name="${name}"`,
                                    `type="${type}"`,
                                    `label="${title}"`,
                                    `required="${isRequired ? 'true' : 'false'}"`,
                                  ];
                                  if (defaultValue) {
                                    snippetAttrs.push(`defaultValue="${defaultValue}"`);
                                  }
                                  const snippet = `<template ${snippetAttrs.join(' ')}>${name}</template>`;
                                  return (
                                    <Space key={name} size={4} align="center">
                                      <Tag color={isSystem ? 'gold' : 'blue'}>{label}</Tag>
                                      <Tooltip title="复制 &lt;template&gt; 片段">
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={<CopyOutlined />}
                                          style={{ padding: '0 4px', color: 'inherit', opacity: 0.7 }}
                                          onClick={() => {
                                            if (navigator.clipboard?.writeText) {
                                              void navigator.clipboard.writeText(snippet);
                                              message.success('已复制，请在光标处粘贴');
                                            } else {
                                              message.info('请手动复制：' + snippet);
                                            }
                                          }}
                                        />
                                      </Tooltip>
                                    </Space>
                                  );
                                })}
                            </Space>
                          </div>
                          {missingSchemaVars.length > 0 ? (
                            <Alert
                              type="warning"
                              showIcon
                              message="Prompt 模板变量未在 Schema 定义"
                              description={
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div className="mono">{missingSchemaVars.map((v) => `\${${v}}`).join('  ')}</div>
                                  <Space wrap>
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setSchemaMode('guided');
                                        setSchemaRows((prev) => {
                                          const exists = new Set(prev.map((x) => x.name));
                                          const next = [...prev];
                                          for (const v of missingSchemaVars) {
                                            if (exists.has(v)) continue;
                                            next.push({
                                              key: v,
                                              name: v,
                                              type: 'string',
                                              required: false,
                                              enumText: '',
                                              enumLabelsText: '',
                                              defaultText: '',
                                            });
                                          }
                                          return next;
                                        });
                                        setDrawerTabKey('schema');
                                        message.info('已把缺失变量补到 Schema，已切换到 Schema 页');
                                      }}
                                    >
                                      一键补到 Schema
                                    </Button>
                                  </Space>
                                </div>
                              }
                            />
                          ) : null}

                        <div style={{ marginTop: 12 }}>
                          <div style={{ marginBottom: 8, fontWeight: 600 }}>当前编辑</div>
                          <Segmented
                            value={activePromptType}
                            onChange={(v) => setActivePromptType(v as 'system' | 'user' | 'outputFormat')}
                            options={[
                              { value: 'system', label: 'systemTemplate' },
                              { value: 'user', label: 'userTemplate（可选）' },
                              { value: 'outputFormat', label: 'outputFormatTemplate' },
                            ]}
                          />
                          <div style={{ marginTop: 12, border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 12, padding: 12 }}>
                            {activePromptType === 'system' && (
                              <PromptTempDesigner
                                data={systemTemplateMarkup}
                                onChange={(v: string) => setSystemTemplateMarkup(v)}
                                styles={{
                                  templateField: {
                                    backgroundColor: 'rgba(34, 197, 94, 0.16)',
                                    borderColor: 'rgba(34, 197, 94, 0.55)',
                                    textColor: '#bbf7d0',
                                    minWidth: '64px',
                                    maxWidth: '520px',
                                  },
                                }}
                              />
                            )}
                            {activePromptType === 'user' && (
                              <PromptTempDesigner
                                data={userTemplateMarkup}
                                onChange={(v: string) => setUserTemplateMarkup(v)}
                                styles={{
                                  templateField: {
                                    backgroundColor: 'rgba(56, 189, 248, 0.14)',
                                    borderColor: 'rgba(56, 189, 248, 0.55)',
                                    textColor: '#bae6fd',
                                    minWidth: '64px',
                                    maxWidth: '520px',
                                  },
                                }}
                              />
                            )}
                            {activePromptType === 'outputFormat' && (
                              <PromptTempDesigner
                                data={outputFormatMarkup}
                                onChange={(v: string) => setOutputFormatMarkup(v)}
                                styles={{
                                  templateField: {
                                    backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                    borderColor: 'rgba(99, 102, 241, 0.55)',
                                    textColor: '#c7d2fe',
                                    minWidth: '64px',
                                    maxWidth: '520px',
                                  },
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'pipelines',
                    label: 'Pipelines',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          这里直接编辑 steps JSON 数组（第一版）。每个 step 形如：{'{ "step": "sensitiveCheck", "params": {"paths": ["prompt"]} }'}
                        </div>
                        <Divider style={{ margin: '8px 0' }} />
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>inputPipeline</div>
                          <Input.TextArea
                            value={inputPipelineText}
                            onChange={(e) => setInputPipelineText(e.target.value)}
                            rows={8}
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>outputPipeline</div>
                          <Input.TextArea
                            value={outputPipelineText}
                            onChange={(e) => setOutputPipelineText(e.target.value)}
                            rows={6}
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'model_pricing',
                    label: '模型与定价',
                    children: selected ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Alert
                          type="info"
                          showIcon
                          message="业务模型绑定 + MXM-TOKEN 定价"
                          description="仅展示当前业务类别允许的模型（并且已启用且已配置 Provider 成本）。默认按 20% 收益自动换算，可手工调整。"
                        />
                        {routeDirty ? (
                          <Alert
                            type="warning"
                            showIcon
                            message="有未保存的模型路由变更"
                            description="你已修改 provider/model，但尚未点击“保存模型”，离开当前业务后这次变更不会生效。"
                          />
                        ) : null}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
                          <Select
                            value={routeProvider || undefined}
                            onChange={(v) => {
                              setRouteProvider(v);
                              setRouteModel('');
                            }}
                            placeholder="选择 Provider"
                            options={Object.keys(modelsByProviderByScope).map((p) => ({ value: p, label: p }))}
                          />
                          <Select
                            value={routeModel || undefined}
                            onChange={setRouteModel}
                            placeholder="选择物理模型（已启用+有价格）"
                            options={currentRoutableModels}
                            disabled={!routeProvider}
                            showSearch
                          />
                          <Button type="primary" loading={routeSaving} onClick={saveBusinessRouteForSelected}>
                            保存模型
                          </Button>
                        </div>
                        <Space>
                          <Button onClick={clearBusinessRouteOverrideForSelected} loading={routeSaving}>
                            恢复默认路由
                          </Button>
                          <Typography.Text type="secondary">
                            business key: {getBusinessTypeForPromptRow(selected)}
                          </Typography.Text>
                        </Space>

                        <Divider style={{ margin: '6px 0' }} />

                        <Form
                          form={pricingForm}
                          layout="vertical"
                          initialValues={{ margin: 20, min_charge_tokens: 0 }}
                          onValuesChange={(changed) => {
                            if ('margin' in changed) pricingSyncRef.current.source = 'margin';
                            if ('unit' in changed || 'input' in changed || 'output' in changed) pricingSyncRef.current.source = 'price';
                          }}
                        >
                          <Form.Item name="margin" label="默认收益（%）" rules={[{ required: true, type: 'number', min: 0, max: 500 }]}>
                            <InputNumber style={{ width: '100%' }} addonAfter="%" />
                          </Form.Item>

                          {(() => {
                            const view = pricingViewsById.get(selected.id);
                            if (!view) return null;
                            if (view.chargeMetric === 'token_based') {
                              return (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                  <Form.Item name="input" label="输入（每千 token）收费" rules={[{ required: false, type: 'number', min: 0 }]}>
                                    <InputNumber style={{ width: '100%' }} />
                                  </Form.Item>
                                  <Form.Item name="output" label="输出（每千 token）收费" rules={[{ required: false, type: 'number', min: 0 }]}>
                                    <InputNumber style={{ width: '100%' }} />
                                  </Form.Item>
                                </div>
                              );
                            }
                            return (
                              <Form.Item name="unit" label="单价（按 charge_mode 解释）" rules={[{ required: true, type: 'number', min: 0 }]}>
                                <InputNumber style={{ width: '100%' }} />
                              </Form.Item>
                            );
                          })()}

                          <Form.Item name="min_charge_tokens" label="最低收费（MXM-TOKEN）" rules={[{ required: true, type: 'number', min: 0 }]}>
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Form>
                        <Space>
                          <Button type="primary" loading={pricingSaving} onClick={saveBusinessPricingForSelected}>
                            保存业务价格
                          </Button>
                        </Space>
                      </div>
                    ) : null,
                  },
                  {
                    key: 'knowledge_storage',
                    label: 'Knowledge & Storage',
                    children: (
                      <Form layout="vertical">
                        <Form.Item label="knowledge.useKnowledge">
                          <Switch
                            checked={!!draft.knowledge?.useKnowledge}
                            onChange={(v) =>
                              setDraft((prev) => (prev ? { ...prev, knowledge: { ...(prev.knowledge ?? { useKnowledge: false }), useKnowledge: v } } : prev))
                            }
                          />
                        </Form.Item>
                        <Form.Item label="knowledge.strategy">
                          <Select
                            value={draft.knowledge?.strategy ?? 'global'}
                            onChange={(v) =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      knowledge: {
                                        ...(prev.knowledge ?? { useKnowledge: false, defaultKnowledgeBaseIds: [], strategy: 'global' }),
                                        strategy: v,
                                      },
                                    }
                                  : prev
                              )
                            }
                            options={[
                              { value: 'global', label: 'global' },
                              { value: 'per_section', label: 'per_section' },
                              { value: 'none', label: 'none' },
                            ]}
                            style={{ width: 240 }}
                          />
                        </Form.Item>
                        <Form.Item label="knowledge.defaultKnowledgeBaseIds（逗号分隔）">
                          <Input
                            value={(draft.knowledge?.defaultKnowledgeBaseIds ?? []).join(',')}
                            onChange={(e) =>
                              setDraft((prev) => {
                                if (!prev) return prev;
                                const ids = e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                return { ...prev, knowledge: { ...(prev.knowledge ?? { useKnowledge: false }), defaultKnowledgeBaseIds: ids } };
                              })
                            }
                            placeholder="kbId1,kbId2"
                          />
                        </Form.Item>

                        <Divider />
                        <Form.Item label="storage（可选）">
                          <Switch
                            checked={!!draft.storage}
                            onChange={(v) =>
                              setDraft((prev) => {
                                if (!prev) return prev;
                                if (!v) return { ...prev, storage: undefined };
                                return {
                                  ...prev,
                                  storage: {
                                    scope: scopeFilter,
                                    extension: 'json',
                                    bucket: '',
                                    pathTemplate: '',
                                    filenameTemplate: '',
                                    mime: '',
                                  },
                                };
                              })
                            }
                          />
                        </Form.Item>
                        {draft.storage && (
                          <>
                            <Form.Item label="storage.extension">
                              <Input
                                value={draft.storage.extension}
                                onChange={(e) =>
                                  setDraft((prev) => (prev && prev.storage ? { ...prev, storage: { ...prev.storage, extension: e.target.value } } : prev))
                                }
                              />
                            </Form.Item>
                            <Form.Item label="storage.bucket">
                              <Input
                                value={draft.storage.bucket ?? ''}
                                disabled
                                readOnly
                              />
                            </Form.Item>
                            <Form.Item label="storage.pathTemplate">
                              <Input
                                value={draft.storage.pathTemplate ?? ''}
                                disabled
                                readOnly
                                placeholder="outlines/${userId}/${date}/"
                              />
                            </Form.Item>
                            <Form.Item label="storage.filenameTemplate">
                              <Input
                                value={draft.storage.filenameTemplate ?? ''}
                                disabled
                                readOnly
                                placeholder="outline_${taskId}_${uuid}.json"
                              />
                            </Form.Item>
                            <Form.Item label="storage.mime">
                              <Input
                                value={draft.storage.mime ?? ''}
                                disabled
                                readOnly
                              />
                            </Form.Item>
                          </>
                        )}
                      </Form>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Drawer>

      <Modal
        title="新建业务（TaskTemplate）"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
      >
        <Form layout="vertical">
          <Form.Item label="scope" required>
            <Select<Scope>
              value={createScope}
              onChange={(v) => setCreateScope(v)}
              options={[
                { value: 'writing', label: 'writing' },
                { value: 'outline', label: 'outline' },
                { value: 'graph', label: 'graph' },
                { value: 'audio', label: 'audio' },
                { value: 'video', label: 'video' },
              ]}
            />
          </Form.Item>
          <Form.Item label="taskKey" required>
            <Input value={createTaskKey} onChange={(e) => setCreateTaskKey(e.target.value)} placeholder="例如：outlines" />
          </Form.Item>
          <Form.Item label="subtype（可选）">
            <Input value={createSubtype} onChange={(e) => setCreateSubtype(e.target.value)} placeholder="例如：tech-article" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

