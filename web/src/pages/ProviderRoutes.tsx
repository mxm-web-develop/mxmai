import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  App,
  Table,
  Button,
  Select,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Popconfirm,
  Tabs,
  Collapse,
  Steps,
  Alert,
  Typography,
  Tag,
} from 'antd';
import {
  getProvidersOptions,
  getProvidersStats,
  getProvidersBilling,
  putProviderBalance,
  getProviderKeys,
  postProviderKey,
  putProviderKey,
  deleteProviderKey,
  type ProviderStatsItem,
  type ProviderBillingItem,
  type ProviderApiKeyMasked,
  getProvidersCosts,
  type ProviderCostByProvider,
  getProviderPricing,
  upsertProviderPricing,
  type ProviderPricingRow,
  type UpsertProviderPricingBody,
  getProviderModels,
  getProviderModelTests,
  postProviderModel,
  putProviderModel,
  deleteProviderModel,
  testProviderModel,
  getKnowledgeEmbeddingDefault,
  putKnowledgeEmbeddingDefault,
  type KnowledgeEmbeddingDefaultConfig,
  type ProviderModelTestRunRow,
  type ProviderModelRow,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
// import type { ColumnsType } from 'antd/es/table';

const WINDOW_OPTIONS = [
  { value: '1d', label: '1天' },
  { value: '7d', label: '7天' },
  { value: '15d', label: '15天' },
  { value: '30d', label: '30天' },
];

const KEY_PROVIDER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'openrouter', label: 'openrouter' },
  { value: 'qhai', label: 'qhai（启航 AI）' },
  { value: 'jiekou', label: 'jiekou（接口AI）' },
  { value: 'atlascloud', label: 'atlascloud' },
  { value: 'deer', label: 'deer（已下架，仅历史数据）' },
  { value: 'replicate', label: 'replicate' },
  { value: 'ppio', label: 'ppio' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'qwen', label: 'qwen' },
  { value: 'volc', label: 'volc' },
  { value: 'minimax', label: 'minimax' },
  { value: 'maxplan', label: 'maxplan' },
];

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'openrouter' },
  { value: 'qhai', label: 'qhai（启航 AI）' },
  { value: 'jiekou', label: 'jiekou（接口AI）' },
  { value: 'atlascloud', label: 'atlascloud' },
  { value: 'deer', label: 'deer（已下架，仅历史数据）' },
  { value: 'replicate', label: 'replicate' },
  { value: 'ppio', label: 'ppio' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'qwen', label: 'qwen' },
  { value: 'volc', label: 'volc' },
  { value: 'minimax', label: 'minimax' },
  { value: 'maxplan', label: 'maxplan' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'USDT', label: 'USDT' },
  { value: 'CNY', label: 'RMB' },
];

const CHARGE_MODE_OPTIONS = [
  {
    value: 'token_based',
    label: 'token_based（按 Token；输入/输出可分别选「每千」或「每百万」）',
  },
  { value: 'per_request', label: 'per_request（按请求次数）' },
  { value: 'per_image', label: 'per_image（按图片张数）' },
  { value: 'per_second_audio', label: 'per_second_audio（按音频秒数）' },
  { value: 'per_second_video', label: 'per_second_video（按视频秒数）' },
];

/** 与后端计费一致：库内始终存「每千 Token」单价；每百万报价在保存时除以 1000 */
type TokenPriceBasis = 'per_1k' | 'per_1m';

const TOKEN_BASIS_OPTIONS: { value: TokenPriceBasis; label: string }[] = [
  { value: 'per_1k', label: '每千 Token' },
  { value: 'per_1m', label: '每百万 Token' },
];

function toPer1kStored(price: number, basis: TokenPriceBasis): number {
  if (!Number.isFinite(price)) return 0;
  return basis === 'per_1m' ? price / 1000 : price;
}

function fromPer1kStored(
  stored: number | null | undefined,
  basis: TokenPriceBasis
): number | undefined {
  if (stored == null) return undefined;
  const n = Number(stored);
  if (!Number.isFinite(n)) return undefined;
  return basis === 'per_1m' ? n * 1000 : n;
}

function readTokenBasis(meta: Record<string, unknown> | null | undefined): {
  input: TokenPriceBasis;
  output: TokenPriceBasis;
  combined: TokenPriceBasis;
} {
  const raw = meta?.token_price_basis as Record<string, unknown> | undefined;
  const pick = (k: string): TokenPriceBasis =>
    raw?.[k] === 'per_1m' ? 'per_1m' : 'per_1k';
  return {
    input: pick('input'),
    output: pick('output'),
    combined: pick('combined'),
  };
}

/** 保存时写入 DB：单价列始终为「每千 Token」；metadata.token_price_basis 记录表单所选单位便于回显 */
function computeStoredTokenPrices(values: Record<string, unknown>, chargeMode: string) {
  const ib = (values.input_token_basis as TokenPriceBasis) ?? 'per_1k';
  const ob = (values.output_token_basis as TokenPriceBasis) ?? 'per_1k';
  const cb = (values.combined_token_basis as TokenPriceBasis) ?? 'per_1k';
  const tokenBasisMeta = { input: ib, output: ob, combined: cb };

  if (chargeMode !== 'token_based') {
    return {
      unit_price: Number(values.unit_price ?? 0),
      input_unit_price: null,
      output_unit_price: null,
      tokenBasisMeta,
    };
  }

  const inp =
    values.input_unit_price != null && values.input_unit_price !== ''
      ? toPer1kStored(Number(values.input_unit_price), ib)
      : null;
  const out =
    values.output_unit_price != null && values.output_unit_price !== ''
      ? toPer1kStored(Number(values.output_unit_price), ob)
      : null;
  const combined =
    values.unit_price != null && values.unit_price !== ''
      ? toPer1kStored(Number(values.unit_price), cb)
      : 0;

  return {
    unit_price: combined,
    input_unit_price: inp,
    output_unit_price: out,
    tokenBasisMeta,
  };
}

/** 上架硬门禁：成本价至少一项 > 0（与后端 /admin/pricing/provider 一致） */
function hasMeaningfulProviderCost(stored: {
  unit_price: number | null;
  input_unit_price: number | null;
  output_unit_price: number | null;
}): boolean {
  const u = Number(stored.unit_price ?? 0);
  const i = Number(stored.input_unit_price ?? 0);
  const o = Number(stored.output_unit_price ?? 0);
  return u > 0 || i > 0 || o > 0;
}

/** 成本 USD → 默认 MXM-TOKEN（×100×2.5）；与后端 fillDefaultPlatformPricesFromCost 一致 */
function usdToDefaultPlatformTokens(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(0.001, Math.round(usd * 100 * 2.5 * 1000) / 1000);
}

/** 保存时：未填 MXM-TOKEN 则按成本自动填默认售价（可被用户显式值覆盖） */
function resolvePlatformPricesForSave(
  chargeMode: string,
  stored: {
    unit_price: number | null;
    input_unit_price: number | null;
    output_unit_price: number | null;
  },
  values: Record<string, unknown>
): {
  platform_unit_price: number | null;
  platform_input_unit_price: number | null;
  platform_output_unit_price: number | null;
} {
  const pos = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let platformUnit = pos(values.platform_unit_price);
  let platformIn = pos(values.platform_input_unit_price);
  let platformOut = pos(values.platform_output_unit_price);
  const costUnit = Number(stored.unit_price ?? 0);
  const costIn = Number(stored.input_unit_price ?? 0);
  const costOut = Number(stored.output_unit_price ?? 0);
  if (chargeMode === 'token_based') {
    if (platformIn == null && costIn > 0) platformIn = usdToDefaultPlatformTokens(costIn);
    if (platformOut == null && costOut > 0) platformOut = usdToDefaultPlatformTokens(costOut);
    if (platformUnit == null && costUnit > 0 && !(costIn > 0 || costOut > 0)) {
      platformUnit = usdToDefaultPlatformTokens(costUnit);
    }
    if (platformUnit == null && costUnit > 0 && platformIn == null && platformOut == null) {
      platformUnit = usdToDefaultPlatformTokens(costUnit);
    }
  } else if (platformUnit == null && costUnit > 0) {
    platformUnit = usdToDefaultPlatformTokens(costUnit);
  }
  return {
    platform_unit_price: platformUnit,
    platform_input_unit_price: platformIn,
    platform_output_unit_price: platformOut,
  };
}

const SCOPE_OPTIONS = [
  { value: 'writing', label: 'writing（写作）' },
  { value: 'graph', label: 'graph（图片生成）' },
  { value: 'audio', label: 'audio（音频）' },
  { value: 'video', label: 'video（视频）' },
  { value: 'music', label: 'music（音乐）' },
  { value: 'text', label: 'text（文本对话）' },
  { value: 'knowledge', label: 'knowledge（知识库向量）' },
];

const EMBEDDING_PROTOCOL_OPTIONS = [{ value: 'openai-embeddings', label: 'openai-embeddings' }];

/** 6 种模态（与 AtlasCloud 官方归类对齐 + Embedding） */
const MODALITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'text', label: 'T 文本' },
  { value: 'image', label: '🖼 图片' },
  { value: 'audio', label: '🔊 语音/音频' },
  { value: 'video', label: '🎬 视频' },
  { value: '3d', label: '🧊 3D 模型' },
  { value: 'embed', label: '🔢 向量（embedding）' },
];

const VALID_MODALITIES = new Set(MODALITY_OPTIONS.map((o) => o.value));

