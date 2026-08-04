import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deletePromptConfig,
  exportBusinessBundlePost,
  exportBusinessBundleQuery,
  getPromptConfigByKey,
  getProviderPricing,
  getProvidersOptions,
  getProvidersRouting,
  importBusinessBundle,
  listPromptConfig,
  listSensitiveWordBindings,
  listSensitiveWordLists,
  postProvidersRouting,
  setSensitiveWordBindingsForSlot,
  upsertPromptConfig,
  type PromptConfigBody,
  type ProviderRoutingEntry,
  type ProviderPricingRow,
} from '../api/client';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Table,
  Tag,
  Typography,
  Spin,
} from 'antd';
import {
  BugOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  PlayCircleOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { AdminBusinessTestModal } from '../components/AdminBusinessTestModal';
import AdminSensitiveWords from './AdminSensitiveWords';
import AdminPayment from './AdminPayment';

import type { Scope } from './AdminBusiness.types';
import type {
  BusinessDisplayConfig,
  JsonSchema,
  PromptConfigRow,
  SchemaFieldRow,
  TaskTemplateDraft,
} from './AdminBusiness.types';
import { isPlatformTaskKey } from './AdminBusiness.types';
import {
  allowedModelScopesForBusiness,
  buildMarkupFromTemplate,
  ensureTaskTemplate,
  ensureWritingStorageDefaults,
  fieldRowsToSchema,
  getBusinessTypeForPromptRow,
  parseTemplateMarkup,
  prettyJson,
  mergeGenerateParams,
  RECOMMENDED_GENERATE_PARAMS,
  readGenerateParams,
  resolveSubtypeDisplay,
  resolveTaskKeyDisplay,
  formatBusinessDrawerTitle,
  businessRowSearchText,
  safeJsonParse,
  schemaPropsToFieldRows,
  stripSystemSchemaFields,
  syncWritingStorageToFormSchema,
} from './AdminBusiness.utils';
import { syncInteractiveCardFieldsToFormSchema } from './syncInteractiveCardFieldsToFormSchema';

function formatPlatformPriceSummary(pp: ProviderPricingRow | undefined): {
  chargeMode: string;
  label: string;
} | null {
  if (!pp) return null;
  const hasToken =
    pp.charge_mode === 'token_based' &&
    (Number(pp.platform_input_unit_price) > 0 || Number(pp.platform_output_unit_price) > 0);
  const hasUnit = Number(pp.platform_unit_price) > 0;
  if (!hasToken && !hasUnit) return null;
  if (pp.charge_mode === 'token_based') {
    return {
      chargeMode: pp.charge_mode,
      label: `in:${pp.platform_input_unit_price ?? 0} / out:${pp.platform_output_unit_price ?? 0}`,
    };
  }
  return {
    chargeMode: pp.charge_mode,
    label: String(pp.platform_unit_price ?? 0),
  };
}

import { AdminBusinessSchemaTab } from './AdminBusinessSchemaTab';
import { AdminBusinessPromptTab } from './AdminBusinessPromptTab';
import { AdminBusinessCoreSkillTab } from './AdminBusinessCoreSkillTab';
import {
  isCoreSkillSlice,
  ensureCoreSkillPack,
  readSkillPackFromDraftExtra,
  skillBodyFromPack,
  SKILL_MODE_CORE,
} from './admin-core-skill';
import { AdminBusinessPricingTab } from './AdminBusinessPricingTab';
import { AdminBusinessConfigTab } from './AdminBusinessConfigTab';
import { AdminBusinessPipelineTab } from './AdminBusinessPipelineTab';
import { migrateLegacyPromptTextTaskKeyToPipeline, migrateSensitiveBindingToPipeline, readSensitiveListIdsFromPipeline } from './admin-business-pipeline.utils';
import { getTextV2FixedFormSchema, isTextV2Type, TEXT_V2_INPUT_KEYS } from './admin-text-v2';
import './admin-business-pipeline.css';
import { AdminBusinessCreateModal } from './AdminBusinessCreateModal';
import { PublishOpenApiDrawer, type PublishOpenApiPreset } from '../components/PublishOpenApiDrawer';
import AdminSearchConfig from './AdminSearchSearchConfig';

function renderBusinessIdentityCell(display: {
  label: string;
  key: string | null;
  hasCustomLabel: boolean;
}) {
  return (
    <div
      className={[
        'admin-business-cell-identity',
        display.hasCustomLabel ? 'admin-business-cell-identity--named' : 'admin-business-cell-identity--key',
      ].join(' ')}
      title={display.hasCustomLabel && display.key ? display.key : undefined}
    >
      <span className="admin-business-cell-identity__label">{display.label}</span>
      {display.hasCustomLabel && display.key ? (
        <span className="admin-business-cell-identity__key">{display.key}</span>
      ) : null}
    </div>
  );
}

/** 业务列表表格横向滚动最小宽度（列宽之和，避免窄屏压缩 subtype） */
const BUSINESS_LIST_TABLE_SCROLL_X = 1140;

export default function AdminBusiness() {
  const { message } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<PromptConfigRow[]>([]);
  const [scopeFilter, setScopeFilter] = useState<Scope>('writing');
  const [search, setSearch] = useState('');
  const [textBusinessOptions, setTextBusinessOptions] = useState<PromptConfigRow[]>([]);
  const [videoBusinessOptions, setVideoBusinessOptions] = useState<PromptConfigRow[]>([]);

  const [selected, setSelected] = useState<PromptConfigRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<TaskTemplateDraft | null>(null);
  const [extraDraft, setExtraDraft] = useState<Record<string, unknown>>({});
  const [isActive, setIsActive] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unifiedTemplateMarkup, setUnifiedTemplateMarkup] = useState('');
  /** 加载/保存成功后的快照；与当前状态不同则提示未保存 */
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
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
  const [sensitiveHint, setSensitiveHint] = useState<string | null>(null);

  const displayConfig = useMemo<BusinessDisplayConfig>(() => {
    const d = (extraDraft as Record<string, unknown>)?.display;
    return d && typeof d === 'object' ? (d as BusinessDisplayConfig) : {};
  }, [extraDraft]);

  const [saving, setSaving] = useState(false);

  // 路由（用户扣费看 Provider MXM-TOKEN）
  const [routing, setRouting] = useState<Record<string, ProviderRoutingEntry>>({});
  const [modelsByProviderByScope, setModelsByProviderByScope] = useState<Record<string, Record<string, string[]>>>({});
  const [providerPricing, setProviderPricing] = useState<ProviderPricingRow[]>([]);

  const [routeProvider, setRouteProvider] = useState<string>('');
  const [routeModel, setRouteModel] = useState<string>('');

  const editorSnapshot = useMemo(() => {
    try {
      return JSON.stringify({
        draft,
        extraDraft,
        isActive,
        unifiedTemplateMarkup,
        routeProvider,
        routeModel,
      });
    } catch {
      return '';
    }
  }, [draft, extraDraft, isActive, unifiedTemplateMarkup, routeProvider, routeModel]);

  const hasUnsavedChanges =
    Boolean(selected) && Boolean(savedSnapshot) && editorSnapshot !== savedSnapshot && !detailLoading;

  // 新建
  const [createOpen, setCreateOpen] = useState(false);
  const [createScope, setCreateScope] = useState<Scope>('writing');
  const [createTaskKey, setCreateTaskKey] = useState('');
  const [createSubtype, setCreateSubtype] = useState('');

  // 测试
  const [testOpen, setTestOpen] = useState(false);
  const [testRow, setTestRow] = useState<PromptConfigRow | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPreset, setPublishPreset] = useState<PublishOpenApiPreset | null>(null);

  // 业务 bundle 导出 / 导入
  const [bundleTableSelectedKeys, setBundleTableSelectedKeys] = useState<React.Key[]>([]);
  const [bundleExporting, setBundleExporting] = useState(false);
  const [bundleImportModalOpen, setBundleImportModalOpen] = useState(false);
  const [bundleImportPreview, setBundleImportPreview] = useState<{
    created: string[];
    updated: string[];
    skipped: string[];
    warnings: string[];
  } | null>(null);
  const [bundlePendingJson, setBundlePendingJson] = useState<unknown>(null);
  const [bundleImportRunning, setBundleImportRunning] = useState(false);
  const [bundleExportIncludePricing, setBundleExportIncludePricing] = useState(false);
  const bundleFileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const scopeFilterRef = useRef<Scope>(scopeFilter);
  scopeFilterRef.current = scopeFilter;
  const inFlightRef = useRef(false);

  const loadListFnRef = useRef<(currentScope?: Scope) => Promise<void>>();
  loadListFnRef.current = async (currentScope?: Scope) => {
    if (!isLoggedIn || !isAdmin) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const effectiveScope = currentScope ?? scopeFilterRef.current;
      const [res, routingRes, optionsRes, providerPricingRes] = await Promise.all([
        listPromptConfig({ scope: effectiveScope, type: undefined }),
        getProvidersRouting(),
        getProvidersOptions(),
        getProviderPricing(),
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
      setRouting(rdata);
      setModelsByProviderByScope(optData?.modelsByProviderByScope ?? {});
      setProviderPricing(pp);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // scope 切换 / 首次进入：清空旧列表并加载，表格始终展示 loading
  useEffect(() => {
    setList([]);
    void loadListFnRef.current?.(scopeFilter);
  }, [scopeFilter]);

  useEffect(() => {
    setBundleTableSelectedKeys([]);
  }, [scopeFilter]);

  // 执行管线 Tab：加载 text / video 子业务选项
  useEffect(() => {
    void (async () => {
      const [textRes, videoRes] = await Promise.all([
        listPromptConfig({ scope: 'text', type: undefined }),
        listPromptConfig({ scope: 'video', type: undefined }),
      ]);
      const textItems = (textRes.data as { data?: { items?: PromptConfigRow[] } } | undefined)?.data?.items;
      const videoItems = (videoRes.data as { data?: { items?: PromptConfigRow[] } } | undefined)?.data?.items;
      setTextBusinessOptions(Array.isArray(textItems) ? textItems.filter((r) => r.is_active !== false) : []);
      setVideoBusinessOptions(Array.isArray(videoItems) ? videoItems.filter((r) => r.is_active !== false) : []);
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const visibleList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => businessRowSearchText(r).includes(q));
  }, [list, search]);

  const providerPricingIndex = useMemo(() => {
    const map = new Map<string, ProviderPricingRow>();
    for (const r of providerPricing) {
      map.set(`${r.provider}||${r.scope}||${r.model_key}`, r);
    }
    return map;
  }, [providerPricing]);

  /** 列表用：仅解析当前路由物理模型（扣费单价在 Provider 管理配置，不在业务列表展示） */
  const pricingViewsById = useMemo(() => {
    const result = new Map<
      string,
      {
        businessType: string;
        resolved?: { provider: string; model_key: string; overridden?: boolean };
      }
    >();
    for (const r of visibleList) {
      const businessType = getBusinessTypeForPromptRow(r);
      const resolved = routing[businessType];
      const provider = resolved?.provider;
      const modelKey = resolved?.model;
      result.set(r.id, {
        businessType,
        resolved:
          provider && modelKey
            ? { provider, model_key: modelKey, overridden: resolved.overridden }
            : undefined,
      });
    }
    return result;
  }, [visibleList, routing]);

  // Live schema vars from the currently edited schema rows (not the saved draft)
  const schemaVars = useMemo(() => {
    return schemaRows.map((r) => r.name);
  }, [schemaRows]);

  // Live prompt vars from the current markup editor content
  // Supports both ${foo} and <template name="foo" ...>...</template> syntax
  const promptVarsUsed = useMemo(() => {
    if (!draft) return [];
    const parsed = parseTemplateMarkup(unifiedTemplateMarkup);
    return parsed.vars.map((v) => v.name);
  }, [draft, unifiedTemplateMarkup]);

  // Schema vars that are NOT referenced in the prompt (reverse check, weak info)
  const unusedSchemaVars = useMemo(() => {
    const used = new Set(promptVarsUsed);
    return schemaVars.filter((v) => !used.has(v));
  }, [schemaVars, promptVarsUsed]);

  const missingSchemaVars = useMemo(() => {
    const schemaSet = new Set(schemaVars);
    return promptVarsUsed.filter((v) => !schemaSet.has(v));
  }, [promptVarsUsed, schemaVars]);

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
    const outZh = (data.output_format_i18n as Record<string, string> | undefined)?.zh ?? '';
    let tpl = ensureWritingStorageDefaults(
      migrateLegacyPromptTextTaskKeyToPipeline(
        ensureTaskTemplate(taskTemplate, { outputFormat: outZh }),
        typeof extra.promptTextTaskKey === 'string' ? extra.promptTextTaskKey : undefined
      ),
      row.scope as Scope
    );
    if (row.scope === 'text' && isTextV2Type(row.type)) {
      const fixed = getTextV2FixedFormSchema(row.type);
      tpl = {
        ...tpl,
        formSchema: fixed,
        contractSchema: fixed,
        pipeline: { pre: [], enrich: [], post: [] },
      };
    }
    const hasAnyGp = readGenerateParams(tpl.extra) !== null;
    const defaultExtra = mergeGenerateParams(
      (tpl.extra ?? {}) as Record<string, unknown>,
      RECOMMENDED_GENERATE_PARAMS,
    );
    setDraft(
      hasAnyGp
        ? tpl
        : {
            ...tpl,
            extra: defaultExtra,
          }
    );
    setExtraDraft({
      ...extra,
      executionMode: row.scope === 'text' ? (extra.executionMode ?? 'sync') : 'mxm-warp',
    });
    setIsActive(data.is_active ?? row.is_active ?? true);

    const uniRaw = tpl.prompt.unifiedTemplateMarkup ?? tpl.prompt.unifiedTemplate ?? '';
    const contractSrc = tpl.contractSchema ?? tpl.formSchema;
    const uniMarkup = uniRaw.includes('<template')
      ? uniRaw
      : buildMarkupFromTemplate(uniRaw, contractSrc);
    setUnifiedTemplateMarkup(uniMarkup);

    setSchemaMode('guided');
    const sanitizedSchema = stripSystemSchemaFields(contractSrc);
    setSchemaRows(schemaPropsToFieldRows(sanitizedSchema));
    setSchemaJson(prettyJson(sanitizedSchema));
    const businessType = getBusinessTypeForPromptRow(row);
    const resolved = routing[businessType];
    setRouteProvider(resolved?.provider ?? '');
    setRouteModel(resolved?.model ?? '');
    setDrawerTabKey(row.scope === 'text' ? 'prompt' : 'schema');
    // 下一帧写入基线，避免与 setState 批处理竞态
    window.setTimeout(() => {
      setSavedSnapshot(
        JSON.stringify({
          draft: hasAnyGp
            ? tpl
            : {
                ...tpl,
                extra: defaultExtra,
              },
          extraDraft: {
            ...extra,
            executionMode: row.scope === 'text' ? (extra.executionMode ?? 'sync') : 'mxm-warp',
          },
          isActive: data.is_active ?? row.is_active ?? true,
          unifiedTemplateMarkup: uniMarkup,
          routeProvider: resolved?.provider ?? '',
          routeModel: resolved?.model ?? '',
        })
      );
    }, 0);
  }, [routing, message]);

  // 敏感词库加载
  useEffect(() => {
    if (!drawerOpen || !selected) return;
    let cancelled = false;
    (async () => {
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
        const bindingIds = Array.isArray(bindItems) ? bindItems.map((b) => String(b.list_id)) : [];
        setDraft((prev) => (prev ? migrateSensitiveBindingToPipeline(prev, bindingIds) : prev));
      } catch {
        if (!cancelled) {
          setSensitiveLists([]);
        }
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
    await loadListFnRef.current?.();
  };

  const handleCreate = async () => {
    const taskKey = createTaskKey.trim();
    const subtype = createSubtype.trim();
    if (!taskKey) {
      message.warning('taskKey 不能为空');
      return;
    }
    if (!subtype) {
      message.warning('subtype 不能为空');
      return;
    }
    if (createScope !== 'text' && !isPlatformTaskKey(taskKey)) {
      message.warning('taskKey 仅允许：generator / group / series');
      return;
    }
    if (createScope === 'text') {
      if (!isTextV2Type(taskKey)) {
        message.warning('text 仅允许 taskKey：plan / transform / expert / validation');
        return;
      }
      const fixed = getTextV2FixedFormSchema(taskKey);
      const initial: TaskTemplateDraft = {
        ...ensureTaskTemplate({
          formSchema: fixed,
          contractSchema: fixed,
          prompt: {
            unifiedTemplate:
              'You are a specialist for this text step. Follow the subtype rules. Use only the provided fixed inputs. Output exactly as specified in this prompt.',
          },
          pipeline: { pre: [], enrich: [], post: [] },
        }),
        extra: mergeGenerateParams({}, RECOMMENDED_GENERATE_PARAMS),
      };
      const row: PromptConfigRow = {
        id: `new:${createScope}/${taskKey}/${subtype || '-'}`,
        scope: createScope,
        type: taskKey,
        subtype: subtype || null,
        extra: { executionMode: 'sync', taskTemplate: initial, display: {} },
        is_active: true,
      };
      setCreateOpen(false);
      setSelected(row);
      setDraft(initial);
      setExtraDraft({ executionMode: 'sync', taskTemplate: initial, display: {} });
      setIsActive(true);
      setDrawerOpen(true);
      const uniRawNew = initial.prompt.unifiedTemplateMarkup ?? initial.prompt.unifiedTemplate ?? '';
      const uniMarkupNew = uniRawNew.includes('<template')
        ? uniRawNew
        : buildMarkupFromTemplate(uniRawNew, initial.contractSchema ?? initial.formSchema);
      setUnifiedTemplateMarkup(uniMarkupNew);
      setSchemaMode('guided');
      setSchemaRows(schemaPropsToFieldRows(fixed));
      setSchemaJson(prettyJson(fixed));
      setDrawerTabKey('prompt');
      return;
    }
    const initialSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          title: '主题',
          description: '用户可回答的简单方向字段',
          'x-zone': 'basic',
          minLength: 1,
        },
      },
      required: ['topic'],
    };
    const initialBase = ensureWritingStorageDefaults(
      ensureTaskTemplate({
        formSchema: initialSchema,
        contractSchema: initialSchema,
        prompt: {
          unifiedTemplate: '根据下方完整业务合同撰写交付内容。只依据合同事实，不要编造。',
        },
        pipeline: { pre: [], enrich: [], post: [] },
      }),
      createScope
    );
    const initial: TaskTemplateDraft = {
      ...initialBase,
      extra: mergeGenerateParams(
        (initialBase.extra ?? {}) as Record<string, unknown>,
        RECOMMENDED_GENERATE_PARAMS,
      ),
    };
    const row: PromptConfigRow = {
      id: `new:${createScope}/${taskKey}/${subtype || '-'}`,
      scope: createScope,
      type: taskKey,
      subtype: subtype || null,
      extra: { executionMode: 'mxm-warp', taskTemplate: initial },
      is_active: true,
    };
    setCreateOpen(false);
    setSelected(row);
    setDraft(initial);
    setExtraDraft({ executionMode: 'mxm-warp', taskTemplate: initial });
    setIsActive(true);
    setDrawerOpen(true);
    const uniRawNew = initial.prompt.unifiedTemplateMarkup ?? initial.prompt.unifiedTemplate ?? '';
    const uniMarkupNew = uniRawNew.includes('<template')
      ? uniRawNew
      : buildMarkupFromTemplate(uniRawNew, initial.contractSchema ?? initial.formSchema);
    setUnifiedTemplateMarkup(uniMarkupNew);
    setSchemaMode('guided');
    const sanitizedSchema = stripSystemSchemaFields(initial.contractSchema ?? initial.formSchema);
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
      await loadListFnRef.current?.();
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
    await loadListFnRef.current?.();
  };

  const downloadBusinessBundleFile = useCallback((filename: string, data: unknown) => {
    const name = filename.endsWith('.json') ? filename : `${filename}.business.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleBundleExportRow = useCallback(
    async (row: PromptConfigRow) => {
      setBundleExporting(true);
      try {
        const res = await exportBusinessBundleQuery({
          scope: row.scope,
          type: row.type,
          subtype: row.subtype,
          includePricing: bundleExportIncludePricing,
        });
        if (res.error) {
          message.error(res.error);
          return;
        }
        const body = res.data as { success?: boolean; data?: unknown; warnings?: string[] } | undefined;
        if (!body?.success || body.data == null) {
          message.error('导出失败：响应异常');
          return;
        }
        const fn = `${row.scope}-${row.type}-${row.subtype || 'default'}.business.json`;
        downloadBusinessBundleFile(fn, body.data);
        if (body.warnings?.length) message.warning(body.warnings.join('；'));
        message.success('已下载 bundle');
      } finally {
        setBundleExporting(false);
      }
    },
    [bundleExportIncludePricing, downloadBusinessBundleFile, message]
  );

  const handleBundleExportScope = useCallback(async () => {
    setBundleExporting(true);
    try {
      const res = await exportBusinessBundlePost({
        filter: { scope: scopeFilter },
        includePricing: bundleExportIncludePricing,
      });
      if (res.error) {
        message.error(res.error);
        return;
      }
      const body = res.data as { success?: boolean; data?: unknown; warnings?: string[] } | undefined;
      if (!body?.success || body.data == null) {
        message.error('导出失败：响应异常');
        return;
      }
      downloadBusinessBundleFile(`${scopeFilter}-scope-all.business.json`, body.data);
      if (body.warnings?.length) message.warning(body.warnings.join('；'));
      message.success('已下载当前 scope 全部业务 bundle');
    } finally {
      setBundleExporting(false);
    }
  }, [bundleExportIncludePricing, downloadBusinessBundleFile, message, scopeFilter]);

  const handleBundleExportSelected = useCallback(async () => {
    if (bundleTableSelectedKeys.length === 0) {
      message.warning('请先在表格中勾选要导出的业务');
      return;
    }
    const rows = bundleTableSelectedKeys
      .map((id) => list.find((r) => r.id === id))
      .filter((r): r is PromptConfigRow => !!r);
    if (rows.length === 0) {
      message.warning('未找到选中行');
      return;
    }
    setBundleExporting(true);
    try {
      const res = await exportBusinessBundlePost({
        keys: rows.map((r) => ({ scope: r.scope, type: r.type, subtype: r.subtype })),
        includePricing: bundleExportIncludePricing,
      });
      if (res.error) {
        message.error(res.error);
        return;
      }
      const body = res.data as { success?: boolean; data?: unknown; warnings?: string[] } | undefined;
      if (!body?.success || body.data == null) {
        message.error('导出失败：响应异常');
        return;
      }
      downloadBusinessBundleFile(`business-selected-${rows.length}.business.json`, body.data);
      if (body.warnings?.length) message.warning(body.warnings.join('；'));
      message.success('已下载选中业务 bundle');
    } finally {
      setBundleExporting(false);
    }
  }, [bundleExportIncludePricing, bundleTableSelectedKeys, downloadBusinessBundleFile, list, message]);

  const handleBundleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        const dry = await importBusinessBundle({ bundle: parsed, conflictPolicy: 'dry-run' });
        if (dry.error) {
          message.error(dry.error);
          return;
        }
        const body = dry.data as
          | { success?: boolean; data?: { created: string[]; updated: string[]; skipped: string[]; warnings: string[] } }
          | undefined;
        if (!body?.success || !body.data) {
          message.error('dry-run 响应异常');
          return;
        }
        setBundlePendingJson(parsed);
        setBundleImportPreview(body.data);
        setBundleImportModalOpen(true);
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
      }
    },
    [message]
  );

  const runBundleImport = useCallback(
    async (policy: 'upsert' | 'skip') => {
      if (bundlePendingJson == null) return;
      setBundleImportRunning(true);
      try {
        const res = await importBusinessBundle({ bundle: bundlePendingJson, conflictPolicy: policy });
        if (res.error) {
          message.error(res.error);
          return;
        }
        const body = res.data as
          | { success?: boolean; data?: { warnings?: string[] } }
          | undefined;
        const warns = body?.data?.warnings ?? [];
        message.success(policy === 'skip' ? '导入完成（已跳过已存在主配置）' : '导入完成');
        if (warns.length) message.warning(warns.join('；'));
        setBundleImportModalOpen(false);
        setBundlePendingJson(null);
        setBundleImportPreview(null);
        setBundleTableSelectedKeys([]);
        await loadListFnRef.current?.();
      } finally {
        setBundleImportRunning(false);
      }
    },
    [bundlePendingJson, message]
  );

  const handleBundleExportDrawer = useCallback(async () => {
    if (!selected || selected.id.startsWith('new:')) {
      message.warning('请先保存新建业务后再导出');
      return;
    }
    await handleBundleExportRow(selected);
  }, [handleBundleExportRow, message, selected]);

  const buildTaskTemplateFromUi = (markupOverride?: string): TaskTemplateDraft => {
    if (!draft) throw new Error('draft is null');
    const next = { ...draft };
    const effectiveMarkup = markupOverride !== undefined ? markupOverride : unifiedTemplateMarkup;
    const isTextScope = selected?.scope === 'text';

    if (isTextScope && selected?.type) {
      if (!isTextV2Type(selected.type)) {
        throw new Error('text 仅允许 taskKey：plan / transform / expert / validation');
      }
      const fixed = getTextV2FixedFormSchema(selected.type);
      next.contractSchema = fixed;
      next.formSchema = fixed;
      next.pipeline = { pre: [], enrich: [], post: [] };
    } else {
      const baseSchema = next.contractSchema ?? next.formSchema;
      if (schemaMode === 'guided') {
        const schema = fieldRowsToSchema(baseSchema, schemaRows);
        next.contractSchema = schema;
        next.formSchema = schema;
      } else {
        const parsed = safeJsonParse<JsonSchema>(schemaJson);
        if (!parsed.ok) throw new Error(`contractSchema JSON 无效: ${parsed.error}`);
        const schema = stripSystemSchemaFields(parsed.value);
        next.contractSchema = schema;
        next.formSchema = schema;
      }
    }

    const useCoreSkill =
      !!selected &&
      isCoreSkillSlice({
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype,
      });

    if (useCoreSkill) {
      const seed =
        String(next.prompt?.unifiedTemplate ?? '').trim() ||
        String(
          ((next.extra as { groupOutput?: { itemManuscript?: { systemPrompt?: string } } } | undefined)
            ?.groupOutput?.itemManuscript?.systemPrompt ?? '') as string
        );
      const pack = ensureCoreSkillPack({
        pack: readSkillPackFromDraftExtra(next.extra as Record<string, unknown> | undefined),
        contractSchema: (next.contractSchema ?? next.formSchema) as Record<string, unknown>,
        scope: selected!.scope,
        type: selected!.type,
        subtype: selected!.subtype ?? '',
        seedBody: seed,
      });
      const body = skillBodyFromPack(pack);
      next.prompt = {
        unifiedTemplate: body || 'Core Skill',
        unifiedTemplateMarkup: body || 'Core Skill',
      };
      next.extra = {
        ...(next.extra ?? {}),
        skillMode: SKILL_MODE_CORE,
        skillPack: pack,
      };
    } else {
      const parsedUnified = parseTemplateMarkup(effectiveMarkup);
      const unifiedText = parsedUnified.text.trim();
      if (!unifiedText) {
        throw new Error('unifiedTemplate 不能为空');
      }
      next.prompt = {
        unifiedTemplate: unifiedText,
        unifiedTemplateMarkup: effectiveMarkup,
      };
    }

    // pipeline：text 已清空；其它 scope 保留 pre / enrich / post
    if (!isTextScope && next.pipeline) {
      const stripLegacy = (steps?: import('./AdminBusiness.types').PipelineStepDraft[]) =>
        (steps ?? []).filter((s) => s.step !== 'knowledgeRetrieve' && s.step !== 'formatDocument');
      const pre = stripLegacy(next.pipeline.pre);
      const enrich = stripLegacy(next.pipeline.enrich);
      const post = stripLegacy(next.pipeline.post);
      next.pipeline =
        pre.length || enrich.length || post.length
          ? { pre, enrich, post }
          : { pre: [], enrich: [], post: [] };
    }
    delete (next as Record<string, unknown>).inputPipeline;
    delete (next as Record<string, unknown>).outputPipeline;

    if (selected?.scope === 'writing') {
      return syncWritingStorageToFormSchema(syncInteractiveCardFieldsToFormSchema(next));
    }

    return syncInteractiveCardFieldsToFormSchema(next);
  };

  const handleSave = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    let hasError = false;
    try {
      const flushedMarkup =
        typeof promptMarkupGetterRef.current === 'function'
          ? promptMarkupGetterRef.current('string')
          : unifiedTemplateMarkup;
      setUnifiedTemplateMarkup(flushedMarkup);
      const tpl = buildTaskTemplateFromUi(flushedMarkup);
      const coreSkillSelected =
        !!selected &&
        isCoreSkillSlice({
          scope: selected.scope,
          type: selected.type,
          subtype: selected.subtype,
        });
      if (!coreSkillSelected && !tpl.prompt.unifiedTemplate?.trim()) {
        throw new Error('unifiedTemplate 不能为空');
      }
      if (coreSkillSelected) {
        const pack = readSkillPackFromDraftExtra(tpl.extra as Record<string, unknown> | undefined);
        if (!pack?.files.some((f) => f.path === 'SKILL.md' && f.content.trim())) {
          throw new Error('Core Skill：SKILL.md 不能为空');
        }
      }
      if (!tpl.contractSchema || typeof tpl.contractSchema !== 'object') {
        throw new Error('contractSchema 无效');
      }
      if ((tpl.contractSchema.type ?? 'object') !== 'object') {
        throw new Error('contractSchema.type 必须为 object');
      }

      const extra: Record<string, unknown> = {
        ...(extraDraft ?? {}),
        executionMode:
          selected.scope === 'text'
            ? ((extraDraft as { executionMode?: string } | null)?.executionMode ?? 'sync')
            : 'mxm-warp',
        taskTemplate: tpl,
      };
      delete extra.promptTextTaskKey;
      const body: PromptConfigBody = {
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype ?? undefined,
        extra,
        is_active: isActive,
      };
      const res = await upsertPromptConfig(body);
      if (res.error) throw new Error(res.error);

      if (routeProvider && routeModel) {
        const businessType = getBusinessTypeForPromptRow(selected);
        const pipelineListIds = draft ? readSensitiveListIdsFromPipeline(draft) : [];
        const routeRes = await postProvidersRouting({
          logicalModel: businessType,
          provider: routeProvider,
          model: routeModel,
          sensitive_word_list_ids: pipelineListIds.length > 0 ? pipelineListIds : undefined,
        });
        if (routeRes.error) {
          message.error(`路由保存失败：${routeRes.error}`);
          hasError = true;
        } else if (selected && pipelineListIds.length >= 0) {
          await setSensitiveWordBindingsForSlot({
            scope: selected.scope,
            type: selected.type,
            subtype: selected.subtype ?? null,
            list_ids: pipelineListIds,
          });
        }
      }

      if (!hasError) {
        message.success('已保存全部配置');
        setDraft(tpl);
        setExtraDraft({ ...extra, executionMode: 'mxm-warp' });
        setSavedSnapshot(
          JSON.stringify({
            draft: tpl,
            extraDraft: { ...extra, executionMode: 'mxm-warp' },
            isActive,
            unifiedTemplateMarkup: flushedMarkup,
            routeProvider,
            routeModel,
          })
        );
      }
      await loadListFnRef.current?.();
      const refreshed = await getPromptConfigByKey({
        scope: selected.scope,
        type: selected.type,
        subtype: selected.subtype ?? undefined,
        lang: 'zh',
      });
      const refreshedRow = (refreshed.data as { data?: PromptConfigRow } | undefined)?.data;
      if (!refreshed.error && refreshedRow) {
        setSelected((prev) => (prev ? { ...prev, ...refreshedRow } : prev));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
          zone: 'basic',
          enumText: '',
          enumLabelsText: '',
          defaultText: '',
        });
      }
      return next;
    });
    setDrawerTabKey('schema');
    message.info('已把缺失变量补到合同字段');
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
                label: '业务编排',
                children: (
                  <>
                    <div className="admin-business-toolbar">
                      <div className="admin-business-toolbar__filters">
                        <Select<Scope>
                          className="admin-business-toolbar__scope"
                          value={scopeFilter}
                          onChange={(v) => setScopeFilter(v)}
                          options={[
                            { value: 'writing', label: '写作 (writing)' },
                            { value: 'graph', label: '图文 (graph)' },
                            { value: 'audio', label: '音频 (audio)' },
                            { value: 'music', label: '音乐 (music)' },
                            { value: 'video', label: '视频 (video)' },
                            { value: 'text', label: '纯文本 (text)' },
                          ]}
                        />
                        <Input
                          className="admin-business-toolbar__search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="搜索 taskKey / subtype / 显示名…"
                          allowClear
                        />
                      </div>
                      <div className="admin-business-toolbar__actions">
                        <Button onClick={() => void loadListFnRef.current?.()} loading={loading}>
                          刷新
                        </Button>
                        <Dropdown
                          trigger={['click']}
                          placement="bottomRight"
                          disabled={bundleExporting}
                          popupRender={(menu) => (
                            <div className="admin-business-export-dropdown">
                              <label className="admin-business-export-dropdown__option">
                                <Checkbox
                                  checked={bundleExportIncludePricing}
                                  onChange={(e) => setBundleExportIncludePricing(e.target.checked)}
                                />
                                <span>含 businessPricing</span>
                              </label>
                              <div className="admin-business-export-dropdown__menu">{menu}</div>
                            </div>
                          )}
                          menu={{
                            items: [
                              {
                                key: 'scope',
                                icon: <DownloadOutlined />,
                                label: '导出当前 scope',
                                onClick: () => void handleBundleExportScope(),
                              },
                              {
                                key: 'selected',
                                icon: <DownloadOutlined />,
                                label:
                                  bundleTableSelectedKeys.length > 0
                                    ? `导出选中 (${bundleTableSelectedKeys.length})`
                                    : '导出选中',
                                disabled: bundleTableSelectedKeys.length === 0,
                                onClick: () => void handleBundleExportSelected(),
                              },
                            ],
                          }}
                        >
                          <Button icon={<DownloadOutlined />} loading={bundleExporting}>
                            导出
                            <DownOutlined className="admin-business-toolbar__caret" />
                          </Button>
                        </Dropdown>
                        <Button icon={<UploadOutlined />} onClick={() => bundleFileInputRef.current?.click()}>
                          导入 JSON
                        </Button>
                        <Button
                          type="primary"
                          onClick={() => {
                            setCreateScope(scopeFilter);
                            setCreateTaskKey(scopeFilter === 'text' ? 'transform' : 'generator');
                            setCreateSubtype('');
                            setCreateOpen(true);
                          }}
                        >
                          新建业务
                        </Button>
                      </div>
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
                          className="admin-business-list-table"
                          size="small"
                          rowKey="id"
                          dataSource={visibleList}
                          rowSelection={{
                            selectedRowKeys: bundleTableSelectedKeys,
                            onChange: (keys) => setBundleTableSelectedKeys(keys),
                          }}
                          loading={loading}
                          scroll={{ x: BUSINESS_LIST_TABLE_SCROLL_X }}
                          pagination={{ pageSize: 10, showSizeChanger: false }}
                          columns={[
                            {
                              title: 'taskKey',
                              dataIndex: 'type',
                              width: 160,
                              fixed: 'left',
                              className: 'admin-business-col-taskkey',
                              render: (_: unknown, r: PromptConfigRow) =>
                                renderBusinessIdentityCell(resolveTaskKeyDisplay(r)),
                            },
                            {
                              title: 'subtype',
                              dataIndex: 'subtype',
                              width: 200,
                              fixed: 'left',
                              className: 'admin-business-col-subtype',
                              render: (_: unknown, r: PromptConfigRow) =>
                                renderBusinessIdentityCell(resolveSubtypeDisplay(r)),
                            },
                            {
                              title: '启用',
                              dataIndex: 'is_active',
                              width: 64,
                              align: 'center',
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
                            {
                              title: '当前物理模型',
                              width: 240,
                              className: 'admin-business-col-model',
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
                              title: '操作',
                              width: 300,
                              fixed: 'right',
                              className: 'admin-business-col-actions',
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
                                    <Button
                                      size="small"
                                      icon={<BugOutlined />}
                                      onClick={() => {
                                        setTestRow({
                                          id: r.id,
                                          scope: r.scope,
                                          type: r.type,
                                          subtype: r.subtype ?? null,
                                        });
                                        setTestOpen(true);
                                      }}
                                    >
                                      调试
                                    </Button>
                                    <Button
                                      size="small"
                                      icon={<DownloadOutlined />}
                                      loading={bundleExporting}
                                      onClick={() => void handleBundleExportRow(r)}
                                    >
                                      导出
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
                              className: 'admin-business-col-updated',
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
              {
                key: 'searchConfig',
                label: '搜索引擎',
                children: <AdminSearchConfig />,
              },
            ]}
          />
        </div>
      </div>

      {/* 详情 Drawer */}
      <Drawer
        title={
          selected
            ? (() => {
                const { title, subtitle } = formatBusinessDrawerTitle(selected);
                return (
                  <div className="admin-business-drawer-title">
                    <span>{title}</span>
                    {subtitle ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {subtitle}
                      </Typography.Text>
                    ) : null}
                  </div>
                );
              })()
            : '编辑业务'
        }
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelected(null);
          setDraft(null);
          setExtraDraft({});
          setSensitiveLists([]);
        }}
        className="admin-business-drawer"
        size={1080}
        styles={{ body: { padding: '12px 16px', overflowX: 'hidden' } }}
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
                disabled={!selected || detailLoading || !isActive || selected?.id?.startsWith('new:')}
                onClick={() => {
                  if (!selected) return;
                  const slugBase = `${selected.scope}-${selected.type}${selected.subtype ? `-${selected.subtype}` : ''}`
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                  setPublishPreset({
                    kind: 'task_v2',
                    taskV2Scope: selected.scope,
                    taskV2TaskKey: selected.type,
                    taskV2Subtype: selected.subtype ?? undefined,
                    titleHint: slugBase,
                  });
                  setPublishOpen(true);
                }}
              >
                发布 API
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                loading={bundleExporting}
                disabled={!selected || detailLoading || selected?.id?.startsWith('new:')}
                onClick={() => void handleBundleExportDrawer()}
              >
                导出此业务
              </Button>
              <Button
                type="primary"
                size="small"
                loading={saving}
                onClick={() => void handleSave()}
              >
                保存全部
              </Button>
              {hasUnsavedChanges ? (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  有未保存更改
                </Typography.Text>
              ) : null}
            </Space>
          </div>

          {detailLoading ? (
            <div className="admin-business-detail-loading">
              <Spin description="加载业务配置…" />
            </div>
          ) : (
            <div className="admin-business-editorBodyInner">
              <div className="admin-warp-stage-rail" aria-label="mxm-warp 五段">
                {selected?.scope === 'text' ? (
                  <>
                    <button
                      type="button"
                      className={[
                        'admin-warp-stage-rail__chip',
                        drawerTabKey === 'schema' ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setDrawerTabKey('schema')}
                    >
                      固定入参
                    </button>
                    <span className="admin-warp-stage-rail__sep" aria-hidden>
                      →
                    </span>
                    <button
                      type="button"
                      className={[
                        'admin-warp-stage-rail__chip',
                        drawerTabKey === 'prompt' ? 'is-active is-focus' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setDrawerTabKey('prompt')}
                    >
                      Prompt
                    </button>
                    <Tag color="processing" style={{ marginLeft: 8 }}>
                      text v2 · 无管道
                    </Tag>
                  </>
                ) : (
                  <>
                    {(
                      [
                        { key: 'schema', stage: '字段', tab: 'schema' },
                        { key: 'pre', stage: 'pre', tab: 'pipeline' },
                        { key: 'input', stage: 'input', tab: 'pipeline' },
                        { key: 'enrich', stage: 'enrich', tab: 'pipeline' },
                        { key: 'output', stage: 'output', tab: 'prompt' },
                        { key: 'post', stage: 'post', tab: 'pipeline' },
                      ] as const
                    ).map((item, i, arr) => (
                      <Fragment key={item.key}>
                        <button
                          type="button"
                          className={[
                            'admin-warp-stage-rail__chip',
                            drawerTabKey === item.tab ? 'is-active' : '',
                            item.tab === 'prompt' && drawerTabKey === 'prompt' && item.key === 'output'
                              ? 'is-focus'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setDrawerTabKey(item.tab)}
                        >
                          {item.stage}
                        </button>
                        {i < arr.length - 1 ? (
                          <span className="admin-warp-stage-rail__sep" aria-hidden>
                            →
                          </span>
                        ) : null}
                      </Fragment>
                    ))}
                    <Tag color="processing" style={{ marginLeft: 8 }}>
                      mxm-warp
                    </Tag>
                  </>
                )}
              </div>
              <Tabs
                activeKey={drawerTabKey}
                onChange={setDrawerTabKey}
                items={[
                  {
                    key: 'schema',
                    label: selected?.scope === 'text' ? '固定入参' : '合同字段',
                    children:
                      selected?.scope === 'text' && isTextV2Type(selected.type) ? (
                        <Alert
                          type="info"
                          showIcon
                          title={`text/${selected.type} 入参由平台钉死，不可改键`}
                          description={
                            <div>
                              <Typography.Paragraph style={{ marginBottom: 8 }}>
                                固定键：{TEXT_V2_INPUT_KEYS[selected.type].join(' · ')}
                              </Typography.Paragraph>
                              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                Admin 只编 subtype、显示名、Prompt、模型路由。合同双区与五段管道仅宿主生成业务使用。
                              </Typography.Paragraph>
                              <pre
                                style={{
                                  marginTop: 12,
                                  maxHeight: 320,
                                  overflow: 'auto',
                                  fontSize: 12,
                                  background: 'rgba(0,0,0,0.04)',
                                  padding: 12,
                                  borderRadius: 8,
                                }}
                              >
                                {prettyJson(getTextV2FixedFormSchema(selected.type))}
                              </pre>
                            </div>
                          }
                        />
                      ) : (
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
                          const base =
                            draft?.contractSchema ??
                            draft?.formSchema ?? { type: 'object', properties: {}, required: [] };
                          const parsed = safeJsonParse<JsonSchema>(schemaJson);
                          const nextSchema =
                            schemaMode === 'guided'
                              ? fieldRowsToSchema(base, schemaRows)
                              : parsed.ok
                                ? parsed.value
                                : base;
                          setSchemaJson(prettyJson(nextSchema));
                        }}
                        onUnifiedTemplateMarkupChange={setUnifiedTemplateMarkup}
                        onAddMissingVarsToSchema={handleAddMissingVarsToSchema}
                      />
                      ),
                  },
                  ...(selected?.scope === 'text'
                    ? []
                    : [
                        {
                          key: 'pipeline',
                          label: '执行管线',
                          children: (
                            <AdminBusinessPipelineTab
                              draft={draft}
                              selected={selected}
                              textBusinessOptions={textBusinessOptions}
                              sensitiveLists={sensitiveLists}
                              sensitiveHint={sensitiveHint}
                              onDraftChange={setDraft}
                              onNavigateToPrompt={() => setDrawerTabKey('prompt')}
                            />
                          ),
                        },
                      ]),
                  {
                    key: 'prompt',
                    label: (() => {
                      if (!selected) return 'Output Prompt';
                      if (
                        isCoreSkillSlice({
                          scope: selected.scope,
                          type: selected.type,
                          subtype: selected.subtype,
                        })
                      ) {
                        return selected.scope === 'text' ? 'Skill' : 'Core Skill';
                      }
                      return selected.scope === 'text' ? 'Prompt' : 'Output Prompt';
                    })(),
                    children: (() => {
                      if (
                        selected &&
                        isCoreSkillSlice({
                          scope: selected.scope,
                          type: selected.type,
                          subtype: selected.subtype,
                        })
                      ) {
                        return (
                          <AdminBusinessCoreSkillTab
                            draft={draft}
                            scope={selected.scope}
                            type={selected.type}
                            subtype={selected.subtype}
                            onDraftChange={setDraft}
                          />
                        );
                      }
                      return (
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
                          unusedSchemaVars={unusedSchemaVars}
                          onPromptVarSearchChange={setPromptVarSearch}
                          onUnifiedTemplateMarkupChange={setUnifiedTemplateMarkup}
                          onAddMissingVarsToSchema={handleAddMissingVarsToSchema}
                        />
                      );
                    })(),
                  },
                  {
                    key: 'model_config',
                    label: '模型配置',
                    forceRender: true,
                    children: (
                      <AdminBusinessPricingTab
                        selected={selected}
                        extraDraft={extraDraft}
                        videoGeneratorBusinesses={videoBusinessOptions}
                        routing={routing}
                        routeProvider={routeProvider}
                        routeModel={routeModel}
                        routeDirty={routeDirty}
                        draft={draft}
                        platformPriceSummary={
                          (() => {
                            if (!selected || !routeProvider || !routeModel) return null;
                            const allowedScopes = allowedModelScopesForBusiness(selected.scope as Scope);
                            let pp: ProviderPricingRow | undefined;
                            for (const s of allowedScopes) {
                              pp = providerPricingIndex.get(`${routeProvider}||${s}||${routeModel}`);
                              if (pp) break;
                            }
                            if (!pp) {
                              pp = providerPricingIndex.get(`${routeProvider}||default||${routeModel}`);
                            }
                            return formatPlatformPriceSummary(pp);
                          })()
                        }
                        currentRoutableModels={currentRoutableModels}
                        modelsByProviderByScope={modelsByProviderByScope}
                        onRouteProviderChange={(v) => {
                          setRouteProvider(v);
                          setRouteModel('');
                        }}
                        onRouteModelChange={setRouteModel}
                        onSaveRoute={() => void saveBusinessRouteForSelected()}
                        onExtraDraftChange={setExtraDraft}
                        onDraftChange={setDraft}
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
                        extraDraft={extraDraft}
                        scopeFilter={scopeFilter}
                        onDisplayConfigChange={(d) =>
                          setExtraDraft((prev) => ({
                            ...(prev ?? {}),
                            display: d,
                          }))
                        }
                        onDraftChange={setDraft}
                        onExtraDraftChange={setExtraDraft}
                      />
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Drawer>

      <input
        ref={bundleFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => void handleBundleImportFileChange(e)}
      />

      <Modal
        title="导入预览（dry-run，未写入数据库）"
        open={bundleImportModalOpen}
        onCancel={() => {
          setBundleImportModalOpen(false);
          setBundlePendingJson(null);
          setBundleImportPreview(null);
        }}
        width={640}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setBundleImportModalOpen(false);
              setBundlePendingJson(null);
              setBundleImportPreview(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="skip"
            loading={bundleImportRunning}
            onClick={() => void runBundleImport('skip')}
          >
            导入（skip 已存在主配置）
          </Button>,
          <Button
            key="upsert"
            type="primary"
            loading={bundleImportRunning}
            onClick={() => void runBundleImport('upsert')}
          >
            导入（upsert 覆盖）
          </Button>,
        ]}
      >
        {bundleImportPreview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              将新建约 <strong>{bundleImportPreview.created.length}</strong> 条记录键；将更新约{' '}
              <strong>{bundleImportPreview.updated.length}</strong> 条；将跳过约{' '}
              <strong>{bundleImportPreview.skipped.length}</strong> 条（仅 skip 策略生效）。
            </Typography.Paragraph>
            {bundleImportPreview.warnings.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                title="警告"
                description={
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                    {bundleImportPreview.warnings.join('\n')}
                  </pre>
                }
              />
            ) : null}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              详细键名见控制台或自行展开 JSON；大列表建议在 dry-run 后使用 upsert 一次性同步。
            </Typography.Text>
          </div>
        ) : null}
      </Modal>

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

      <PublishOpenApiDrawer
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        preset={publishPreset}
      />
    </div>
  );
}
