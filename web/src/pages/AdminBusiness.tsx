import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deletePromptConfig,
  deleteProvidersRouting,
  getBusinessPricing,
  getPromptConfigByKey,
  getProviderPricing,
  getProvidersOptions,
  getProvidersRouting,
  listPromptConfig,
  listSensitiveWordBindings,
  listSensitiveWordLists,
  postProvidersRouting,
  setSensitiveWordBindingsForSlot,
  upsertBusinessPricing,
  upsertPromptConfig,
  type PromptConfigBody,
  type ProviderRoutingEntry,
  type ProviderPricingRow,
  type BusinessPricingRow,
} from '../api/client';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { AdminBusinessTestModal } from '../components/AdminBusinessTestModal';
import AdminSensitiveWords from './AdminSensitiveWords';
import AdminPayment from './AdminPayment';

import type { Scope } from './AdminBusiness.types';
import type {
  BusinessDisplayConfig,
  BusinessPricingView,
  JsonSchema,
  PromptConfigRow,
  SchemaFieldRow,
  TaskTemplateDraft,
  TemplateVarMeta,
} from './AdminBusiness.types';
import {
  allowedModelScopesForBusiness,
  buildMarkupFromTemplate,
  computeRecommendedTokensFromProviderCost,
  COST_TO_MXM_TOKEN_RATE_DEFAULT,
  DEFAULT_MARGIN,
  ensureTaskTemplate,
  extractTemplateVars,
  fieldRowsToSchema,
  getMetaNumber,
  getBusinessTypeForPromptRow,
  mergeGenerateParams,
  parseTemplateMarkup,
  prettyJson,
  readGenerateParams,
  RECOMMENDED_GENERATE_PARAMS,
  safeJsonParse,
  schemaPropsToFieldRows,
  stripSystemSchemaFields,
} from './AdminBusiness.utils';

import { AdminBusinessSchemaTab } from './AdminBusinessSchemaTab';
import { AdminBusinessPromptTab } from './AdminBusinessPromptTab';
import { AdminBusinessPricingTab } from './AdminBusinessPricingTab';
import { AdminBusinessConfigTab } from './AdminBusinessConfigTab';
import { AdminBusinessCreateModal } from './AdminBusinessCreateModal';

function toNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export default function AdminBusiness() {
  const { message } = App.useApp();
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
  const [unifiedTemplateMarkup, setUnifiedTemplateMarkup] = useState('');
  /** PromptTempDesigner 对 onChange 有 ~400ms 防抖；保存前必须用 onGetData 拉取最新串，否则会写入旧模板 */
  const promptMarkupGetterRef = useRef<((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null>(null);

  const [schemaMode, setSchemaMode] = useState<'guided' | 'json'>('guided');
  const [schemaRows, setSchemaRows] = useState<SchemaFieldRow[]>(() => schemaPropsToFieldRows({ type: 'object', properties: {}, required: [] }));
  const [schemaJson, setSchemaJson] = useState('{}');
  const [promptVarSearch, setPromptVarSearch] = useState('');
  /** Drawer 内当前 Tab：schema | prompt | knowledge_storage(基础配置) | model_pricing */
  const [drawerTabKey, setDrawerTabKey] = useState<string>('schema');

  // 敏感词库
  const [sensitiveLists, setSensitiveLists] = useState<{ id: string; name: string; description?: string | null; is_active: boolean }[]>([]);
  const [sensitiveSelectedListIds, setSensitiveSelectedListIds] = useState<string[]>([]);
  const [sensitiveLoading, setSensitiveLoading] = useState(false);
  const [sensitiveHint, setSensitiveHint] = useState<string | null>(null);

  const displayConfig = useMemo<BusinessDisplayConfig>(() => {
    const d = (extraDraft as Record<string, unknown>)?.display;
    return d && typeof d === 'object' ? (d as BusinessDisplayConfig) : {};
  }, [extraDraft]);

  const promptTextTaskKey = (extraDraft as Record<string, unknown>)?.promptTextTaskKey as string | undefined;

  const [saving, setSaving] = useState(false);

  // 路由与定价
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

  // 新建
  const [createOpen, setCreateOpen] = useState(false);
  const [createScope, setCreateScope] = useState<Scope>('writing');
  const [createTaskKey, setCreateTaskKey] = useState('');
  const [createSubtype, setCreateSubtype] = useState('');

  // 测试
  const [testOpen, setTestOpen] = useState(false);
  const [testRow, setTestRow] = useState<PromptConfigRow | null>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

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

  const templateVars = useMemo(() => {
    const props = draft?.formSchema?.properties ?? {};
    return Object.keys(props);
  }, [draft?.formSchema]);

  const promptVarsUsed = useMemo(() => {
    if (!draft) return [];
    return extractTemplateVars(draft.prompt.unifiedTemplate ?? '');
  }, [draft]);

  const missingSchemaVars = useMemo(() => {
    const schemaVars = new Set(templateVars);
    return promptVarsUsed.filter((v) => !schemaVars.has(v));
  }, [promptVarsUsed, templateVars]);

  const routeDirty = useMemo(() => {
    if (!selected) return false;
    const businessType = getBusinessTypeForPromptRow(selected);
    const resolved = routing[businessType];
    const currentProvider = resolved?.provider ?? '';
    const currentModel = resolved?.model ?? '';
    return routeProvider !== currentProvider || routeModel !== currentModel;
  }, [selected, routing, routeProvider, routeModel]);

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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
      const payload: Record<string, unknown> = { margin };
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

  // 双向联动（编辑页"模型与定价"Tab）
  useEffect(() => {
    if (!drawerOpen || !selected) return;
    const view = pricingViewsById.get(selected.id);
    const pp = view?.providerCost;
    const cost = view?.costTokens;
    if (!pp || !cost) return;

    const marginPct = typeof pricingMarginPct === 'number' && Number.isFinite(pricingMarginPct) ? pricingMarginPct : 20;
    const margin = marginPct / 100;

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
    const rulesZh = (data.rules_i18n as Record<string, string> | undefined)?.zh ?? '';
    const outZh = (data.output_format_i18n as Record<string, string> | undefined)?.zh ?? '';
    const tpl = ensureTaskTemplate(taskTemplate, { rules: rulesZh, outputFormat: outZh });
    const hasAnyGp = readGenerateParams(tpl.extra) !== null;
    setDraft(
      hasAnyGp
        ? tpl
        : {
            ...tpl,
            extra: { ...((tpl.extra ?? {}) as Record<string, unknown>), generateParams: { temperature: 0.5, maxTokens: 1600, topP: 0.95 } },
          }
    );
    setExtraDraft(extra);
    setIsActive(data.is_active ?? row.is_active ?? true);

    const uniRaw = tpl.prompt.unifiedTemplateMarkup ?? tpl.prompt.unifiedTemplate ?? '';
    const uniMarkup = uniRaw.includes('<template')
      ? uniRaw
      : buildMarkupFromTemplate(uniRaw, tpl.formSchema);
    setUnifiedTemplateMarkup(uniMarkup);

    setSchemaMode('guided');
    const sanitizedSchema = stripSystemSchemaFields(tpl.formSchema);
    setSchemaRows(schemaPropsToFieldRows(sanitizedSchema));
    setSchemaJson(prettyJson(sanitizedSchema));
    hydratePricingFormByRow(row);
    const businessType = getBusinessTypeForPromptRow(row);
    const resolved = routing[businessType];
    setRouteProvider(resolved?.provider ?? '');
    setRouteModel(resolved?.model ?? '');
    setDrawerTabKey('schema');
  }, [hydratePricingFormByRow, routing, message]);

  // 敏感词库加载
  useEffect(() => {
    if (!drawerOpen || !selected) return;
    let cancelled = false;
    (async () => {
      setSensitiveLoading(true);
      setSensitiveHint(null);
      try {
        const [listsRes, bindingsRes] = await Promise.all([
          listSensitiveWordLists(),
          listSensitiveWordBindings({
            scope: selected.scope,
            type: selected.type,
            subtype: selected.subtype ?? '',
          }),
        ]);
        const listItems =
          (listsRes.data as { data?: { items?: typeof sensitiveLists }; meta?: { hint?: string } } | undefined)?.data
            ?.items ?? [];
        const metaHint = (listsRes.data as { meta?: { hint?: string } } | undefined)?.meta?.hint;
        const bindItems =
          (bindingsRes.data as { data?: { items?: { id: string; list_id: string }[] } } | undefined)?.data?.items ?? [];
        if (cancelled) return;
        setSensitiveLists(Array.isArray(listItems) ? listItems : []);
        if (metaHint) setSensitiveHint(String(metaHint));
        setSensitiveSelectedListIds(Array.isArray(bindItems) ? bindItems.map((b) => String(b.list_id)) : []);
      } catch {
        if (!cancelled) {
          setSensitiveLists([]);
          setSensitiveSelectedListIds([]);
        }
      } finally {
        if (!cancelled) setSensitiveLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, selected]);

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
        },
        required: ['prompt'],
      },
      prompt: {},
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
    const uniRawNew = initial.prompt.unifiedTemplateMarkup ?? initial.prompt.unifiedTemplate ?? '';
    const uniMarkupNew = uniRawNew.includes('<template')
      ? uniRawNew
      : buildMarkupFromTemplate(uniRawNew, initial.formSchema);
    setUnifiedTemplateMarkup(uniMarkupNew);
    setSchemaMode('guided');
    const sanitizedSchema = stripSystemSchemaFields(initial.formSchema);
    setSchemaRows(schemaPropsToFieldRows(sanitizedSchema));
    setSchemaJson(prettyJson(sanitizedSchema));
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

  const buildTaskTemplateFromUi = (markupOverride?: string): TaskTemplateDraft => {
    if (!draft) throw new Error('draft is null');
    const next = { ...draft };
    const effectiveMarkup = markupOverride !== undefined ? markupOverride : unifiedTemplateMarkup;

    if (schemaMode === 'guided') {
      next.formSchema = fieldRowsToSchema(next.formSchema, schemaRows);
    } else {
      const parsed = safeJsonParse<JsonSchema>(schemaJson);
      if (!parsed.ok) throw new Error(`Schema JSON 无效: ${parsed.error}`);
      next.formSchema = stripSystemSchemaFields(parsed.value);
    }

    const parsedUnified = parseTemplateMarkup(effectiveMarkup);
    const unifiedText = parsedUnified.text.trim();
    if (!unifiedText) {
      throw new Error('unifiedTemplate 不能为空');
    }
    next.prompt = {
      unifiedTemplate: unifiedText,
      unifiedTemplateMarkup: effectiveMarkup,
    };

    const allVarsMetaMap = new Map<string, TemplateVarMeta>();
    const varSources = parsedUnified.vars;
    for (const meta of varSources) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (next as any).inputPipeline;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (next as any).outputPipeline;

    return next;
  };

  const handleSave = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      const flushedMarkup =
        typeof promptMarkupGetterRef.current === 'function'
          ? promptMarkupGetterRef.current('string')
          : unifiedTemplateMarkup;
      setUnifiedTemplateMarkup(flushedMarkup);
      const tpl = buildTaskTemplateFromUi(flushedMarkup);
      if (!tpl.prompt.unifiedTemplate?.trim()) throw new Error('unifiedTemplate 不能为空');
      if (!tpl.formSchema || typeof tpl.formSchema !== 'object') throw new Error('formSchema 无效');
      if ((tpl.formSchema.type ?? 'object') !== 'object') throw new Error('formSchema.type 必须为 object');
      const missingVars = extractTemplateVars(tpl.prompt.unifiedTemplate).filter(
        (v) => !(tpl.formSchema.properties && Object.prototype.hasOwnProperty.call(tpl.formSchema.properties, v))
      );
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

  const handleSensitiveSave = async () => {
    if (!selected) return;
    setSensitiveLoading(true);
    try {
      const res = await setSensitiveWordBindingsForSlot({
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype ?? null,
        list_ids: sensitiveSelectedListIds,
      });
      if (res.error) throw new Error(res.error);
      message.success('已保存敏感词挂载');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSensitiveLoading(false);
    }
  };

  const handleAddMissingVarsToSchema = () => {
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
          userVisible: true,
          enumText: '',
          enumLabelsText: '',
          defaultText: '',
        });
      }
      return next;
    });
    setDrawerTabKey('schema');
    message.info('已把缺失变量补到 Schema，已切换到 Schema 页');
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

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
                            { value: 'music', label: '音乐 (music)' },
                            { value: 'video', label: '视频 (video)' },
                            { value: 'text', label: '纯文本 (text)' },
                          ]}
                        />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="搜索 taskKey / subtype…"
                          style={{ width: 300, maxWidth: '100%' }}
                          allowClear
                        />
                        <Button onClick={() => void loadList()} loading={loading}>
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
                          // 纯前端分页：翻页不应出现“假 loading”。
                          // 仅在首次无数据时显示 loading，后台刷新不遮罩表格/分页交互。
                          loading={loading && visibleList.length === 0}
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
                                const view = pricingViewsById.get(r.id);
                                if (!view?.resolved) return <span className="muted">—</span>;
                                return (
                                  <Space size={4} wrap>
                                    <Tag color="purple">{view.resolved.provider}</Tag>
                                    <Typography.Text style={{ fontSize: 12 }}>{view.resolved.model_key}</Typography.Text>
                                    {view.resolved.overridden ? (
                                      <Tag color="orange" style={{ fontSize: 10 }}>覆盖</Tag>
                                    ) : null}
                                  </Space>
                                );
                              },
                            },
                            {
                              title: 'MXM-TOKEN 定价',
                              width: 160,
                              render: (_: unknown, r: PromptConfigRow) => {
                                const view = pricingViewsById.get(r.id);
                                if (!view?.configured) return <span className="muted">未配置</span>;
                                const margin = view.configured.metadata?.margin;
                                return (
                                  <Typography.Text style={{ fontSize: 12 }}>
                                    {view.chargeMetric === 'token_based'
                                      ? `in:${view.configured.metadata?.input_price_in_tokens ?? '-'} / out:${view.configured.metadata?.output_price_in_tokens ?? '-'}`
                                      : `${view.configured.price_in_tokens} / 单位`}
                                    {margin != null ? <span className="muted"> 利润率:{Math.round(Number(margin) * 100)}%</span> : null}
                                  </Typography.Text>
                                );
                              },
                            },
                            {
                              title: '操作',
                              width: 160,
                              render: (_: unknown, r: PromptConfigRow) => {
                                return (
                                  <Space size={4}>
                                    <Button
                                      size="small"
                                      icon={<EditOutlined />}
                                      onClick={() => void openRow(r)}
                                    >
                                      编辑
                                    </Button>
                                    <Popconfirm
                                      title={`${r.is_active ? '停用' : '启用'}该业务？`}
                                      onConfirm={() => void handleToggleBusinessActive(r, !r.is_active)}
                                    >
                                      <Button size="small" icon={r.is_active ? <StopOutlined /> : <PlayCircleOutlined />} />
                                    </Popconfirm>
                                    <Popconfirm
                                      title="删除该业务？"
                                      onConfirm={() => void handleDeleteBusiness(r)}
                                    >
                                      <Button danger size="small" icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                );
                              },
                            },
                            {
                              title: '更新时间',
                              dataIndex: 'updated_at',
                              width: 176,
                              render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
                            },
                          ]}
                        onRow={(r) => ({
                          onDoubleClick: () => void openRow(r),
                          style: { cursor: 'pointer' },
                        })}
                        />
                      </div>
                    </div>
                  </>
                ),
              },
              {
                key: 'sensitiveWords',
                label: '敏感词库',
                children: <AdminSensitiveWords />,
              },
              {
                key: 'payment',
                label: '收款配置',
                children: <AdminPayment />,
              },
            ]}
          />
        </div>
      </div>

      {/* 详情 Drawer */}
      <Drawer
        title={
          selected
            ? `编辑业务：${selected.scope} / ${selected.type}${selected.subtype ? ` / ${selected.subtype}` : ''}`
            : '编辑业务'
        }
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelected(null);
          setDraft(null);
          setExtraDraft({});
          setSensitiveLists([]);
          setSensitiveSelectedListIds([]);
          pricingForm.resetFields();
        }}
        size={780}
        styles={{ body: { padding: '12px 20px' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 顶部操作栏 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Space size={8}>
              <Switch
                checked={isActive}
                onChange={(v) => setIsActive(v)}
                checkedChildren="启用"
                unCheckedChildren="停用"
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {selected?.id?.startsWith('new:') ? '【新建】' : selected?.id}
              </Typography.Text>
            </Space>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => {
                  setTestRow(selected);
                  setTestOpen(true);
                }}
                disabled={!selected || detailLoading}
              >
                调试
              </Button>
              <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                保存全部
              </Button>
            </Space>
          </div>

          {detailLoading ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Typography.Text type="secondary">加载中…</Typography.Text>
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
                      <AdminBusinessSchemaTab
                        draft={draft}
                        schemaMode={schemaMode}
                        schemaRows={schemaRows}
                        schemaJson={schemaJson}
                        promptVarSearch={promptVarSearch}
                        unifiedTemplateMarkup={unifiedTemplateMarkup}
                        promptMarkupGetterRef={promptMarkupGetterRef}
                        missingSchemaVars={missingSchemaVars}
                        onSchemaModeChange={setSchemaMode}
                        onSchemaRowsChange={setSchemaRows}
                        onSchemaJsonChange={setSchemaJson}
                        onPromptVarSearchChange={setPromptVarSearch}
                        onSyncToJson={() => {
                          const parsed = safeJsonParse<JsonSchema>(schemaJson);
                          const nextSchema =
                            schemaMode === 'guided'
                              ? fieldRowsToSchema(draft?.formSchema ?? { type: 'object', properties: {}, required: [] }, schemaRows)
                              : parsed.ok
                              ? parsed.value
                              : (draft?.formSchema ?? { type: 'object', properties: {}, required: [] });
                          setSchemaJson(prettyJson(nextSchema));
                        }}
                        onUnifiedTemplateMarkupChange={setUnifiedTemplateMarkup}
                        onAddMissingVarsToSchema={handleAddMissingVarsToSchema}
                      />
                    ),
                  },
                  {
                    key: 'prompt',
                    label: 'Prompt',
                    children: (
                      <AdminBusinessPromptTab
                        draft={draft}
                        schemaMode={schemaMode}
                        schemaRows={schemaRows}
                        schemaJson={schemaJson}
                        scopeFilter={scopeFilter}
                        promptVarSearch={promptVarSearch}
                        unifiedTemplateMarkup={unifiedTemplateMarkup}
                        promptMarkupGetterRef={promptMarkupGetterRef}
                        missingSchemaVars={missingSchemaVars}
                        promptTextTaskKey={promptTextTaskKey}
                        onPromptVarSearchChange={setPromptVarSearch}
                        onUnifiedTemplateMarkupChange={setUnifiedTemplateMarkup}
                        onAddMissingVarsToSchema={handleAddMissingVarsToSchema}
                        onPromptTextTaskKeyChange={(v) => {
                          setExtraDraft((prev) => ({ ...(prev ?? {}), promptTextTaskKey: v || undefined }));
                        }}
                      />
                    ),
                  },
                  {
                    key: 'model_pricing',
                    label: '模型与定价',
                    children: (
                      <AdminBusinessPricingTab
                        selected={selected}
                        routeProvider={routeProvider}
                        routeModel={routeModel}
                        routeSaving={routeSaving}
                        routeDirty={routeDirty}
                        draft={draft}
                        pricingForm={pricingForm}
                        pricingSaving={pricingSaving}
                        currentRoutableModels={currentRoutableModels}
                        modelsByProviderByScope={modelsByProviderByScope}
                        onRouteProviderChange={(v) => {
                          setRouteProvider(v);
                          setRouteModel('');
                        }}
                        onRouteModelChange={setRouteModel}
                        onSaveRoute={() => void saveBusinessRouteForSelected()}
                        onClearRoute={() => void clearBusinessRouteOverrideForSelected()}
                        onResetGenerateParams={() => {
                          setDraft((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              extra: mergeGenerateParams(
                                (prev.extra ?? {}) as Record<string, unknown>,
                                RECOMMENDED_GENERATE_PARAMS
                              ),
                            };
                          });
                          message.success('已重置为推荐默认值');
                        }}
                        onDraftChange={setDraft}
                        onSavePricing={() => void saveBusinessPricingForSelected()}
                      />
                    ),
                  },
                  {
                    key: 'knowledge_storage',
                    label: '基础配置',
                    children: (
                      <AdminBusinessConfigTab
                        selected={selected}
                        displayConfig={displayConfig}
                        draft={draft}
                        sensitiveLists={sensitiveLists}
                        sensitiveSelectedListIds={sensitiveSelectedListIds}
                        sensitiveLoading={sensitiveLoading}
                        sensitiveHint={sensitiveHint}
                        scopeFilter={scopeFilter}
                        onDisplayConfigChange={(d) =>
                          setExtraDraft((prev) => ({
                            ...(prev ?? {}),
                            display: d,
                          }))
                        }
                        onDraftChange={setDraft}
                        onSensitiveListIdsChange={setSensitiveSelectedListIds}
                        onSaveSensitiveBinding={() => void handleSensitiveSave()}
                      />
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Drawer>

      {/* 测试 Modal */}
      <AdminBusinessTestModal
        open={testOpen}
        onClose={() => {
          setTestOpen(false);
          setTestRow(null);
        }}
        row={testRow}
      />

      {/* 新建 Modal */}
      <AdminBusinessCreateModal
        open={createOpen}
        createScope={createScope}
        createTaskKey={createTaskKey}
        createSubtype={createSubtype}
        onOpenChange={setCreateOpen}
        onScopeChange={setCreateScope}
        onTaskKeyChange={setCreateTaskKey}
        onSubtypeChange={setCreateSubtype}
        onConfirm={() => void handleCreate()}
      />
    </div>
  );
}
