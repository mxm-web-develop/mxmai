import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Statistic, Button, Select, Space, Modal, Form, Input, InputNumber, Switch, Popconfirm, Tabs } from 'antd';
import {
  getProvidersRouting,
  getProvidersOptions,
  postProvidersRouting,
  deleteProvidersRouting,
  getProvidersStats,
  getProvidersBilling,
  putProviderBalance,
  getProviderKeys,
  postProviderKey,
  putProviderKey,
  deleteProviderKey,
  type ProviderRoutingEntry,
  type ProviderStatsItem,
  type ProviderBillingItem,
  type ProviderApiKeyMasked,
  getProvidersCosts,
  type ProviderCostByProvider,
  getSystemBills,
  type SystemBillsResponse,
  type PpioBill,
  type PpioBillSummary,
  getProviderPricing,
  upsertProviderPricing,
  deleteProviderPricing,
  type ProviderPricingRow,
  type UpsertProviderPricingBody,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ColumnsType } from 'antd/es/table';

const WINDOW_OPTIONS = [
  { value: '1d', label: '1天' },
  { value: '7d', label: '7天' },
  { value: '15d', label: '15天' },
  { value: '30d', label: '30天' },
];

const KEY_PROVIDER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'deer', label: 'deer' },
  { value: 'replicate', label: 'replicate' },
  { value: 'ppio', label: 'ppio' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'qwen', label: 'qwen' },
  { value: 'volc', label: 'volc' },
  { value: 'minimax', label: 'minimax' },
];

const PROVIDER_OPTIONS = [
  { value: 'deer', label: 'deer' },
  { value: 'replicate', label: 'replicate' },
  { value: 'ppio', label: 'ppio' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'qwen', label: 'qwen' },
  { value: 'volc', label: 'volc' },
  { value: 'minimax', label: 'minimax' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'USDT', label: 'USDT' },
  { value: 'CNY', label: 'RMB' },
];

const CHARGE_MODE_OPTIONS = [
  { value: 'token_based', label: 'token_based（按千 Token 计量）' },
  { value: 'per_request', label: 'per_request（按请求次数）' },
  { value: 'per_image', label: 'per_image（按图片张数）' },
  { value: 'per_second_audio', label: 'per_second_audio（按音频秒数）' },
  { value: 'per_second_video', label: 'per_second_video（按视频秒数）' },
];

/** 25% 毛利：售价 = 成本 / 0.75；1000 MXM-TOKEN = 1 USD */
const PLATFORM_SUGGEST_MULTIPLIER = 1000 / 0.75; // ≈ 1333.33

const SCOPE_OPTIONS = [
  { value: 'writing', label: 'writing（写作）' },
  { value: 'graph', label: 'graph（图片生成）' },
  { value: 'audio', label: 'audio（音频）' },
  { value: 'video', label: 'video（视频）' },
  { value: 'text', label: 'text（文本对话）' },
  { value: 'default', label: 'default（兜底）' },
];

function getScopeFromLogicalModel(logicalModel: string): 'graph' | 'text' | 'audio' | 'video' | undefined {
  if (logicalModel.startsWith('writing-')) return 'text';
  if (logicalModel.startsWith('graph-')) return 'graph';
  if (logicalModel.startsWith('audio-')) return 'audio';
  if (logicalModel.startsWith('video-')) return 'video';
  return undefined;
}

/** 基础文字/内部调用类逻辑模型（生图提示词、写作内压缩等统一用此），需在业务模型管理中展示并可切换 */
const BASIC_TEXT_LOGICAL_MODELS = ['writing-basic-text'];

function getRoutingRowCategory(logicalModel: string): string {
  if (logicalModel === 'writing-basic-text') return '基础文字（内部调用）';
  if (logicalModel.startsWith('graph-')) return '图片';
  if (logicalModel.startsWith('writing-')) return '写作';
  if (logicalModel.startsWith('audio-')) return '音频';
  if (logicalModel.startsWith('video-')) return '视频';
  return '其他';
}

/** 排序权重：保证基础文字模型紧接在写作后、音频前，便于在列表中看到 */
function routingSortOrder(logicalModel: string): number {
  if (logicalModel.startsWith('graph-')) return 0;
  if (logicalModel.startsWith('writing-') && !BASIC_TEXT_LOGICAL_MODELS.includes(logicalModel)) return 1;
  if (BASIC_TEXT_LOGICAL_MODELS.includes(logicalModel)) return 2;
  if (logicalModel.startsWith('audio-')) return 3;
  if (logicalModel.startsWith('video-')) return 4;
  return 5;
}