/** 兼容读：优先 supported_inputs[]，回退 input{...} */
function readSupportedInputs(caps: Record<string, unknown> | null | undefined): string[] {
  if (!caps) return [];
  if (Array.isArray(caps.supported_inputs)) {
    return (caps.supported_inputs as unknown[]).filter(
      (x): x is string => typeof x === 'string' && VALID_MODALITIES.has(x)
    );
  }
  if (caps.input && typeof caps.input === 'object') {
    return Object.entries(caps.input as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .filter((k) => VALID_MODALITIES.has(k));
  }
  return [];
}

function readSupportedOutputs(caps: Record<string, unknown> | null | undefined): string[] {
  if (!caps) return [];
  if (Array.isArray(caps.supported_outputs)) {
    return (caps.supported_outputs as unknown[]).filter(
      (x): x is string => typeof x === 'string' && VALID_MODALITIES.has(x)
    );
  }
  if (caps.output && typeof caps.output === 'object') {
    return Object.entries(caps.output as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .filter((k) => VALID_MODALITIES.has(k));
  }
  return [];
}

function readProviderModes(caps: Record<string, unknown> | null | undefined): string[] {
  if (!caps) return [];
  if (Array.isArray(caps.modes)) {
    return (caps.modes as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function buildModelCapabilities(
  values: ProviderModelFormValues,
): Record<string, unknown> | null {
  const built: Record<string, unknown> = {};
  // 新字段（拍平数组，运行时优先读）
  const supportedInputs = (values.cap_supported_inputs ?? []).filter((m) =>
    VALID_MODALITIES.has(m as string)
  );
  const supportedOutputs = (values.cap_supported_outputs ?? []).filter((m) =>
    VALID_MODALITIES.has(m as string)
  );
  if (supportedInputs.length > 0) {
    built.supported_inputs = supportedInputs;
    // 双写老格式，保持向后兼容
    const inputMap: Record<string, boolean> = {};
    for (const m of supportedInputs) inputMap[m as string] = true;
    built.input = inputMap;
  }
  if (supportedOutputs.length > 0) {
    built.supported_outputs = supportedOutputs;
    const outputMap: Record<string, boolean> = {};
    for (const m of supportedOutputs) outputMap[m as string] = true;
    built.output = outputMap;
  }
  if (values.cap_modes && values.cap_modes.length > 0) {
    built.modes = values.cap_modes;
  }
  if (values.cap_context_window != null) built.context_window = values.cap_context_window;
  if (values.cap_vector_dim != null) {
    built.vector_dim = values.cap_vector_dim;
    if (values.scope === 'knowledge') built.supports_dimensions = true;
  }
  return Object.keys(built).length > 0 ? built : null;
}

function buildDefaultParameters(values: ProviderModelFormValues): Record<string, unknown> | null {
  if (values.scope === 'knowledge' && values.cap_vector_dim != null) {
    return { dimensions: values.cap_vector_dim };
  }
  return (values.default_parameters as Record<string, unknown> | null | undefined) ?? null;
}

function resolveModelProtocol(values: ProviderModelFormValues): string | null {
  if (values.protocol?.trim()) return values.protocol.trim();
  if (values.scope === 'knowledge') return 'openai-embeddings';
  return null;
}

function isKnowledgeDefaultModel(
  row: ProviderModelRow,
  cfg: KnowledgeEmbeddingDefaultConfig | null,
): boolean {
  const provider = cfg?.config?.provider ?? cfg?.resolved?.provider;
  const model = cfg?.config?.model ?? cfg?.resolved?.modelKey;
  return row.scope === 'knowledge' && row.provider === provider && row.model_key === model;
}

function deriveModalityByScope(scope?: string, fallback?: string | null): string | null {
  const s = String(scope || '').toLowerCase();
  if (s === 'graph') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'video') return 'video';
  if (s === 'knowledge') return 'embedding';
  if (s === 'text' || s === 'writing') return 'text';
  return fallback ?? null;
}

// function getScopeFromLogicalModel(logicalModel: string): 'graph' | 'writing' | 'audio' | 'video' | undefined {
//   // 写作相关业务统一映射到 scope='writing'，这样下拉只展示写作相关 LLM，
//   // 不会把 sora / nano-banana 等图片/视频模型混进来
//   if (logicalModel.startsWith('writing-')) return 'writing';
//   if (logicalModel.startsWith('graph-')) return 'graph';
//   if (logicalModel.startsWith('audio-')) return 'audio';
//   if (logicalModel.startsWith('video-')) return 'video';
//   return undefined;
// }

// const BASIC_TEXT_LOGICAL_MODELS = ['writing-basic-text'];

// function getRoutingRowCategory(logicalModel: string): string {
//   if (logicalModel === 'writing-basic-text') return '基础文字（内部调用）';
//   if (logicalModel.startsWith('graph-')) return '图片';
//   if (logicalModel.startsWith('writing-')) return '写作';
//   if (logicalModel.startsWith('audio-')) return '音频';
//   if (logicalModel.startsWith('video-')) return '视频';
//   return '其他';
// }

/** 排序权重：保证基础文字模型紧接在写作后、音频前，便于在列表中看到 */
// function routingSortOrder(logicalModel: string): number {
//   if (logicalModel.startsWith('graph-')) return 0;
//   if (logicalModel.startsWith('writing-') && !BASIC_TEXT_LOGICAL_MODELS.includes(logicalModel)) return 1;
//   if (BASIC_TEXT_LOGICAL_MODELS.includes(logicalModel)) return 2;
//   if (logicalModel.startsWith('audio-')) return 3;
//   if (logicalModel.startsWith('video-')) return 4;
//   return 5;
// }

// type RoutingRow = { key: string; logicalModel: string; provider: string; model: string; overridden?: boolean; rawProvider: string; category: string };

/** 物理模型表单 = 模型字段 + Provider 成本（USD）+ MXM-TOKEN（platform_*） */
type ProviderModelFormValues = Partial<ProviderModelRow> & {
  pricing_id?: string;
  charge_mode?: string;
  unit_price?: number;
  input_unit_price?: number | null;
  output_unit_price?: number | null;
  platform_unit_price?: number | null;
  platform_input_unit_price?: number | null;
  platform_output_unit_price?: number | null;
  platform_min_charge?: number | null;
  currency?: string;
  input_token_basis?: TokenPriceBasis;
  output_token_basis?: TokenPriceBasis;
  combined_token_basis?: TokenPriceBasis;
  sync_text_writing?: boolean; // 同时为 text + writing 创建定价
  // —— 模型能力（capabilities JSONB） ——
  cap_context_window?: number;
  cap_vector_dim?: number;
  /** 拍平数组：text/image/audio/video/3d/embed */
  cap_supported_inputs?: string[];
  cap_supported_outputs?: string[];
  /** 模式：text-to-image / image-to-video / reference-to-video / chat / embedding ... */
  cap_modes?: string[];
  protocol?: string;
};

type ProviderModelTestStep = {
  key: string;
  title: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
  at: string;
};

type ProviderModelTestResult = {
  success: boolean;
  latencyMs: number;
  error: string | null;
  provider: string;
  model_key: string;
  scope: string;
  modality?: string | null;
  requestPayload?: {
    prompt: string;
    outputFormat: 'json';
    parameters: Record<string, unknown>;
    inferredModality: string;
  } | null;
  responseMeta?: Record<string, unknown> | null;
  steps?: ProviderModelTestStep[];
};

export default function ProviderRoutes() {
  const { message } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();
  // const [routing, setRouting] = useState<Record<string, ProviderRoutingEntry>>({});
  // const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  // const [modelsByProviderByScope, setModelsByProviderByScope] = useState<Record<string, Record<string, string[]>>>({});
  const [stats, setStats] = useState<ProviderStatsItem[]>([]);
  const [billing, setBilling] = useState<ProviderBillingItem[]>([]);
  const [costs, setCosts] = useState<ProviderCostByProvider[]>([]);
  const [window_, setWindow] = useState<string>('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keysList, setKeysList] = useState<ProviderApiKeyMasked[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyProviderFilter, setKeyProviderFilter] = useState<string>('');
  const [keySearch, setKeySearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm<{
    provider: string;
    service?: string;
    key_value: string;
    priority?: number;
    is_active?: boolean;
  }>();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // const [editModalOpen, setEditModalOpen] = useState(false);
  // const [editingRow, setEditingRow] = useState<RoutingRow | null>(null);
  // const [editForm] = Form.useForm<{ provider: string; model: string }>();
  // const [editSaving, setEditSaving] = useState(false);
  const [providerPricing, setProviderPricing] = useState<ProviderPricingRow[]>([]);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceModalProvider, setBalanceModalProvider] = useState<string | null>(null);
  const [balanceModalValue, setBalanceModalValue] = useState<number>(0);
  const [balanceModalCurrency, setBalanceModalCurrency] = useState<string>('USD');
  const [providerModels, setProviderModels] = useState<ProviderModelRow[]>([]);
  const [providerModelsTotal, setProviderModelsTotal] = useState(0);
  const [providerModelsLoading, setProviderModelsLoading] = useState(false);
  const [providerModelsFilter, setProviderModelsFilter] = useState<{
    provider?: string;
    scope?: string;
    onlyEnabled?: boolean;
  }>({});
  const [providerModelModalOpen, setProviderModelModalOpen] = useState(false);
  const [editingProviderModel, setEditingProviderModel] = useState<ProviderModelRow | null>(null);
  const [providerModelForm] = Form.useForm<ProviderModelFormValues>();
  const [providerModelSaving, setProviderModelSaving] = useState(false);
  const [providerModelTestResult, setProviderModelTestResult] = useState<ProviderModelTestResult | null>(null);
  const [providerModelTestSteps, setProviderModelTestSteps] = useState<ProviderModelTestStep[]>([]);
  const [providerModelTestingRow, setProviderModelTestingRow] = useState<ProviderModelRow | null>(null);
  const [providerModelTestModalOpen, setProviderModelTestModalOpen] = useState(false);
  const [providerModelTestLoading, setProviderModelTestLoading] = useState<string | null>(null);
  const [providerModelTestHistory, setProviderModelTestHistory] = useState<ProviderModelTestRunRow[]>([]);
  const [knowledgeEmbDefault, setKnowledgeEmbDefault] = useState<KnowledgeEmbeddingDefaultConfig | null>(
    null
  );
  const [knowledgeDefaultSaving, setKnowledgeDefaultSaving] = useState<string | null>(null);
  /** 编辑定价时合并 metadata（避免覆盖官方链接等扩展字段） */
  const providerPricingMetadataRef = useRef<Record<string, unknown>>({});

  const visibleKeysList = useMemo(() => {
    const sorted = [...keysList].sort((a, b) => a.priority - b.priority);
    const q = keySearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((k) => {
      const s =
        `${k.provider ?? ''} ${k.service ?? ''} ${k.key_masked ?? ''} ${k.priority ?? ''}`.toLowerCase();
      return s.includes(q);
    });
  }, [keysList, keySearch]);

  // const fetchRouting = useCallback(async () => {
  //   const res = await getProvidersRouting();
  //   if (res.error) {
  //     setError(res.status === 403 ? '需要 Admin 权限' : res.error);
  //     return;
  //   }
  //   const data = (res.data as { data?: Record<string, ProviderRoutingEntry> })?.data ?? (res.data as Record<string, ProviderRoutingEntry>);
  //   if (data && typeof data === 'object') setRouting(data);
  // }, []);

  const fetchOptions = useCallback(async () => {
    const res = await getProvidersOptions();
    if (res.error) return;
    // const payload = (res.data as { data?: { modelsByProvider?: Record<string, string[]>; modelsByProviderByScope?: Record<string, Record<string, string[]>> } })?.data;
    // options 曾用于“业务模型管理/路由编辑”Tab（已移除）
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await getProvidersStats({ window: window_ });
    if (res.error) return;
    const data =
      (res.data as { data?: ProviderStatsItem[] })?.data ?? (res.data as ProviderStatsItem[]);
    if (Array.isArray(data)) setStats(data);
  }, [window_]);

  const fetchBilling = useCallback(async () => {
    const res = await getProvidersBilling();
    if (res.error) return;
    const data =
      (res.data as { data?: ProviderBillingItem[] })?.data ?? (res.data as ProviderBillingItem[]);
    if (Array.isArray(data)) setBilling(data);
  }, []);

  // 账单页已移除

  const fetchCosts = useCallback(async () => {
    const res = await getProvidersCosts({ window: window_, groupBy: 'provider' });
    if (res.error) return;
    const raw = res.data as
      | { data?: ProviderCostByProvider[] }
      | ProviderCostByProvider[]
      | undefined;
    const data = Array.isArray(raw) ? raw : raw?.data;
    if (Array.isArray(data)) {
      // 仅保留按 provider 聚合的数据
      setCosts(
        data.filter(
          (item): item is ProviderCostByProvider =>
            !!item &&
            typeof (item as ProviderCostByProvider).provider === 'string' &&
            !('model_key' in (item as unknown as Record<string, unknown>))
        )
      );
    }
  }, [window_]);

  const fetchPricing = useCallback(async () => {
    const providerRes = await getProviderPricing();
    if (!providerRes.error) {
      const data =
        (providerRes.data as { data?: ProviderPricingRow[] })?.data ??
        (providerRes.data as ProviderPricingRow[]);
      if (Array.isArray(data)) setProviderPricing(data);
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    const res = await getProviderKeys({
      provider: keyProviderFilter || undefined,
      service: undefined,
    });
    setKeysLoading(false);
    if (res.error) {
      if (res.status === 401) {
        setError('登录已过期，请重新登录后再访问 Provider Keys');
      } else if (res.status === 403) {
        setError('需要 Admin 权限才能查看 Provider Keys');
      }
      return;
    }
    const data =
      (res.data as { data?: ProviderApiKeyMasked[] })?.data ?? (res.data as ProviderApiKeyMasked[]);
    if (Array.isArray(data)) setKeysList(data);
  }, [keyProviderFilter]);

  const fetchProviderModels = useCallback(async () => {
    setProviderModelsLoading(true);
    const res = await getProviderModels({
      ...providerModelsFilter,
      page: 1,
      pageSize: 9999,
    });
    setProviderModelsLoading(false);
    if (res.error) return;
    const payload = res.data as {
      data?: ProviderModelRow[];
      total?: number;
      page?: number;
      pageSize?: number;
    };
    if (Array.isArray(payload?.data)) setProviderModels(payload.data);
    if (typeof payload?.total === 'number') setProviderModelsTotal(payload.total);
  }, [providerModelsFilter]);

  const fetchKnowledgeEmbDefault = useCallback(async () => {
    const res = await getKnowledgeEmbeddingDefault();
    if (res.error) return;
    const data = (res.data as { data?: KnowledgeEmbeddingDefaultConfig })?.data;
    if (data) setKnowledgeEmbDefault(data);
  }, []);

  const handleSetKnowledgeDefault = async (row: ProviderModelRow) => {
    setKnowledgeDefaultSaving(row.id);
    const res = await putKnowledgeEmbeddingDefault({
      provider: row.provider,
      model: row.model_key,
      enabled: true,
    });
    setKnowledgeDefaultSaving(null);
    if (res.error) {
      message.error(res.error);
      return;
    }
    message.success('已设为平台默认 Embedding');
    fetchKnowledgeEmbDefault();
  };

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchOptions(),
      fetchStats(),
      fetchBilling(),
      fetchCosts(),
      fetchKeys(),
      fetchPricing(),
    ]).finally(() => setLoading(false));
  }, [
    fetchOptions,
    fetchStats,
    fetchBilling,
    fetchCosts,
    fetchKeys,
    fetchPricing,
  ]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    const timer = setTimeout(() => refresh(), 0);
    return () => clearTimeout(timer);
  }, [isLoggedIn, isAdmin, refresh]);

  useEffect(() => {
    if (!isAdmin || !isLoggedIn) return;
    const t = setTimeout(() => fetchProviderModels(), 0);
    return () => clearTimeout(t);
  }, [isAdmin, isLoggedIn, providerModelsFilter, fetchProviderModels]);

  useEffect(() => {
    if (!isAdmin || !isLoggedIn) return;
    const t = setTimeout(() => fetchKnowledgeEmbDefault(), 0);
    return () => clearTimeout(t);
  }, [isAdmin, isLoggedIn, fetchKnowledgeEmbDefault]);

  useEffect(() => {
    if (!isAdmin || !isLoggedIn) return;
    const t = setInterval(fetchStats, 30 * 1000);
    return () => clearInterval(t);
  }, [isAdmin, isLoggedIn, fetchStats]);

  const handleAddKey = async () => {
    const v = await addForm.validateFields().catch(() => null);
    if (!v) return;
    const res = await postProviderKey({
      provider: v.provider,
      service: v.service?.trim() || null,
      key_value: v.key_value.trim(),
      priority: v.priority ?? 0,
      is_active: v.is_active !== false,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddModalOpen(false);
    addForm.resetFields();
    fetchKeys();
  };

  const handleMoveKey = async (id: string, direction: 'up' | 'down') => {
    const sorted = [...keysList].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((k) => k.id === id);
    if (idx < 0) return;
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= sorted.length) return;
    setActionLoading(id);
    const a = sorted[idx];
    const b = sorted[otherIdx];
    await putProviderKey(a.id, { priority: b.priority });
    await putProviderKey(b.id, { priority: a.priority });
    setActionLoading(null);
    fetchKeys();
  };

  const handleKeyActiveChange = async (id: string, next: boolean) => {
    setActionLoading(id);
    const res = await putProviderKey(id, { is_active: next });
    setActionLoading(null);
    if (res.error) {
      message.error(res.error);
      return;
    }
    fetchKeys();
  };

  const handleDeleteKey = async (id: string) => {
    setActionLoading(id);
    const res = await deleteProviderKey(id);
    setActionLoading(null);
    if (!res.error) fetchKeys();
  };

  const openProviderModelModal = async (row?: ProviderModelRow) => {
    setEditingProviderModel(row ?? null);
    setProviderModelTestResult(null);
    if (row) {
      providerModelForm.setFieldsValue({
        provider: row.provider,
        scope: row.scope,
        model_key: row.model_key,
        upstream_model: row.upstream_model,
        protocol: row.protocol ?? (row.scope === 'knowledge' ? 'openai-embeddings' : undefined),
        modality: row.modality,
        display_name: row.display_name,
        description: row.description,
        is_enabled: row.is_enabled,
      });
      // 读取 capabilities 并填充表单字段
      const caps = (row as unknown as Record<string, unknown>).capabilities as Record<string, unknown> | null | undefined;
      providerModelForm.setFieldsValue({
        cap_context_window: caps?.context_window as number | undefined,
        cap_vector_dim: caps?.vector_dim as number | undefined,
        cap_supported_inputs: readSupportedInputs(caps),
        cap_supported_outputs: readSupportedOutputs(caps),
        cap_modes: readProviderModes(caps),
      });
      const pricingRes = await getProviderPricing({ provider: row.provider, scope: row.scope });
      const pricingList =
        (pricingRes.data as { data?: ProviderPricingRow[] })?.data ??
        (pricingRes.data as ProviderPricingRow[]);
      const pricing = Array.isArray(pricingList)
        ? pricingList.find((p) => p.model_key === row.model_key)
        : null;
      if (pricing) {
        providerPricingMetadataRef.current =
          (pricing.metadata as Record<string, unknown> | null | undefined) ?? {};
        const basis = readTokenBasis(providerPricingMetadataRef.current);
        if (pricing.charge_mode === 'token_based') {
          providerModelForm.setFieldsValue({
            charge_mode: pricing.charge_mode,
            unit_price: fromPer1kStored(pricing.unit_price, basis.combined),
            input_unit_price: fromPer1kStored(pricing.input_unit_price ?? undefined, basis.input),
            output_unit_price: fromPer1kStored(pricing.output_unit_price ?? undefined, basis.output),
            input_token_basis: basis.input,
            output_token_basis: basis.output,
            combined_token_basis: basis.combined,
            currency: pricing.currency,
            pricing_id: pricing.id,
            platform_unit_price: pricing.platform_unit_price ?? undefined,
            platform_input_unit_price: pricing.platform_input_unit_price ?? undefined,
            platform_output_unit_price: pricing.platform_output_unit_price ?? undefined,
            platform_min_charge: pricing.platform_min_charge ?? undefined,
          });
        } else {
          providerModelForm.setFieldsValue({
            charge_mode: pricing.charge_mode,
            unit_price: pricing.unit_price,
            input_unit_price: pricing.input_unit_price ?? undefined,
            output_unit_price: pricing.output_unit_price ?? undefined,
            input_token_basis: 'per_1k',
            output_token_basis: 'per_1k',
            combined_token_basis: 'per_1k',
            currency: pricing.currency,
            pricing_id: pricing.id,
            platform_unit_price: pricing.platform_unit_price ?? undefined,
            platform_input_unit_price: pricing.platform_input_unit_price ?? undefined,
            platform_output_unit_price: pricing.platform_output_unit_price ?? undefined,
            platform_min_charge: pricing.platform_min_charge ?? undefined,
          });
        }
      } else {
        providerPricingMetadataRef.current = {};
        providerModelForm.setFieldsValue({
          charge_mode: 'token_based',
          unit_price: 0,
          currency: 'USD',
          pricing_id: undefined,
          input_token_basis: 'per_1k',
          output_token_basis: 'per_1k',
          combined_token_basis: 'per_1k',
        });
      }
    } else {
      providerModelForm.resetFields();
      providerPricingMetadataRef.current = {};
      // 按 scope 给能力字段合理默认（运营可改）
      const scope = providerModelsFilter.scope;
      const defaultInputsByScope: Record<string, string[]> = {
        graph: ['text', 'image'],
        video: ['text', 'image', 'video', 'audio'],
        audio: ['text'],
        music: ['text'],
        text: ['text'],
        writing: ['text'],
        knowledge: ['text'],
      };
      const defaultOutputsByScope: Record<string, string[]> = {
        graph: ['image'],
        video: ['video', 'audio'],
        audio: ['audio'],
        music: ['audio'],
        text: ['text'],
        writing: ['text'],
        knowledge: ['embed'],
      };
      providerModelForm.setFieldsValue({
        is_enabled: true,
        charge_mode: 'token_based',
        currency: 'USD',
        input_token_basis: 'per_1k',
        output_token_basis: 'per_1k',
        combined_token_basis: 'per_1k',
        provider: providerModelsFilter.provider || undefined,
        scope,
        protocol: scope === 'knowledge' ? 'openai-embeddings' : undefined,
        cap_vector_dim: scope === 'knowledge' ? 1536 : undefined,
        cap_supported_inputs: defaultInputsByScope[scope ?? ''] ?? [],
        cap_supported_outputs: defaultOutputsByScope[scope ?? ''] ?? [],
        cap_modes: [],
      });
    }
    setProviderModelModalOpen(true);
  };

  const handleSaveProviderModel = async () => {
    const values = await providerModelForm.validateFields().catch(() => null);
    if (!values) return;

    const chargeModePrecheck = values.charge_mode ?? 'token_based';
    const storedPrecheck = computeStoredTokenPrices(
      values as Record<string, unknown>,
      chargeModePrecheck,
    );
    if (!hasMeaningfulProviderCost(storedPrecheck)) {
      message.error(
        'Provider 成本价为必填：请填写单价，或 Token 计费的输入/输出成本（至少一项 > 0）',
      );
      return;
    }

    setProviderModelSaving(true);
    try {
      // 构建定价记录的 scope 列表：sync_text_writing 时同时为 text + writing 创建
      const buildPricingScopes = (baseScope: string): string[] => {
        if (values.sync_text_writing && (baseScope === 'text' || baseScope === 'writing')) {
          return ['text', 'writing'];
        }
        return [baseScope];
      };

      if (editingProviderModel) {
        const builtCapabilities = buildModelCapabilities(values);
        const modelPayload: Partial<ProviderModelRow> = {
          scope: values.scope!,
          upstream_model: values.upstream_model ?? null,
          protocol: resolveModelProtocol(values),
          modality: deriveModalityByScope(values.scope, values.modality),
          io_schema: values.io_schema ?? null,
          display_name: values.display_name ?? null,
          description: values.description ?? null,
          capabilities: builtCapabilities,
          default_parameters: buildDefaultParameters(values),
          is_enabled: values.is_enabled ?? true,
        };
        const res = await putProviderModel(editingProviderModel.id, modelPayload);
        if (res.error) {
          message.error(res.error);
          return;
        }
        const envelope = res.data as
          | { data?: ProviderModelRow; merged?: boolean; message?: string }
          | undefined;
        if (envelope?.merged && envelope?.message) {
          message.success(envelope.message);
        }
        const scopeChanged = values.scope !== editingProviderModel.scope;
        const merged = envelope?.merged;
        const scopes = buildPricingScopes(values.scope!);
        let pricingErr: string | undefined;
        for (const scope of scopes) {
          const chargeMode = values.charge_mode ?? 'token_based';
          const stored = computeStoredTokenPrices(values as Record<string, unknown>, chargeMode);
          const platform = resolvePlatformPricesForSave(
            chargeMode,
            stored,
            values as Record<string, unknown>
          );
          const pr = await upsertProviderPricing({
            id: scope === values.scope ? (merged || scopeChanged ? undefined : values.pricing_id) : undefined,
            provider: values.provider!,
            scope,
            model_key: values.model_key!,
            charge_mode: chargeMode,
            unit_price: stored.unit_price,
            input_unit_price: stored.input_unit_price,
            output_unit_price: stored.output_unit_price,
            platform_unit_price: platform.platform_unit_price,
            platform_input_unit_price: platform.platform_input_unit_price,
            platform_output_unit_price: platform.platform_output_unit_price,
            platform_min_charge: values.platform_min_charge ?? null,
            currency: values.currency ?? 'USD',
            metadata: {
              ...providerPricingMetadataRef.current,
              ...(chargeMode === 'token_based' ? { token_price_basis: stored.tokenBasisMeta } : {}),
            },
          });
          if (pr.error) pricingErr = pr.error;
        }
        if (pricingErr) {
          message.error(`物理模型已保存，但 Provider 成本写入失败（成本价必填）：${pricingErr}`);
          fetchProviderModels();
          fetchPricing();
          return;
        }
        message.success('已保存物理模型');
        setProviderModelModalOpen(false);
        setEditingProviderModel(null);
        fetchProviderModels();
        fetchOptions();
        fetchPricing();
        if (values.scope === 'knowledge') fetchKnowledgeEmbDefault();
      } else {
        const builtCapabilities = buildModelCapabilities(values);
        const res = await postProviderModel({
          provider: values.provider!,
          scope: values.scope!,
          model_key: values.model_key!,
          upstream_model: values.upstream_model ?? null,
          protocol: resolveModelProtocol(values),
          modality: deriveModalityByScope(values.scope, values.modality),
          io_schema: values.io_schema ?? null,
          display_name: values.display_name ?? null,
          description: values.description ?? null,
          capabilities: builtCapabilities,
          default_parameters: buildDefaultParameters(values),
          is_enabled: values.is_enabled ?? true,
        });
        if (res.error) {
          message.error(res.error);
          return;
        }
        const postBody = res.data as { success?: boolean; error?: string } | undefined;
        if (postBody && 'success' in postBody && postBody.success === false) {
          message.error(postBody.error || '保存物理模型失败');
          return;
        }
        const scopes = buildPricingScopes(values.scope!);
        let pricingErr: string | undefined;
        for (const scope of scopes) {
          const chargeMode = values.charge_mode ?? 'token_based';
          const stored = computeStoredTokenPrices(values as Record<string, unknown>, chargeMode);
          const platform = resolvePlatformPricesForSave(
            chargeMode,
            stored,
            values as Record<string, unknown>
          );
          const pr = await upsertProviderPricing({
            provider: values.provider!,
            scope,
            model_key: values.model_key!,
            charge_mode: chargeMode,
            unit_price: stored.unit_price,
            input_unit_price: stored.input_unit_price,
            output_unit_price: stored.output_unit_price,
            platform_unit_price: platform.platform_unit_price,
            platform_input_unit_price: platform.platform_input_unit_price,
            platform_output_unit_price: platform.platform_output_unit_price,
            platform_min_charge: values.platform_min_charge ?? null,
            currency: values.currency ?? 'USD',
            metadata: {
              ...providerPricingMetadataRef.current,
              ...(chargeMode === 'token_based' ? { token_price_basis: stored.tokenBasisMeta } : {}),
            },
          });
          if (pr.error) pricingErr = pr.error;
        }
        if (pricingErr) {
          message.error(
            `物理模型已写入，但 Provider 成本未保存（成本价必填，业务不可用）：${pricingErr}`,
          );
          fetchProviderModels();
          fetchPricing();
          return;
        }
        message.success('已保存物理模型');
        setProviderModelModalOpen(false);
        setEditingProviderModel(null);
        fetchProviderModels();
        fetchOptions();
        fetchPricing();
        if (values.scope === 'knowledge') fetchKnowledgeEmbDefault();
      }
    } finally {
      setProviderModelSaving(false);
    }
  };

  const handleDisableProviderModel = async (row: ProviderModelRow) => {
    const res = await putProviderModel(row.id, { is_enabled: false });
    if (!res.error) {
      message.success('已停用该物理模型');
      fetchProviderModels();
      fetchOptions();
    } else {
      message.error(res.error || '停用失败');
    }
  };

  const handleEnableProviderModel = async (row: ProviderModelRow) => {
    const res = await putProviderModel(row.id, { is_enabled: true });
    if (!res.error) {
      message.success('已启用该物理模型');
      fetchProviderModels();
      fetchOptions();
    } else {
      message.error(res.error || '启用失败');
    }
  };

  const handleDeleteProviderModel = async (row: ProviderModelRow) => {
    const res = await deleteProviderModel(row.id);
    if (!res.error) {
      message.success('已删除该物理模型及同键的 Provider 成本行');
      fetchProviderModels();
      fetchOptions();
      fetchPricing();
    } else {
      message.error(res.error || '删除失败');
    }
  };

  const openProviderModelTestModal = (row: ProviderModelRow) => {
    setProviderModelTestingRow(row);
    setProviderModelTestResult(null);
    setProviderModelTestHistory([]);
    setProviderModelTestModalOpen(true);
    const now = new Date().toISOString();
    setProviderModelTestSteps([
      { key: 'prepare', title: '构造最小测试请求', status: 'pending', detail: '按模型类型生成最小参数', at: now },
      { key: 'connect', title: '检查 Provider 与模型支持', status: 'pending', at: now },
      { key: 'invoke', title: '发送连通性请求', status: 'pending', at: now },
      { key: 'verify', title: '验证响应结果', status: 'pending', at: now },
      { key: 'done', title: '测试完成', status: 'pending', at: now },
    ]);
    void getProviderModelTests(row.id, { limit: 20 }).then((res) => {
      if (res.error) {
        message.warning('未能读取测试历史（可能尚未执行测试记录表迁移）');
        return;
      }
      const raw = res.data as { data?: ProviderModelTestRunRow[] } | ProviderModelTestRunRow[] | undefined;
      const data = Array.isArray(raw) ? raw : raw?.data;
      if (Array.isArray(data)) setProviderModelTestHistory(data);
    });
  };

  const runProviderModelTest = async () => {
    const row = providerModelTestingRow;
    if (!row) return;
    setProviderModelTestLoading(row.id);
    setProviderModelTestResult(null);
    setProviderModelTestSteps((prev) =>
      prev.map((s) =>
        s.key === 'prepare'
          ? { ...s, status: 'running' }
          : { ...s, status: 'pending', detail: s.key === 'prepare' ? s.detail : undefined }
      )
    );
    try {
      setProviderModelTestSteps((prev) =>
        prev.map((s) =>
          s.key === 'prepare'
            ? { ...s, status: 'success' }
            : s.key === 'connect'
              ? { ...s, status: 'running' }
              : s
        )
      );
      const res = await testProviderModel({ provider_model_id: row.id });
      const payload = (res.data as { data?: ProviderModelTestResult })?.data;
      if (res.error) {
        message.error(res.error);
        setProviderModelTestResult({
          success: false,
          latencyMs: 0,
          error: res.error,
          provider: row.provider,
          model_key: row.model_key,
          scope: row.scope,
          modality: row.modality,
          steps: [],
        });
        setProviderModelTestSteps((prev) =>
          prev.map((s) =>
            s.key === 'connect' || s.key === 'invoke' || s.key === 'verify' || s.key === 'done'
              ? { ...s, status: s.key === 'done' ? 'failed' : 'failed', detail: res.error }
              : s
          )
        );
      } else if (payload) {
        setProviderModelTestResult(payload);
        if (Array.isArray(payload.steps) && payload.steps.length > 0) {
          setProviderModelTestSteps(payload.steps);
        }
        if (payload.success) {
          message.success(`连通性测试成功 · 延迟 ${payload.latencyMs} ms`);
        } else {
          message.warning(`测试失败: ${payload.error || '未知错误'}`);
        }
        // 先做一次乐观更新：即使 DB 没落表/读不到，也能立刻在列表看到最近状态
        const optimisticCreatedAt = new Date().toISOString();
        setProviderModels((prev) =>
          prev.map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  latest_test: {
                    success: !!payload.success,
                    latency_ms: payload.latencyMs,
                    error_message: payload.error ?? null,
                    created_at: optimisticCreatedAt,
                  },
                }
              : m
          )
        );

        void getProviderModelTests(row.id, { limit: 20 }).then((r) => {
          if (r.error) {
            // DB 读不到时，将本次结果塞入历史列表
            setProviderModelTestHistory((prev) => {
              const run: ProviderModelTestRunRow = {
                id: `optimistic-${Date.now()}`,
                provider_model_id: row.id,
                provider: row.provider,
                scope: row.scope,
                model_key: row.model_key,
                inferred_modality: String(payload.modality ?? payload.scope ?? ''),
                success: !!payload.success,
                latency_ms: payload.latencyMs,
                error_message: payload.error ?? null,
                created_at: optimisticCreatedAt,
                request_payload: payload.requestPayload ?? null,
                response_meta: payload.responseMeta ?? null,
                steps: payload.steps,
              };
              return [run, ...prev].slice(0, 20);
            });
            message.info('已在前端显示本次测试结果；如需持久化历史记录，请先执行测试记录表迁移');
            return;
          }
          const raw = r.data as { data?: ProviderModelTestRunRow[] } | ProviderModelTestRunRow[] | undefined;
          const data = Array.isArray(raw) ? raw : raw?.data;
          if (Array.isArray(data)) setProviderModelTestHistory(data);
        });

        fetchProviderModels();
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      message.error(err);
      setProviderModelTestResult({
        success: false,
        latencyMs: 0,
        error: err,
        provider: row.provider,
        model_key: row.model_key,
        scope: row.scope,
        modality: row.modality,
        steps: [],
      });
      setProviderModelTestSteps((prev) =>
        prev.map((s) =>
          s.key === 'done'
            ? { ...s, status: 'failed', detail: err }
            : s.status === 'running' || s.status === 'pending'
              ? { ...s, status: 'failed', detail: err }
              : s
        )
      );
    } finally {
      setProviderModelTestLoading(null);
    }
  };

  const openBalanceModal = (b: ProviderBillingItem) => {
    setBalanceModalProvider(b.provider);
    setBalanceModalValue(typeof b.manualBalance === 'number' ? b.manualBalance : 0);
    setBalanceModalCurrency(b.currency ?? 'USD');
    setBalanceModalOpen(true);
  };

  const handleSaveBalance = async () => {
    if (!balanceModalProvider) return;
    const res = await putProviderBalance({
      provider: balanceModalProvider,
      balance: balanceModalValue,
      currency: balanceModalCurrency,
    });
    if (!res.error) {
      setBalanceModalOpen(false);
      setBalanceModalProvider(null);
      fetchBilling();
    }
  };

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>模型通道管理</h2>
        <p>仅 Admin 可查看与配置。请使用管理员账号登录。</p>
      </div>
    );
  }

  // const routingData: RoutingRow[] = Object.entries(routing)
  //   .map(([key, entry]) => ({
  //     key,
  //     logicalModel: key,
  //     provider: entry.provider + (entry.overridden ? ' (已覆盖)' : ''),
  //     model: entry.model,
  //     overridden: entry.overridden,
  //     rawProvider: entry.provider,
  //     category: getRoutingRowCategory(key),
  //   }))
  //   .sort((a, b) => {
  //     const orderA = routingSortOrder(a.logicalModel);
  //     const orderB = routingSortOrder(b.logicalModel);
  //     if (orderA !== orderB) return orderA - orderB;
  //     return a.logicalModel.localeCompare(b.logicalModel);
  //   });

  // const openEdit = (row: RoutingRow) => {
  //   setEditingRow(row);
  //   editForm.setFieldsValue({ provider: row.rawProvider, model: row.model });
  //   setEditModalOpen(true);
  // };

  // const closeEdit = () => {
  //   setEditModalOpen(false);
  //   setEditingRow(null);
  //   editForm.resetFields();
  // };

  // const handleEditSave = async () => {
  //   const v = await editForm.validateFields().catch(() => null);
  //   if (!v || !editingRow) return;
  //   setEditSaving(true);
  //   const res = await postProvidersRouting({
  //     logicalModel: editingRow.logicalModel,
  //     provider: v.provider,
  //     model: v.model,
  //   });
  //   setEditSaving(false);
  //   if (res.error) {
  //     setError(res.error);
  //     return;
  //   }
  //   closeEdit();
  //   fetchRouting();
  // };

  // const handleResetRouting = async (logicalModel: string) => {
  //   const res = await deleteProvidersRouting(logicalModel);
  //   if (!res.error) fetchRouting();
  // };

  // const routingColumns: ColumnsType<RoutingRow> = [
  //   { title: '逻辑模型', dataIndex: 'logicalModel', key: 'logicalModel', width: 220 },
  //   { title: '说明', dataIndex: 'category', key: 'category', width: 160, render: (c: string) => c || '—' },
  //   { title: 'Provider', dataIndex: 'provider', key: 'provider', width: 160 },
  //   { title: '物理模型', dataIndex: 'model', key: 'model', width: 180 },
  //   {
  //     title: '操作',
  //     key: 'actions',
  //     width: 160,
  //     render: (_, row) => (
  //       <Space size="small">
  //         <Button type="link" size="small" onClick={() => openEdit(row)}>
  //           编辑
  //         </Button>
  //         {row.overridden && (
  //           <Popconfirm
  //             title="恢复为该业务的默认 provider/模型？"
  //             onConfirm={() => handleResetRouting(row.logicalModel)}
  //           >
  //             <Button type="link" size="small">恢复默认</Button>
  //           </Popconfirm>
  //         )}
  //       </Space>
  //     ),
  //   },
  // ];

  return (
    <div className="page-card admin-providers-page">
      {error && (
        <div className="admin-providers-error" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div className="admin-providers-content-wrap">
        <div className="admin-providers-content-inner">
          <Tabs
            defaultActiveKey="status"
            items={[
              {
                key: 'status',
                label: '通道状态与统计',
                children: (
                  <div className="admin-ux-tasktemplate">
                    <div className="admin-business-toolbar admin-console-tab-toolbar">
                      <Space size={10} wrap>
                        <Select
                          value={window_}
                          onChange={setWindow}
                          options={WINDOW_OPTIONS}
                          style={{ width: 190, maxWidth: '100%' }}
                        />
                        <Button size="small" onClick={refresh} loading={loading}>
                          刷新
                        </Button>
                      </Space>
                    </div>

                    <div className="admin-business-panel admin-business-tableOnly">
                      <div className="admin-business-panel-head">
                        <div>
                          <div className="admin-business-panel-title">通道状态与统计</div>
                          <div className="admin-business-panel-subtitle">
                            按 Provider 汇总请求量、延迟与预计成本
                          </div>
                        </div>
                        <div className="admin-business-panel-meta">
                          <Typography.Text type="secondary">
                            共 {stats.length} 个 Provider
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="admin-business-panel-body" style={{ padding: 14 }}>
                        <div className="provider-billing-grid">
                          {stats.map((s) => {
                            const cost = costs.find((c) => c.provider === s.provider);
                            const successRate = Math.max(0, Math.min(1, 1 - (s.errorRate ?? 0)));
                            const successText = `${(100 * successRate).toFixed(1)}%`;
                            return (
                              <div key={s.provider} className="provider-billing-card">
                                <div className="provider-billing-card__head">
                                  <div className="provider-billing-card__title">{s.provider}</div>
                                  <div className="provider-billing-card__badge">
                                    window {s.window}
                                  </div>
                                </div>
                                <div className="provider-billing-card__body">
                                  <div className="provider-billing-kv">
                                    <span className="k">请求</span>
                                    <span className="v">{s.requestCount.toLocaleString()}</span>
                                  </div>
                                  <div className="provider-billing-kv">
                                    <span className="k">成功率</span>
                                    <span className="v">{successText}</span>
                                  </div>
                                  <div className="provider-billing-kv">
                                    <span className="k">平均延迟</span>
                                    <span className="v">{s.avgLatencyMs.toFixed(0)} ms</span>
                                  </div>
                                  {s.p50LatencyMs != null && (
                                    <div className="provider-billing-kv">
                                      <span className="k">P50</span>
                                      <span className="v">{s.p50LatencyMs.toFixed(0)} ms</span>
                                    </div>
                                  )}
                                  {cost && (
                                    <div className="provider-billing-balance">
                                      <div className="provider-billing-balance__label">
                                        预计成本（USD）
                                      </div>
                                      <div className="provider-billing-balance__value">
                                        {cost.estimatedCost.toFixed(4)}
                                      </div>
                                      <div className="provider-billing-balance__hint">
                                        Tokens: {cost.totalTokens.toLocaleString()}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {stats.length === 0 && !loading && (
                            <div className="provider-billing-empty">暂无统计数据</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'billing',
                label: '余额/用量',
                children: (
                  <div className="admin-ux-tasktemplate">
                    <div className="admin-business-toolbar admin-console-tab-toolbar">
                      <Space size={10} wrap>
                        <Typography.Text type="secondary" className="admin-toolbar-hint">
                          手动余额按 provider_pricing 计费后自动扣减
                        </Typography.Text>
                        <Button size="small" onClick={refresh} loading={loading}>
                          刷新
                        </Button>
                      </Space>
                    </div>

                    <div className="admin-business-panel admin-business-tableOnly">
                      <div className="admin-business-panel-head">
                        <div>
                          <div className="admin-business-panel-title">余额 / 用量</div>
                          <div className="admin-business-panel-subtitle">
                            统一查看官方额度、用量与手动余额
                          </div>
                        </div>
                        <div className="admin-business-panel-meta">
                          <Typography.Text type="secondary">
                            共 {billing.length} 个 Provider
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="admin-business-panel-body" style={{ padding: 14 }}>
                        <div className="provider-billing-grid">
                          {billing.map((b) => (
                            <div key={b.provider} className="provider-billing-card">
                              <div className="provider-billing-card__head">
                                <div className="provider-billing-card__title">{b.provider}</div>
                                <div className="provider-billing-card__badge">
                                  {b.billingMode === 'subscription'
                                    ? 'OAuth 包月'
                                    : b.supported
                                      ? '官方'
                                      : '手动'}
                                </div>
                              </div>
                              <div className="provider-billing-card__body">
                                {b.billingMode === 'subscription' ? (
                                  <div className="provider-billing-balance">
                                    <div className="provider-billing-balance__label">
                                      {b.billingNote ?? 'OAuth 包月'}
                                    </div>
                                    <div className="provider-billing-balance__value">
                                      不适用
                                    </div>
                                  </div>
                                ) : b.supported ? (
                                  <>
                                    <div className="provider-billing-kv">
                                      <span className="k">已用</span>
                                      <span className="v">{b.used ?? '—'}</span>
                                    </div>
                                    <div className="provider-billing-kv">
                                      <span className="k">总额</span>
                                      <span className="v">{b.totalLimit ?? '—'}</span>
                                    </div>
                                    {b.resetAt && (
                                      <div className="provider-billing-kv">
                                        <span className="k">重置</span>
                                        <span className="v">{b.resetAt}</span>
                                      </div>
                                    )}
                                    <div className="provider-billing-balance">
                                      <div className="provider-billing-balance__label">
                                        手动余额
                                      </div>
                                      <div className="provider-billing-balance__value">
                                        {b.manualBalance !== undefined
                                          ? `${b.manualBalance} ${b.currency ?? 'USD'}`
                                          : '—'}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="provider-billing-balance">
                                    <div className="provider-billing-balance__label">余额</div>
                                    <div className="provider-billing-balance__value">
                                      {b.manualBalance !== undefined
                                        ? `${b.manualBalance} ${b.currency ?? 'USD'}`
                                        : '—'}
                                    </div>
                                    <div className="provider-billing-balance__hint">
                                      {b.manualBalance !== undefined
                                        ? '按 provider_pricing 计费扣减'
                                        : '无官方余额，可手动录入'}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="provider-billing-card__foot">
                                {b.billingMode !== 'subscription' && (
                                  <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => openBalanceModal(b)}
                                  >
                                    <span className="ui-label--full">
                                      {b.manualBalance !== undefined ? '编辑余额' : '录入余额'}
                                    </span>
                                    <span className="ui-label--short">
                                      {b.manualBalance !== undefined ? '编辑' : '录入'}
                                    </span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          {billing.length === 0 && !loading && (
                            <div className="provider-billing-empty">暂无</div>
                          )}
                        </div>
                      </div>

                      <Modal
                        title={
                          balanceModalProvider ? `设置 ${balanceModalProvider} 余额` : '设置余额'
                        }
                        open={balanceModalOpen}
                        onOk={handleSaveBalance}
                        onCancel={() => {
                          setBalanceModalOpen(false);
                          setBalanceModalProvider(null);
                        }}
                        okText="保存"
                        cancelText="取消"
                      >
                        <div style={{ marginTop: 16 }}>
                          <div style={{ marginBottom: 8 }}>币种</div>
                          <Select
                            style={{ width: '100%', marginBottom: 16 }}
                            value={balanceModalCurrency}
                            options={CURRENCY_OPTIONS}
                            onChange={(v) => setBalanceModalCurrency(v ?? 'USD')}
                          />
                          <div style={{ marginBottom: 8 }}>
                            余额（{balanceModalCurrency}）
                          </div>
                          <InputNumber
                            min={0}
                            step={balanceModalCurrency === 'CNY' ? 0.01 : 0.0001}
                            style={{ width: '100%' }}
                            value={balanceModalValue}
                            onChange={(v) => setBalanceModalValue(v ?? 0)}
                            placeholder="请输入余额"
                          />
                          <div
                            style={{
                              fontSize: 12,
                              color: 'rgba(148, 163, 184, 0.70)',
                              marginTop: 8,
                            }}
                          >
                            扣费金额与「模型价格」中该 Provider 的币种一致；请保持币种与定价配置相同
                          </div>
                        </div>
                      </Modal>
                    </div>
                  </div>
                ),
              },
              // v2：业务模型路由配置应由「业务管理（TaskTemplate）」统一承载；
              // 如需临时启用该入口，可恢复此 Tab。
              // {
              //   key: 'routing',
              //   label: '业务模型管理',
              //   children: (
              //     <Card size="small" title="业务模型管理">
              //       <Table<RoutingRow>
              //         columns={routingColumns}
              //         dataSource={routingData}
              //         rowKey="key"
              //         loading={loading}
              //         size="small"
              //         pagination={false}
              //         locale={{ emptyText: '暂无路由数据' }}
              //       />
              //     </Card>
              //   ),
              // },
              {
                key: 'keys',
                label: 'API Key 管理',
                children: (
                  <div className="admin-ux-tasktemplate">
                    <div className="admin-business-toolbar admin-console-tab-toolbar">
                      <Space size={10} wrap>
                        <Select
                          value={keyProviderFilter}
                          onChange={setKeyProviderFilter}
                          options={KEY_PROVIDER_OPTIONS}
                          style={{ width: 190, maxWidth: '100%' }}
                          placeholder="Provider"
                        />
                        <Input
                          value={keySearch}
                          onChange={(e) => setKeySearch(e.target.value)}
                          placeholder="搜索 provider / service / key…"
                          style={{ width: 300, maxWidth: '100%' }}
                          allowClear
                        />
                        <Button size="small" onClick={() => fetchKeys()} loading={keysLoading}>
                          刷新
                        </Button>
                        <Button type="primary" size="small" onClick={() => setAddModalOpen(true)}>
                          <span className="ui-label--full">新增 Key</span>
                          <span className="ui-label--short">新增</span>
                        </Button>
                      </Space>
                    </div>

                    <div className="admin-business-panel admin-business-tableOnly">
                      <div className="admin-business-panel-head">
                        <div>
                          <div className="admin-business-panel-title">API Key 列表</div>
                          <div className="admin-business-panel-subtitle">
                            按 provider/service 管理与优先级排序
                          </div>
                        </div>
                        <div className="admin-business-panel-meta">
                          <Typography.Text type="secondary">
                            共 {visibleKeysList.length} 条
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="admin-business-panel-body admin-business-table-wrap">
                        <Table<ProviderApiKeyMasked>
                          dataSource={visibleKeysList}
                          rowKey="id"
                          loading={keysLoading}
                          size="small"
                          tableLayout="fixed"
                          pagination={{ pageSize: 20, showSizeChanger: false }}
                          scroll={{ x: 'max-content', y: 'calc(80vh - 240px)' }}
                          columns={[
                            {
                              title: '启用',
                              dataIndex: 'is_active',
                              key: 'is_active',
                              width: 88,
                              render: (v: boolean, r) => (
                                <Switch
                                  size="small"
                                  checked={!!v}
                                  loading={actionLoading === r.id}
                                  disabled={actionLoading !== null && actionLoading !== r.id}
                                  onChange={(checked) => void handleKeyActiveChange(r.id, checked)}
                                />
                              ),
                            },
                            {
                              title: 'Provider',
                              dataIndex: 'provider',
                              key: 'provider',
                              width: 120,
                            },
                            {
                              title: 'Service',
                              dataIndex: 'service',
                              key: 'service',
                              width: 140,
                              render: (v: string | null) => v ?? '—',
                            },
                            {
                              title: 'Key',
                              dataIndex: 'key_masked',
                              key: 'key_masked',
                              width: 200,
                              ellipsis: true,
                            },
                            {
                              title: 'Priority',
                              dataIndex: 'priority',
                              key: 'priority',
                              width: 90,
                            },
                            {
                              title: '操作',
                              key: 'actions',
                              width: 220,
                              render: (_, r) => {
                                const idx = visibleKeysList.findIndex(
                                  (k: ProviderApiKeyMasked) => k.id === r.id
                                );
                                const loadingRow = actionLoading === r.id;
                                const upDisabled = idx <= 0 || loadingRow;
                                const downDisabled =
                                  idx >= visibleKeysList.length - 1 || idx < 0 || loadingRow;
                                return (
                                  <span className="actions-cell">
                                    <button
                                      type="button"
                                      className={
                                        'act-btn act-btn--neutral' +
                                        (upDisabled ? ' act-btn--muted' : '')
                                      }
                                      disabled={upDisabled}
                                      onClick={() => handleMoveKey(r.id, 'up')}
                                    >
                                      上移
                                    </button>
                                    <button
                                      type="button"
                                      className={
                                        'act-btn act-btn--neutral' +
                                        (downDisabled ? ' act-btn--muted' : '')
                                      }
                                      disabled={downDisabled}
                                      onClick={() => handleMoveKey(r.id, 'down')}
                                    >
                                      下移
                                    </button>
                                    <Popconfirm
                                      title="确定删除此 Key？"
                                      onConfirm={() => handleDeleteKey(r.id)}
                                    >
                                      <button
                                        type="button"
                                        className={
                                          'act-btn act-btn--danger' +
                                          (actionLoading ? ' act-btn--muted' : '')
                                        }
                                        disabled={!!actionLoading}
                                      >
                                        删除
                                      </button>
                                    </Popconfirm>
                                  </span>
                                );
                              },
                            },
                          ]}
                          locale={{ emptyText: '暂无 Key，可点击「新增 Key」添加' }}
                        />
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'models',
                label: '物理模型目录',
                children: (
                  <div className="admin-ux-tasktemplate">
                    <div className="admin-business-panel admin-business-tableOnly provider-models-panel">
                      <div className="provider-models-panel-head">
                        <div className="provider-models-panel-intro">
                          <div className="admin-business-panel-title">物理模型目录</div>
                          <div className="admin-business-panel-subtitle">
                            统一维护 provider_models；Embedding 选 scope=knowledge 后点「新增模型」录入，表格行可「设为默认」
                          </div>
                        </div>
                        <div className="provider-models-panel-actions">
                          <Typography.Text type="secondary" className="provider-models-count">
                            共 {providerModelsTotal} 条
                          </Typography.Text>
                          <Button
                            size="small"
                            onClick={fetchProviderModels}
                            loading={providerModelsLoading}
                          >
                            刷新
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => openProviderModelModal()}
                          >
                            <span className="ui-label--full">新增模型</span>
                            <span className="ui-label--short">新增</span>
                          </Button>
                        </div>
                      </div>

                      <div className="provider-models-filter-bar">
                        <div className="provider-models-filter-field">
                          <span className="provider-models-filter-label">Provider</span>
                          <Select
                            value={providerModelsFilter.provider ?? ''}
                            onChange={(v) => {
                              setProviderModelsFilter((f) => ({ ...f, provider: v || undefined }));
                            }}
                            options={[
                              { value: '', label: '全部' },
                              ...KEY_PROVIDER_OPTIONS.filter((o) => o.value),
                            ]}
                            className="provider-models-filter-control"
                          />
                        </div>
                        <div className="provider-models-filter-field">
                          <span className="provider-models-filter-label">Scope</span>
                          <Select
                            value={providerModelsFilter.scope ?? ''}
                            onChange={(v) => {
                              setProviderModelsFilter((f) => ({ ...f, scope: v || undefined }));
                            }}
                            options={[{ value: '', label: '全部' }, ...SCOPE_OPTIONS]}
                            className="provider-models-filter-control"
                          />
                        </div>
                        <div className="provider-models-filter-field">
                          <span className="provider-models-filter-label">状态</span>
                          <Select
                            value={providerModelsFilter.onlyEnabled ? '1' : '0'}
                            onChange={(v) => {
                              setProviderModelsFilter((f) => ({ ...f, onlyEnabled: v === '1' }));
                            }}
                            options={[
                              { value: '0', label: '全部' },
                              { value: '1', label: '仅启用' },
                            ]}
                            className="provider-models-filter-control provider-models-filter-control--sm"
                          />
                        </div>
                      </div>

                      <div className="admin-business-panel-body admin-business-table-wrap provider-models-table-wrap">
                        <Table<ProviderModelRow>
                          rowKey="id"
                          size="small"
                          loading={providerModelsLoading}
                          dataSource={providerModels}
                          tableLayout="fixed"
                          scroll={{ x: 'max-content', y: 'calc(80vh - 320px)' }}
                          pagination={{ pageSize: 10, showSizeChanger: false }}
                          columns={[
                            {
                              title: '显示名',
                              dataIndex: 'display_name',
                              key: 'display_name',
                              width: 150,
                              ellipsis: true,
                              render: (v, row) => {
                                const label = v ?? row.model_key ?? '—';
                                const isDefault = isKnowledgeDefaultModel(row, knowledgeEmbDefault);
                                return (
                                  <Space size={4}>
                                    <span>{label}</span>
                                    {isDefault ? (
                                      <Tag color="blue" bordered={false} className="m-0">
                                        平台默认
                                      </Tag>
                                    ) : null}
                                  </Space>
                                );
                              },
                            },
                            {
                              title: 'model_key',
                              dataIndex: 'model_key',
                              key: 'model_key',
                              width: 140,
                              ellipsis: true,
                            },
                            {
                              title: 'upstream',
                              dataIndex: 'upstream_model',
                              key: 'upstream_model',
                              width: 180,
                              ellipsis: true,
                              render: (v) => v ?? '—',
                            },
                            {
                              title: 'Provider',
                              dataIndex: 'provider',
                              key: 'provider',
                              width: 96,
                            },
                            { title: 'Scope', dataIndex: 'scope', key: 'scope', width: 96 },
                            {
                              title: 'Provider 成本',
                              key: 'provider_cost',
                              width: 200,
                              align: 'right',
                              className: 'provider-cost-cell',
                              render: (_, row) => {
                                const p = providerPricing.find(
                                  (x) =>
                                    x.provider === row.provider &&
                                    x.scope === row.scope &&
                                    x.model_key === row.model_key
                                );
                                if (!p) return '—';
                                const cur = p.currency || 'USD';
                                if (p.input_unit_price != null && p.output_unit_price != null) {
                                  return `in:${p.input_unit_price} / out:${p.output_unit_price} ${cur}`;
                                }
                                if (p.unit_price != null && p.unit_price > 0)
                                  return `${p.unit_price} ${cur}`;
                                return '0';
                              },
                            },
                            {
                              title: 'MXM-TOKEN',
                              key: 'platform_price',
                              width: 140,
                              align: 'right',
                              render: (_, row) => {
                                const p = providerPricing.find(
                                  (x) =>
                                    x.provider === row.provider &&
                                    x.scope === row.scope &&
                                    x.model_key === row.model_key
                                );
                                if (!p) return <span style={{ color: '#ef4444' }}>未配置</span>;
                                const pin = p.platform_input_unit_price;
                                const pout = p.platform_output_unit_price;
                                const unit = Number(p.platform_unit_price || 0);
                                if (pin != null && pout != null && (Number(pin) > 0 || Number(pout) > 0)) {
                                  return `in:${pin} / out:${pout}`;
                                }
                                if (unit > 0) return String(unit);
                                return <span style={{ color: '#ef4444' }}>未配置</span>;
                              },
                            },
                            {
                              title: '最近测试',
                              key: 'latest_test',
                              width: 150,
                              render: (_, row) => {
                                const t = row.latest_test;
                                if (!t) return <Typography.Text type="secondary">—</Typography.Text>;
                                return (
                                  <div style={{ lineHeight: 1.1 }}>
                                    <Typography.Text type={t.success ? 'success' : 'danger'}>
                                      {t.success ? '通过' : '失败'}
                                    </Typography.Text>
                                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                                      {new Date(t.created_at).toLocaleString()}
                                    </div>
                                  </div>
                                );
                              },
                            },
                            {
                              title: '操作',
                              key: 'actions',
                              width: 360,
                              render: (_, row) => (
                                <span className="actions-cell">
                                  {row.scope === 'knowledge' &&
                                  !isKnowledgeDefaultModel(row, knowledgeEmbDefault) ? (
                                    <button
                                      type="button"
                                      className="act-btn act-btn--neutral"
                                      disabled={knowledgeDefaultSaving === row.id}
                                      onClick={() => void handleSetKnowledgeDefault(row)}
                                    >
                                      {knowledgeDefaultSaving === row.id ? '…' : '设为默认'}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="act-btn act-btn--neutral"
                                    onClick={() => openProviderModelModal(row)}
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    className="act-btn act-btn--neutral"
                                    disabled={providerModelTestLoading === row.id}
                                    onClick={() => openProviderModelTestModal(row)}
                                  >
                                    {providerModelTestLoading === row.id ? '测试中…' : '测试'}
                                  </button>
                                  {row.is_enabled ? (
                                    <Popconfirm
                                      title="停用后仍保留记录，可在编辑中重新启用；确定停用？"
                                      onConfirm={() => handleDisableProviderModel(row)}
                                    >
                                      <button type="button" className="act-btn act-btn--danger">
                                        停用
                                      </button>
                                    </Popconfirm>
                                  ) : (
                                    <button
                                      type="button"
                                      className="act-btn act-btn--success"
                                      onClick={() => handleEnableProviderModel(row)}
                                    >
                                      启用
                                    </button>
                                  )}
                                  <Popconfirm
                                    title="将永久删除该物理模型及同 provider+scope+model_key 的 Provider 成本，不可恢复。确定删除？"
                                    onConfirm={() => handleDeleteProviderModel(row)}
                                  >
                                    <button type="button" className="act-btn act-btn--danger">
                                      删除
                                    </button>
                                  </Popconfirm>
                                </span>
                              ),
                            },
                          ]}
                          locale={{ emptyText: '暂无物理模型，可点击「新增模型」添加' }}
                        />
                      </div>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      <Modal
        title="新增 API Key"
        open={addModalOpen}
        onOk={handleAddKey}
        onCancel={() => {
          setAddModalOpen(false);
          addForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" initialValues={{ priority: 0, is_active: true }}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select
              options={KEY_PROVIDER_OPTIONS.filter((o) => o.value)}
              placeholder="选择 Provider"
            />
          </Form.Item>
          <Form.Item
            name="service"
            label="Service（可选）"
            extra="Deer 等多通道时填写子服务名。replicate / ppio 请留空；若填写非空，旧版服务端可能无法命中（已在新版兜底）。"
          >
            <Input placeholder="如 openai, minimax；replicate 请留空" />
          </Form.Item>
          <Form.Item name="is_active" label="创建后启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="key_value" label="Key 值" rules={[{ required: true }]}>
            <Input.Password placeholder="API Key 明文" autoComplete="off" />
          </Form.Item>
          <Form.Item name="priority" label="Priority（数字越小越优先）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          providerModelTestingRow
            ? `连通性测试 · ${providerModelTestingRow.model_key}`
            : '连通性测试'
        }
        open={providerModelTestModalOpen}
        footer={[
          <Button
            key="start"
            type="primary"
            loading={!!providerModelTestLoading}
            onClick={() => runProviderModelTest()}
            disabled={!providerModelTestingRow}
          >
            开始测试
          </Button>,
          <Button
            key="close"
            onClick={() => {
              if (providerModelTestLoading) return;
              setProviderModelTestModalOpen(false);
            }}
          >
            关闭
          </Button>,
        ]}
        onCancel={() => {
          if (providerModelTestLoading) return;
          setProviderModelTestModalOpen(false);
        }}
        width={700}
        destroyOnHidden={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {providerModelTestingRow && (
            <div className="muted" style={{ fontSize: 12 }}>
              Provider: {providerModelTestingRow.provider} · Scope: {providerModelTestingRow.scope} ·
              DB Modality: {providerModelTestingRow.modality ?? '—'}
              {providerModelTestResult?.modality != null ? (
                <> · 推断（本次测试）: {providerModelTestResult.modality}</>
              ) : null}
            </div>
          )}
          {providerModelTestHistory.length > 0 ? (
            <div>
              <Alert
                type="info"
                showIcon
                title="最近测试记录"
                description={
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <div>
                      最近一次：{new Date(providerModelTestHistory[0].created_at).toLocaleString()} ·{' '}
                      {providerModelTestHistory[0].success ? '通过' : '失败'}
                    </div>
                    {(() => {
                      const lastPass = providerModelTestHistory.find((x) => x.success);
                      return lastPass ? (
                        <div>最近一次通过：{new Date(lastPass.created_at).toLocaleString()}</div>
                      ) : (
                        <div>最近一次通过：—</div>
                      );
                    })()}
                  </div>
                }
              />
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'history',
                    label: `历史记录（${providerModelTestHistory.length}）`,
                    children: (
                      <div style={{ maxHeight: 220, overflow: 'auto' }}>
                        {providerModelTestHistory.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              gap: 10,
                              justifyContent: 'space-between',
                              padding: '6px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              fontSize: 12,
                            }}
                          >
                            <div>
                              <Typography.Text type={r.success ? 'success' : 'danger'}>
                                {r.success ? '通过' : '失败'}
                              </Typography.Text>
                              <Typography.Text type="secondary">
                                {r.latency_ms != null ? ` · ${r.latency_ms}ms` : ''}
                              </Typography.Text>
                            </div>
                            <div style={{ opacity: 0.75 }}>{new Date(r.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ) : null}
          <Steps
            direction="vertical"
            size="small"
            items={providerModelTestSteps.map((s) => ({
              title: s.title,
              description: s.detail ? `${s.detail}` : undefined,
              status:
                s.status === 'success'
                  ? 'finish'
                  : s.status === 'running'
                    ? 'process'
                    : s.status === 'failed'
                      ? 'error'
                      : 'wait',
            }))}
          />
          {providerModelTestResult && (
            <Alert
              type={providerModelTestResult.success ? 'success' : 'error'}
              showIcon
              title={
                providerModelTestResult.success
                  ? `测试成功 · 延迟 ${providerModelTestResult.latencyMs}ms`
                  : `测试失败${providerModelTestResult.error ? `：${providerModelTestResult.error}` : ''}`
              }
              description={
                <div style={{ fontSize: 12 }}>
                  <div>
                    目标：{providerModelTestResult.provider} / {providerModelTestResult.model_key} /{' '}
                    {providerModelTestResult.modality ?? providerModelTestResult.scope}
                  </div>
                  {providerModelTestResult.requestPayload && (
                    <div style={{ marginTop: 6 }}>
                      最小请求：prompt="{providerModelTestResult.requestPayload.prompt}"
                    </div>
                  )}
                </div>
              }
            />
          )}
        </div>
      </Modal>

      <Modal
        title={editingProviderModel ? '编辑物理模型' : '新增物理模型'}
        open={providerModelModalOpen}
        onOk={handleSaveProviderModel}
        confirmLoading={providerModelSaving}
        onCancel={() => {
          setProviderModelModalOpen(false);
          setEditingProviderModel(null);
          setProviderModelTestResult(null);
        }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={560}
      >
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'hsl(var(--muted))',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          💡 Provider 成本（USD）上架必填（unit / 输入 / 输出至少一项 {'>'} 0）。MXM-TOKEN（platform_*）
          默认按成本自动计算：成本USD × 100 × 2.5（锚定 1 TOKEN≈$0.01）；可改。未手填时保存/后端也会回填。业务页只绑定模型，不再单独设价。
        </div>
        <Form
          form={providerModelForm}
          layout="vertical"
          initialValues={{
            is_enabled: true,
            charge_mode: 'token_based',
            currency: 'USD',
            input_token_basis: 'per_1k',
            output_token_basis: 'per_1k',
            combined_token_basis: 'per_1k',
          }}
        >
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select
              options={PROVIDER_OPTIONS}
              placeholder="选择 Provider"
              disabled={!!editingProviderModel}
            />
          </Form.Item>
          <Form.Item name="scope" label="Scope" rules={[{ required: true }]}>
            <Select options={SCOPE_OPTIONS} placeholder="选择 Scope" />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.scope !== cur.scope}
          >
            {({ getFieldValue }) => {
              const scope = getFieldValue('scope');
              if (scope !== 'knowledge') return null;
              return (
                <>
                  <Form.Item
                    name="protocol"
                    label="protocol"
                    rules={[{ required: true, message: '请选择 protocol' }]}
                    initialValue="openai-embeddings"
                  >
                    <Select options={EMBEDDING_PROTOCOL_OPTIONS} placeholder="openai-embeddings" />
                  </Form.Item>
                  <Form.Item
                    name="cap_vector_dim"
                    label="向量维度（vector_dim）"
                    rules={[{ required: true, message: '请填写向量维度，需与 pgvector 一致（当前 1536）' }]}
                    extra="写入 capabilities.vector_dim 与 default_parameters.dimensions；更换维度后需 re-index"
                  >
                    <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="1536" />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.scope !== cur.scope}
          >
            {({ getFieldValue }) => {
              const scope = getFieldValue('scope');
              const isTextScope = scope === 'text' || scope === 'writing';
              return isTextScope ? (
                <Form.Item
                  name="sync_text_writing"
                  label="定价同步"
                  valuePropName="checked"
                  extra="开启后同时为 text + writing 创建定价记录（适用于文字类模型）"
                >
                  <Switch />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>
          <Form.Item name="model_key" label="model_key" rules={[{ required: true }]}>
            <Input placeholder="如 gemini-2-5-flash" disabled={!!editingProviderModel} />
          </Form.Item>
          <Form.Item name="upstream_model" label="upstream_model">
            <Input placeholder="上游 API model id，如 qwen/qwen3-embedding-8b" />
          </Form.Item>
          <Form.Item name="display_name" label="display_name（可选）">
            <Input placeholder="Admin 展示名" />
          </Form.Item>
          <Form.Item name="description" label="description（可选）">
            <Input.TextArea rows={2} placeholder="简要说明" />
          </Form.Item>
          <Form.Item name="is_enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="pricing_id" hidden>
            <Input />
          </Form.Item>

          <Collapse
            defaultActiveKey={['pricing']}
            items={[
              {
                key: 'pricing',
                label: 'Provider 成本（必填）',
                children: (
                  <>
                    <Form.Item
                      name="charge_mode"
                      label="计费方式"
                      rules={[{ required: true, message: '请选择计费方式' }]}
                    >
                      <Select placeholder="选择计费方式" options={CHARGE_MODE_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                      shouldUpdate={(prev, cur) => prev.charge_mode !== cur.charge_mode}
                      noStyle
                    >
                      {() => {
                        const mode = providerModelForm.getFieldValue('charge_mode');
                        if (mode !== 'token_based') {
                          return (
                            <Form.Item
                              name="unit_price"
                              label={
                                mode === 'per_image'
                                  ? '单价（每张图，USD）'
                                  : mode === 'per_second_audio'
                                    ? '单价（每秒音频，USD）'
                                    : mode === 'per_second_video'
                                      ? '单价（每秒视频，USD）'
                                      : '单价（每次请求，USD）'
                              }
                              rules={[{ required: true, message: '请输入 Provider 成本单价' }]}
                            >
                              <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                placeholder="如 0.05"
                              />
                            </Form.Item>
                          );
                        }
                        return (
                          <>
                            <div
                              style={{
                                marginBottom: 12,
                                fontSize: 12,
                                color: 'rgba(148, 163, 184, 0.9)',
                                lineHeight: 1.5,
                              }}
                            >
                              以下为「报价」单位：可选每千或每百万 Token。保存时服务端会统一换算为<strong>每千
                              Token</strong>（与现有扣费逻辑一致），并在 metadata 中记录所选单位以便下次打开。
                            </div>
                            <Form.Item
                              label="输入 Token 成本（USD）"
                              extra="与输出同时填时按输入/输出分别计费"
                              rules={[
                                {
                                  validator: (_, value) => {
                                    const out =
                                      providerModelForm.getFieldValue('output_unit_price');
                                    const unit = providerModelForm.getFieldValue('unit_price');
                                    if (value || out || unit) return Promise.resolve();
                                    return Promise.reject(
                                      new Error('请输入至少一项成本单价（输入/输出/通用其一）')
                                    );
                                  },
                                },
                              ]}
                            >
                              <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                                <Form.Item name="input_unit_price" noStyle style={{ flex: 1, minWidth: 0 }}>
                                  <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="如 3.75 或 0.0003"
                                  />
                                </Form.Item>
                                <Form.Item name="input_token_basis" noStyle>
                                  <Select options={TOKEN_BASIS_OPTIONS} style={{ width: 132 }} />
                                </Form.Item>
                              </div>
                            </Form.Item>
                            <Form.Item
                              label="输出 Token 成本（USD）"
                              rules={[
                                {
                                  validator: (_, value) => {
                                    const inp = providerModelForm.getFieldValue('input_unit_price');
                                    const unit = providerModelForm.getFieldValue('unit_price');
                                    if (value || inp || unit) return Promise.resolve();
                                    return Promise.reject(
                                      new Error('请输入至少一项成本单价（输入/输出/通用其一）')
                                    );
                                  },
                                },
                              ]}
                            >
                              <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                                <Form.Item name="output_unit_price" noStyle style={{ flex: 1, minWidth: 0 }}>
                                  <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="如 0.01 或 12"
                                  />
                                </Form.Item>
                                <Form.Item name="output_token_basis" noStyle>
                                  <Select options={TOKEN_BASIS_OPTIONS} style={{ width: 132 }} />
                                </Form.Item>
                              </div>
                            </Form.Item>
                            <Form.Item
                              label="通用单价（USD，兜底）"
                              extra="未区分输入/输出时使用；可与「输入/输出」二选一或组合"
                              rules={[
                                {
                                  validator: (_, value) => {
                                    const inp = providerModelForm.getFieldValue('input_unit_price');
                                    const out =
                                      providerModelForm.getFieldValue('output_unit_price');
                                    if (value || inp || out) return Promise.resolve();
                                    return Promise.reject(
                                      new Error('请输入至少一项成本单价（输入/输出/通用其一）')
                                    );
                                  },
                                },
                              ]}
                            >
                              <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                                <Form.Item name="unit_price" noStyle style={{ flex: 1, minWidth: 0 }}>
                                  <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="输入输出不区分时填写"
                                  />
                                </Form.Item>
                                <Form.Item name="combined_token_basis" noStyle>
                                  <Select options={TOKEN_BASIS_OPTIONS} style={{ width: 132 }} />
                                </Form.Item>
                              </div>
                            </Form.Item>
                          </>
                        );
                      }}
                    </Form.Item>
                    <Form.Item
                      name="currency"
                      label="币种"
                      rules={[{ required: true, message: '请选择币种' }]}
                    >
                      <Select placeholder="选择币种" options={CURRENCY_OPTIONS} allowClear />
                    </Form.Item>
                    <div
                      style={{
                        margin: '16px 0 8px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      MXM-TOKEN（用户扣费）
                    </div>
                    <Form.Item
                      shouldUpdate={(prev, cur) => prev.charge_mode !== cur.charge_mode}
                      noStyle
                    >
                      {() => {
                        const mode = providerModelForm.getFieldValue('charge_mode');
                        if (mode === 'token_based') {
                          const unitUsd = Number(providerModelForm.getFieldValue('unit_price') || 0);
                          const inUsd = Number(providerModelForm.getFieldValue('input_unit_price') || 0);
                          const outUsd = Number(providerModelForm.getFieldValue('output_unit_price') || 0);
                          const suggestIn = inUsd > 0 ? Math.max(0.001, Math.round(inUsd * 100 * 2.5 * 1000) / 1000) : null;
                          const suggestOut = outUsd > 0 ? Math.max(0.001, Math.round(outUsd * 100 * 2.5 * 1000) / 1000) : null;
                          const suggestUnit = unitUsd > 0 ? Math.max(0.001, Math.round(unitUsd * 100 * 2.5 * 1000) / 1000) : null;
                          return (
                            <>
                              <Form.Item
                                name="platform_input_unit_price"
                                label="输入 千Token 售价（MXM-TOKEN）"
                              extra={
                                suggestIn != null
                                  ? `默认约 ${suggestIn}（成本×100×2.5；未填保存时自动回填）`
                                  : undefined
                              }
                              >
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="如 0.1" />
                              </Form.Item>
                              <Form.Item
                                name="platform_output_unit_price"
                                label="输出 千Token 售价（MXM-TOKEN）"
                              extra={
                                suggestOut != null
                                  ? `默认约 ${suggestOut}（成本×100×2.5；未填保存时自动回填）`
                                  : undefined
                              }
                              >
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="如 0.5" />
                              </Form.Item>
                              <Form.Item
                                name="platform_unit_price"
                                label="通用千Token 售价（兜底）"
                                extra={
                                  suggestUnit != null
                                    ? `默认约 ${suggestUnit}（成本×100×2.5；未填保存时自动回填）`
                                    : undefined
                                }
                              >
                                <InputNumber min={0} style={{ width: '100%' }} />
                              </Form.Item>
                              <Form.Item name="platform_min_charge" label="最低扣费（MXM-TOKEN）">
                                <InputNumber min={0} style={{ width: '100%' }} />
                              </Form.Item>
                            </>
                          );
                        }
                        const unitUsd = Number(providerModelForm.getFieldValue('unit_price') || 0);
                        const suggest = unitUsd > 0 ? Math.max(0.001, Math.round(unitUsd * 100 * 2.5 * 1000) / 1000) : null;
                        return (
                          <>
                            <Form.Item
                              name="platform_unit_price"
                              label={
                                mode === 'per_image'
                                  ? '售价（每张，MXM-TOKEN）'
                                  : mode === 'per_second_audio'
                                    ? '售价（每秒音频，MXM-TOKEN）'
                                    : mode === 'per_second_video'
                                      ? '售价（每秒视频，MXM-TOKEN）'
                                      : '售价（每次，MXM-TOKEN）'
                              }
                              extra={
                                suggest != null
                                  ? `默认约 ${suggest}（成本×100×2.5；未填保存时自动回填）`
                                  : '将按成本自动回填'
                              }
                              rules={[{ required: true, message: '请配置 MXM-TOKEN，否则用户无法调用' }]}
                            >
                              <InputNumber min={0} style={{ width: '100%' }} placeholder="如 2" />
                            </Form.Item>
                            <Form.Item name="platform_min_charge" label="最低扣费（MXM-TOKEN）">
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                          </>
                        );
                      }}
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'capabilities',
                label: '模型能力参数',
                children: (
                  <>
                    <div
                      style={{
                        marginBottom: 12,
                        fontSize: 12,
                        color: 'rgba(148, 163, 184, 0.9)',
                        lineHeight: 1.5,
                      }}
                    >
                      声明该物理模型允许的输入模态、产出模态和 *-to-* 模式（与 AtlasCloud 官方归类对齐）。
                      业务侧将据此决定能否把音频/视频/图像作为输入传给该模型。
                    </div>
                    <Form.Item
                      name="cap_supported_inputs"
                      label="支持的输入模态"
                      extra="模型可接受的输入内容类型；多选。"
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择支持的输入模态"
                        options={MODALITY_OPTIONS}
                      />
                    </Form.Item>
                    <Form.Item
                      name="cap_supported_outputs"
                      label="支持的输出模态"
                      extra="模型可产出的内容类型；多选。"
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择支持的输出模态"
                        options={MODALITY_OPTIONS}
                      />
                    </Form.Item>
                    <Form.Item
                      name="cap_modes"
                      label="支持的 *-to-* 模式（可选）"
                      extra="例如 text-to-image、image-to-video、reference-to-video、chat、embedding。多个用英文逗号分隔。"
                    >
                      <Select
                        mode="tags"
                        allowClear
                        tokenSeparators={[',']}
                        placeholder="text-to-image, image-edit"
                      />
                    </Form.Item>
                    <Form.Item label="context_window（上下文窗口）">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Form.Item name="cap_context_window" noStyle>
                          <InputNumber
                            min={1}
                            step={1000}
                            style={{ width: '100%' }}
                            placeholder="留空则使用系统默认 200,000"
                          />
                        </Form.Item>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          token
                        </Typography.Text>
                      </div>
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}