type RoutingRow = { key: string; logicalModel: string; provider: string; model: string; overridden?: boolean; rawProvider: string; category: string };
type ProviderPricingForm = Omit<Partial<ProviderPricingRow>, 'metadata'>;

export default function ProviderRoutes() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [routing, setRouting] = useState<Record<string, ProviderRoutingEntry>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  const [modelsByProviderByScope, setModelsByProviderByScope] = useState<Record<string, Record<string, string[]>>>({});
  const [stats, setStats] = useState<ProviderStatsItem[]>([]);
  const [billing, setBilling] = useState<ProviderBillingItem[]>([]);
  const [costs, setCosts] = useState<ProviderCostByProvider[]>([]);
  const [bills, setBills] = useState<PpioBill[]>([]);
  const [billSummary, setBillSummary] = useState<PpioBillSummary | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billCycleType, setBillCycleType] = useState<'Hour' | 'Day' | 'Week' | 'Month'>('Day');
  const [billCategory, setBillCategory] = useState<string>('');
  const [window_, setWindow] = useState<string>('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keysList, setKeysList] = useState<ProviderApiKeyMasked[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyProviderFilter, setKeyProviderFilter] = useState<string>('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm<{ provider: string; service?: string; key_value: string; priority?: number }>();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RoutingRow | null>(null);
  const [editForm] = Form.useForm<{ provider: string; model: string }>();
  const [editSaving, setEditSaving] = useState(false);
  const [providerPricing, setProviderPricing] = useState<ProviderPricingRow[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [providerPricingModalOpen, setProviderPricingModalOpen] = useState(false);
  const [editingProviderPricing, setEditingProviderPricing] = useState<ProviderPricingRow | null>(null);
  const [providerPricingForm] = Form.useForm<ProviderPricingForm>();
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceModalProvider, setBalanceModalProvider] = useState<string | null>(null);
  const [balanceModalValue, setBalanceModalValue] = useState<number>(0);

  const fetchRouting = useCallback(async () => {
    const res = await getProvidersRouting();
    if (res.error) {
      setError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const data = (res.data as { data?: Record<string, ProviderRoutingEntry> })?.data ?? (res.data as Record<string, ProviderRoutingEntry>);
    if (data && typeof data === 'object') setRouting(data);
  }, []);

  const fetchOptions = useCallback(async () => {
    const res = await getProvidersOptions();
    if (res.error) return;
    const payload = (res.data as { data?: { modelsByProvider?: Record<string, string[]>; modelsByProviderByScope?: Record<string, Record<string, string[]>> } })?.data;
    if (payload?.modelsByProvider && typeof payload.modelsByProvider === 'object') {
      setModelsByProvider(payload.modelsByProvider);
    }
    if (payload?.modelsByProviderByScope && typeof payload.modelsByProviderByScope === 'object') {
      setModelsByProviderByScope(payload.modelsByProviderByScope);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await getProvidersStats({ window: window_ });
    if (res.error) return;
    const data = (res.data as { data?: ProviderStatsItem[] })?.data ?? (res.data as ProviderStatsItem[]);
    if (Array.isArray(data)) setStats(data);
  }, [window_]);

  const fetchBilling = useCallback(async () => {
    const res = await getProvidersBilling();
    if (res.error) return;
    const data = (res.data as { data?: ProviderBillingItem[] })?.data ?? (res.data as ProviderBillingItem[]);
    if (Array.isArray(data)) setBilling(data);
  }, []);

  const fetchBills = useCallback(async () => {
    setBillLoading(true);
    const nowSec = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = nowSec - 7 * 24 * 60 * 60;
    const res = await getSystemBills({
      cycleType: billCycleType,
      productCategory: billCategory || undefined,
      startTime: sevenDaysAgo,
      endTime: nowSec,
    });
    setBillLoading(false);
    if (res.error) return;
    const data = (res.data as { data?: SystemBillsResponse })?.data ?? (res.data as SystemBillsResponse | undefined);
    const ppio = data?.ppio;
    setBills(ppio?.bills ?? []);
    setBillSummary(ppio?.summary ?? null);
  }, [billCycleType, billCategory]);

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
            !('model_key' in (item as unknown as Record<string, unknown>)),
        ),
      );
    }
  }, [window_]);

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    const providerRes = await getProviderPricing();
    setPricingLoading(false);
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
    if (res.error) return;
    const data = (res.data as { data?: ProviderApiKeyMasked[] })?.data ?? (res.data as ProviderApiKeyMasked[]);
    if (Array.isArray(data)) setKeysList(data);
  }, [keyProviderFilter]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchRouting(),
      fetchOptions(),
      fetchStats(),
      fetchBilling(),
      fetchCosts(),
      fetchKeys(),
      fetchBills(),
      fetchPricing(),
    ]).finally(
      () => setLoading(false),
    );
  }, [fetchRouting, fetchOptions, fetchStats, fetchBilling, fetchCosts, fetchKeys, fetchBills, fetchPricing]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    // 延迟到下一轮事件循环再触发 refresh，避免在 effect 里同步 setState
    const timer = setTimeout(() => {
      refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoggedIn, isAdmin, refresh]);

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

  const handleToggleActive = async (id: string, current: boolean) => {
    setActionLoading(id);
    const res = await putProviderKey(id, { is_active: !current });
    setActionLoading(null);
    if (!res.error) fetchKeys();
  };

  const handleDeleteKey = async (id: string) => {
    setActionLoading(id);
    const res = await deleteProviderKey(id);
    setActionLoading(null);
    if (!res.error) fetchKeys();
  };

  const fillSuggestedPlatformPrices = (values: Record<string, unknown>) => {
    const mode = values.charge_mode;
    const updates: Record<string, number> = {};
    if (mode === 'token_based') {
      const inp = Number(values.input_unit_price);
      if (!Number.isNaN(inp) && inp > 0 && (values.platform_input_unit_price == null || values.platform_input_unit_price === '')) {
        updates.platform_input_unit_price = Math.round(inp * PLATFORM_SUGGEST_MULTIPLIER * 1000) / 1000;
      }
      const out = Number(values.output_unit_price);
      if (!Number.isNaN(out) && out > 0 && (values.platform_output_unit_price == null || values.platform_output_unit_price === '')) {
        updates.platform_output_unit_price = Math.round(out * PLATFORM_SUGGEST_MULTIPLIER * 1000) / 1000;
      }
      const u = Number(values.unit_price);
      if (!Number.isNaN(u) && u > 0 && (values.platform_unit_price == null || values.platform_unit_price === '') &&
        (values.platform_input_unit_price == null || values.platform_input_unit_price === '') &&
        (values.platform_output_unit_price == null || values.platform_output_unit_price === '')) {
        updates.platform_unit_price = Math.round(u * PLATFORM_SUGGEST_MULTIPLIER * 1000) / 1000;
      }
    } else {
      const u = Number(values.unit_price);
      if (!Number.isNaN(u) && u > 0 && (values.platform_unit_price == null || values.platform_unit_price === '')) {
        updates.platform_unit_price = Math.round(u * PLATFORM_SUGGEST_MULTIPLIER * 1000) / 1000;
      }
    }
    if (Object.keys(updates).length > 0) providerPricingForm.setFieldsValue(updates);
  };

  const openProviderPricingModal = (row?: ProviderPricingRow) => {
    setEditingProviderPricing(row ?? null);
    if (row) {
      providerPricingForm.setFieldsValue({ ...row });
      // 若有 provider 价格但无平台售价，填充建议价
      setTimeout(() => fillSuggestedPlatformPrices({ ...row, charge_mode: row.charge_mode || 'token_based' }), 0);
    } else {
      providerPricingForm.resetFields();
    }
    setProviderPricingModalOpen(true);
  };

  const handleSaveProviderPricing = async () => {
    const values = await providerPricingForm.validateFields().catch(() => null);
    if (!values) return;
    const body: UpsertProviderPricingBody = {
      ...values,
      id: editingProviderPricing?.id,
      provider: values.provider!,
      scope: values.scope!,
      model_key: values.model_key!,
      charge_mode: values.charge_mode!,
      unit_price: values.unit_price ?? 0,
    };
    const res = await upsertProviderPricing(body);
    if (!res.error) {
      setProviderPricingModalOpen(false);
      setEditingProviderPricing(null);
      fetchPricing();
    }
  };

  const handleDeleteProviderPricingRow = async (row: ProviderPricingRow) => {
    const res = await deleteProviderPricing(row.id);
    if (!res.error) fetchPricing();
  };

  const openBalanceModal = (b: ProviderBillingItem) => {
    setBalanceModalProvider(b.provider);
    setBalanceModalValue(typeof b.manualBalance === 'number' ? b.manualBalance : 0);
    setBalanceModalOpen(true);
  };

  const handleSaveBalance = async () => {
    if (!balanceModalProvider) return;
    const res = await putProviderBalance({ provider: balanceModalProvider, balance: balanceModalValue });
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

  const routingData: RoutingRow[] = Object.entries(routing)
    .map(([key, entry]) => ({
      key,
      logicalModel: key,
      provider: entry.provider + (entry.overridden ? ' (已覆盖)' : ''),
      model: entry.model,
      overridden: entry.overridden,
      rawProvider: entry.provider,
      category: getRoutingRowCategory(key),
    }))
    .sort((a, b) => {
      const orderA = routingSortOrder(a.logicalModel);
      const orderB = routingSortOrder(b.logicalModel);
      if (orderA !== orderB) return orderA - orderB;
      return a.logicalModel.localeCompare(b.logicalModel);
    });

  const openEdit = (row: RoutingRow) => {
    setEditingRow(row);
    editForm.setFieldsValue({ provider: row.rawProvider, model: row.model });
    setEditModalOpen(true);
  };

  const closeEdit = () => {
    setEditModalOpen(false);
    setEditingRow(null);
    editForm.resetFields();
  };

  const handleEditSave = async () => {
    const v = await editForm.validateFields().catch(() => null);
    if (!v || !editingRow) return;
    setEditSaving(true);
    const res = await postProvidersRouting({
      logicalModel: editingRow.logicalModel,
      provider: v.provider,
      model: v.model,
    });
    setEditSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    closeEdit();
    fetchRouting();
  };

  const handleResetRouting = async (logicalModel: string) => {
    const res = await deleteProvidersRouting(logicalModel);
    if (!res.error) fetchRouting();
  };

  const routingColumns: ColumnsType<RoutingRow> = [
    { title: '逻辑模型', dataIndex: 'logicalModel', key: 'logicalModel', width: 220 },
    { title: '说明', dataIndex: 'category', key: 'category', width: 160, render: (c: string) => c || '—' },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', width: 160 },
    { title: '物理模型', dataIndex: 'model', key: 'model', width: 180 },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          {row.overridden && (
            <Popconfirm
              title="恢复为该业务的默认 provider/模型？"
              onConfirm={() => handleResetRouting(row.logicalModel)}
            >
              <Button type="link" size="small">恢复默认</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-card admin-providers-page">
      <h2>模型通道管理</h2>
      <p className="admin-providers-hint" style={{ marginBottom: 16 }}>
        查看并配置「业务逻辑模型 → Provider/物理模型」路由；监控与余额仅 Admin 可查看。
        基础文字模型（<code>writing-basic-text</code>，供生图提示词、写作内压缩等内部调用）也在此切换，说明列会标注「基础文字（内部调用）」；若列表中未出现请重启 mxmcgi 服务以加载最新默认路由。
      </p>
      {error && <div className="admin-providers-error" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="admin-providers-content-wrap">
        <div className="admin-providers-content-inner">
          <Tabs
            defaultActiveKey="status"
            items={[
              {
                key: 'status',
                label: '通道状态与统计',
                children: (
                  <Card
                    size="small"
                    title="通道状态与统计"
                    extra={
                      <Space>
                        <Select
                          value={window_}
                          onChange={setWindow}
                          options={WINDOW_OPTIONS}
                          style={{ width: 120 }}
                        />
                        <Button type="primary" size="small" onClick={refresh} loading={loading}>
                          刷新
                        </Button>
                      </Space>
                    }
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {stats.map((s) => {
                        const cost = costs.find((c) => c.provider === s.provider);
                        return (
                        <Card
                          key={s.provider}
                          size="small"
                          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                        >
                          <Statistic title={s.provider} value={s.requestCount} suffix="请求" />
                          <div style={{ marginTop: 8 }}>
                            成功率: {(100 * (1 - s.errorRate)).toFixed(1)}%
                          </div>
                          <div>平均延迟: {s.avgLatencyMs.toFixed(0)} ms</div>
                          {s.p50LatencyMs != null && <div>P50: {s.p50LatencyMs.toFixed(0)} ms</div>}
                            {cost && (
                              <>
                                <div style={{ marginTop: 8 }}>
                                  预计成本: ${cost.estimatedCost.toFixed(4)}
                                </div>
                                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                  Tokens: {cost.totalTokens.toLocaleString()}
                                </div>
                              </>
                            )}
                          </Card>
                        );
                      })}
                      {stats.length === 0 && !loading && (
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>暂无统计数据</span>
                      )}
                    </div>
                  </Card>
                ),
              },
              {
                key: 'billing',
                label: '余额/用量',
                children: (
                  <Card
                    size="small"
                    title="余额/用量"
                    extra={
                      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                        手动余额按 provider_pricing 计费后自动扣减
                      </span>
                    }
                  >
                    <Space wrap size="middle">
                      {billing.map((b) => (
                        <Card
                          key={b.provider}
                          size="small"
                          style={{ minWidth: 180, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>{b.provider}</div>
                          {b.supported ? (
                            <>
                              <div>已用: {b.used ?? '—'}</div>
                              <div>总额: {b.totalLimit ?? '—'}</div>
                              {b.resetAt && <div>重置: {b.resetAt}</div>}
                              {b.manualBalance !== undefined && (
                                <div style={{ marginTop: 8, color: '#69c' }}>
                                  手动余额: {b.manualBalance} {b.currency ?? 'USD'}
                                </div>
                              )}
                              <Button type="link" size="small" style={{ padding: 0, marginTop: 8 }} onClick={() => openBalanceModal(b)}>
                                {b.manualBalance !== undefined ? '编辑余额' : '录入余额'}
                              </Button>
                            </>
                          ) : (
                            <>
                              {b.manualBalance !== undefined ? (
                                <div>
                                  <div style={{ color: '#69c' }}>余额: {b.manualBalance} {b.currency ?? 'USD'}</div>
                                  <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>按 provider_pricing 计费扣减</div>
                                </div>
                              ) : (
                                <span style={{ color: 'hsl(var(--muted-foreground))' }}>无官方余额，可手动录入</span>
                              )}
                              <div><Button type="link" size="small" style={{ padding: 0, marginTop: 6 }} onClick={() => openBalanceModal(b)}>
                                {b.manualBalance !== undefined ? '编辑余额' : '录入余额'}
                              </Button></div>
                            </>
                          )}
                        </Card>
                      ))}
                      {billing.length === 0 && !loading && (
                        <span style={{ color: '#888' }}>暂无</span>
                      )}
                    </Space>
                    <Modal
                      title={balanceModalProvider ? `设置 ${balanceModalProvider} 余额` : '设置余额'}
                      open={balanceModalOpen}
                      onOk={handleSaveBalance}
                      onCancel={() => { setBalanceModalOpen(false); setBalanceModalProvider(null); }}
                      okText="保存"
                      cancelText="取消"
                    >
                      <div style={{ marginTop: 16 }}>
                        <div style={{ marginBottom: 8 }}>余额（USD）：</div>
                        <InputNumber
                          min={0}
                          step={1}
                          style={{ width: '100%' }}
                          value={balanceModalValue}
                          onChange={(v) => setBalanceModalValue(v ?? 0)}
                          placeholder="请输入余额"
                        />
                        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                          任务完成后将按 provider_pricing 自动扣减
                        </div>
                      </div>
                    </Modal>
                  </Card>
                ),
              },
              {
                key: 'bills',
                label: '账单',
                children: (
                  <Card
                    size="small"
                    title="账单（PPIO）"
                    extra={
                      <Space>
                        <Select
                          value={billCycleType}
                          onChange={setBillCycleType}
                          options={[
                            { value: 'Day', label: '按天' },
                            { value: 'Week', label: '按周' },
                            { value: 'Month', label: '按月' },
                          ]}
                          style={{ width: 120 }}
                        />
                        <Select
                          value={billCategory}
                          onChange={setBillCategory}
                          options={[
                            { value: '', label: '全部类别' },
                            { value: 'llm', label: 'llm' },
                            { value: 'gen_api', label: 'gen_api' },
                          ]}
                          style={{ width: 140 }}
                        />
                        <Button size="small" onClick={fetchBills} loading={billLoading}>
                          刷新账单
                        </Button>
                      </Space>
                    }
                  >
                    {billSummary && (
                      <div style={{ marginBottom: 12, fontSize: 12, color: '#ccc' }}>
                        <span style={{ marginRight: 16 }}>
                          总账单数：{billSummary.totalBills}
                        </span>
                        <span style={{ marginRight: 16 }}>
                          总金额：{billSummary.totalAmount}
                        </span>
                        <span style={{ marginRight: 16 }}>
                          实付：{billSummary.totalPayAmount}
                        </span>
                        <span>券额：{billSummary.totalVoucherAmount}</span>
                      </div>
                    )}
                    <Table<PpioBill>
                      rowKey={(r) =>
                        `${r.userId}-${r.startTime}-${r.endTime}-${r.productName}-${r.category}`
                      }
                      size="small"
                      loading={billLoading}
                      dataSource={bills}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: '产品', dataIndex: 'productName', key: 'productName', width: 160 },
                        { title: '类别', dataIndex: 'category', key: 'category', width: 80 },
                        {
                          title: '开始时间',
                          dataIndex: 'startTime',
                          key: 'startTime',
                          width: 160,
                        },
                        {
                          title: '结束时间',
                          dataIndex: 'endTime',
                          key: 'endTime',
                          width: 160,
                        },
                        {
                          title: '金额',
                          dataIndex: 'amount',
                          key: 'amount',
                          width: 100,
                        },
                        {
                          title: '券额',
                          dataIndex: 'voucherAmount',
                          key: 'voucherAmount',
                          width: 100,
                        },
                        {
                          title: '实付',
                          dataIndex: 'payAmount',
                          key: 'payAmount',
                          width: 100,
                        },
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: 'routing',
                label: '业务模型管理',
                children: (
                  <Card size="small" title="业务模型管理">
                    <Table<RoutingRow>
                      columns={routingColumns}
                      dataSource={routingData}
                      rowKey="key"
                      loading={loading}
                      size="small"
                      pagination={false}
                      locale={{ emptyText: '暂无路由数据' }}
                    />
                  </Card>
                ),
              },
              {
                key: 'keys',
                label: 'API Key 管理',
                children: (
                  <Card
                    size="small"
                    title="API Key 管理"
                    extra={
                      <Space>
                        <Select
                          value={keyProviderFilter}
                          onChange={setKeyProviderFilter}
                          options={KEY_PROVIDER_OPTIONS}
                          style={{ width: 120 }}
                          placeholder="Provider"
                        />
                        <Button type="primary" size="small" onClick={() => setAddModalOpen(true)}>
                          新增 Key
                        </Button>
                      </Space>
                    }
                  >
                    <Table<ProviderApiKeyMasked>
                      dataSource={[...keysList].sort((a, b) => a.priority - b.priority)}
                      rowKey="id"
                      loading={keysLoading}
                      size="small"
                      pagination={false}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider', width: 100 },
                        {
                          title: 'Service',
                          dataIndex: 'service',
                          key: 'service',
                          width: 100,
                          render: (v: string | null) => v ?? '—',
                        },
                        {
                          title: 'Key',
                          dataIndex: 'key_masked',
                          key: 'key_masked',
                          width: 120,
                          ellipsis: true,
                        },
                        { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 80 },
                        {
                          title: '状态',
                          dataIndex: 'is_active',
                          key: 'is_active',
                          width: 80,
                          render: (v: boolean, r) => (
                            <Switch
                              size="small"
                              checked={v}
                              disabled={actionLoading !== null}
                              onChange={() => handleToggleActive(r.id, v)}
                            />
                          ),
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 220,
                          render: (_, r) => {
                            const sorted = [...keysList].sort(
                              (a, b) => a.priority - b.priority,
                            );
                            const idx = sorted.findIndex((k) => k.id === r.id);
                            const loadingRow = actionLoading === r.id;
                            return (
                              <Space size="small">
                                <Button
                                  type="link"
                                  size="small"
                                  disabled={idx <= 0 || loadingRow}
                                  onClick={() => handleMoveKey(r.id, 'up')}
                                >
                                  上移
                                </Button>
                                <Button
                                  type="link"
                                  size="small"
                                  disabled={
                                    idx >= sorted.length - 1 || idx < 0 || loadingRow
                                  }
                                  onClick={() => handleMoveKey(r.id, 'down')}
                                >
                                  下移
                                </Button>
                                <Popconfirm
                                  title="确定删除此 Key？"
                                  onConfirm={() => handleDeleteKey(r.id)}
                                >
                                  <Button
                                    type="link"
                                    size="small"
                                    danger
                                    disabled={!!actionLoading}
                                  >
                                    删除
                                  </Button>
                                </Popconfirm>
                              </Space>
                            );
                          },
                        },
                      ]}
                      locale={{ emptyText: '暂无 Key，可点击「新增 Key」添加' }}
                    />
                  </Card>
                ),
              },
              {
                key: 'test',
                label: '模型管道测试',
                children: (
                  <Card size="small" title="模型管道测试">
                    <p style={{ color: '#aaa' }}>
                      这里可以后续补充简单的测试表单，用于指定逻辑模型、Provider 与参数，直接在 Admin
                      内发起一次 end-to-end 调用，验证路由与 Provider 配置是否正确。
                    </p>
                  </Card>
                ),
              },
              {
                key: 'pricing',
                label: '模型价格管理',
                children: (
                  <div>
                    <Card
                      size="small"
                      title="Provider 成本定价（provider_pricing）"
                      extra={
                        <Button size="small" type="primary" onClick={() => openProviderPricingModal()}>
                          新增 Provider 定价
                        </Button>
                      }
                    >
                      <Table<ProviderPricingRow>
                        rowKey="id"
                        size="small"
                        loading={pricingLoading}
                        dataSource={providerPricing}
                        pagination={false}
                        columns={[
                          { title: 'Provider', dataIndex: 'provider', key: 'provider', width: 120 },
                          { title: 'Scope', dataIndex: 'scope', key: 'scope', width: 100 },
                          { title: '模型键', dataIndex: 'model_key', key: 'model_key', width: 200 },
                          { title: '计费模式', dataIndex: 'charge_mode', key: 'charge_mode', width: 140 },
                          {
                            title: '单价',
                            dataIndex: 'unit_price',
                            key: 'unit_price',
                            width: 100,
                          },
                          {
                            title: '输入/输出单价',
                            key: 'io_price',
                            width: 140,
                            render: (_, r) =>
                              r.input_unit_price != null && r.output_unit_price != null
                                ? `${r.input_unit_price} / ${r.output_unit_price}`
                                : '—',
                          },
                          {
                            title: '币种',
                            dataIndex: 'currency',
                            key: 'currency',
                            width: 80,
                          },
                          {
                            title: '平台售价（MXM-TOKEN）',
                            key: 'platform_price',
                            width: 180,
                            render: (_, r) => {
                              if (r.platform_input_unit_price != null && r.platform_output_unit_price != null) {
                                return `in:${r.platform_input_unit_price} / out:${r.platform_output_unit_price}`;
                              }
                              if (r.platform_unit_price != null) {
                                return String(r.platform_unit_price);
                              }
                              return '—';
                            },
                          },
                          {
                            title: '最低扣费',
                            dataIndex: 'platform_min_charge',
                            key: 'platform_min_charge',
                            width: 90,
                            render: (v) => (v != null ? v : '—'),
                          },
                          {
                            title: '操作',
                            key: 'actions',
                            width: 160,
                            render: (_, row) => (
                              <Space size="small">
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => openProviderPricingModal(row)}
                                >
                                  编辑
                                </Button>
                                <Popconfirm
                                  title="确定删除此定价？"
                                  onConfirm={() => handleDeleteProviderPricingRow(row)}
                                >
                                  <Button type="link" size="small" danger>
                                    删除
                                  </Button>
                                </Popconfirm>
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </Card>
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
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" initialValues={{ priority: 0 }}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={KEY_PROVIDER_OPTIONS.filter((o) => o.value)} placeholder="选择 Provider" />
          </Form.Item>
          <Form.Item name="service" label="Service（可选）">
            <Input placeholder="如 openai, minimax" />
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
        title={editingRow ? `编辑路由：${editingRow.logicalModel}` : '编辑路由'}
        open={editModalOpen}
        onOk={handleEditSave}
        confirmLoading={editSaving}
        onCancel={closeEdit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="逻辑模型">
            <Input value={editingRow?.logicalModel} disabled />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true, message: '请选择 Provider' }]}>
            <Select
              options={PROVIDER_OPTIONS}
              placeholder="选择 Provider"
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prev, cur) => prev.provider !== cur.provider}
            noStyle
          >
            {() => {
              const p = editForm.getFieldValue('provider') || editingRow?.rawProvider;
              const logicalModel = editingRow?.logicalModel;
              const scope = logicalModel ? getScopeFromLogicalModel(logicalModel) : undefined;
              let models: string[] = [];
              if (p) {
                const scoped = scope ? modelsByProviderByScope[p]?.[scope] : undefined;
                if (scoped && scoped.length > 0) {
                  models = scoped;
                } else {
                  models = modelsByProvider[p] || [];
                }
              }
              const options = models.map((m) => ({ value: m, label: m }));
              return (
                <Form.Item
                  name="model"
                  label="物理模型"
                  rules={[{ required: true, message: '请选择物理模型' }]}
                >
                  <Select
                    showSearch
                    placeholder={p ? '选择模型' : '请先选择 Provider'}
                    options={options}
                    disabled={!p}
                    filterOption={(input, option) =>
                      (option?.label as string).toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingProviderPricing ? '编辑 Provider 定价' : '新增 Provider 定价'}
        open={providerPricingModalOpen}
        onOk={handleSaveProviderPricing}
        onCancel={() => {
          setProviderPricingModalOpen(false);
          setEditingProviderPricing(null);
        }}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 13 }}>
          💡 1000 MXM-TOKEN = 1 USD。填写 Provider 成本后，若未填平台售价，将按 25% 毛利自动建议默认值（可调整）。
        </div>
        <Form
          form={providerPricingForm}
          layout="vertical"
          onValuesChange={(changed, all) => {
            if ('unit_price' in changed || 'input_unit_price' in changed || 'output_unit_price' in changed) {
              fillSuggestedPlatformPrices(all);
            }
          }}
        >
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: '请选择 Provider' }]}
          >
            <Select placeholder="选择 Provider" options={PROVIDER_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="scope"
            label="Scope（业务域）"
            rules={[{ required: true, message: '请选择 Scope' }]}
          >
            <Select placeholder="选择 Scope" options={SCOPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prev, cur) => prev.provider !== cur.provider}
            noStyle
          >
            {() => {
              const p = providerPricingForm.getFieldValue('provider') as string | undefined;
              const models = p ? modelsByProvider[p] || [] : [];
              const options = models.map((m) => ({ value: m, label: m }));
              return (
                <Form.Item
                  name="model_key"
                  label="模型键"
                  rules={[{ required: true, message: '请选择模型键' }]}
                >
                  <Select
                    showSearch
                    placeholder={p ? '选择模型键' : '请先选择 Provider'}
                    options={options}
                    disabled={!p}
                    filterOption={(input, option) =>
                      (option?.label as string).toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
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
              const mode = providerPricingForm.getFieldValue('charge_mode');
              if (mode !== 'token_based') {
                return (
                  <Form.Item
                    name="unit_price"
                    label="单价"
                    rules={[{ required: true, message: '请输入单价' }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                );
              }
              return (
                <>
                  <Form.Item
                    name="input_unit_price"
                    label="输入单价（每千 Token，USD）"
                    extra="可选，与输出单价同时填写时按输入/输出分别计费，更准确"
                  >
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="如 0.0003（$0.3/M 换算）" />
                  </Form.Item>
                  <Form.Item
                    name="output_unit_price"
                    label="输出单价（每千 Token，USD）"
                    extra="可选，与输入单价同时填写时按输入/输出分别计费"
                  >
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="如 0.0012（$1.2/M 换算）" />
                  </Form.Item>
                  <Form.Item
                    name="unit_price"
                    label="通用单价（每千 Token，兜底）"
                    extra="可选，未填写输入/输出单价时使用；若已填输入+输出单价可留空"
                  >
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="输入输出不区分时填写" />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
          <Form.Item name="currency" label="币种（Provider 成本币种）">
            <Select
              placeholder="选择币种"
              options={CURRENCY_OPTIONS}
              allowClear
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prev, cur) => prev.charge_mode !== cur.charge_mode}
            noStyle
          >
            {() => {
              const mode = providerPricingForm.getFieldValue('charge_mode');
              if (mode === 'token_based') {
                return (
                  <>
                    <Form.Item
                      name="platform_input_unit_price"
                      label="平台售价 — 输入单价（每千 Token，MXM-TOKEN）"
                      extra="与输出单价同时填写时按输入/输出分别计费"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} placeholder="如 5（每千 token 收取 5 MXM）" />
                    </Form.Item>
                    <Form.Item
                      name="platform_output_unit_price"
                      label="平台售价 — 输出单价（每千 Token，MXM-TOKEN）"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} placeholder="如 20（每千 token 收取 20 MXM）" />
                    </Form.Item>
                    <Form.Item
                      name="platform_unit_price"
                      label="平台售价 — 通用单价（每千 Token，兜底）"
                      extra="输入/输出单价未填时使用"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                );
              }
              return (
                <Form.Item
                  name="platform_unit_price"
                  label="平台售价 — 单价（MXM-TOKEN）"
                  extra={
                    mode === 'per_image' ? '每张图片收取的 MXM-TOKEN 数量' :
                    mode === 'per_second_audio' ? '每秒音频收取的 MXM-TOKEN 数量' :
                    mode === 'per_second_video' ? '每秒视频收取的 MXM-TOKEN 数量' :
                    '每次请求收取的 MXM-TOKEN 数量'
                  }
                >
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="如 50（每张图收 50 MXM）" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item
            name="platform_min_charge"
            label="最低扣费（MXM-TOKEN，0 = 不限）"
            extra="计算值低于此值时，按此值扣费"
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="如 10" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
