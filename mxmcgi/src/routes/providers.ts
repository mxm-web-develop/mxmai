/**
 * Admin 专用：Provider 路由、监控与余额（仅 admin 可访问）
 * GET/POST /system/admin/providers/routing
 * GET /system/admin/providers/stats
 * GET /system/admin/providers/billing
 */

import { Router, Request, Response } from 'express';
import {
  providerFactory,
  getFullRoutingTable,
  setRoutingOverride,
  clearRoutingOverride,
  getProviderStats,
  type ProviderType,
  type RoutingEntry,
} from '../models/providers';
import { getSupabaseClient } from '@mxmai/mxmdata';
import {
  resolveInferedModalityForConnectivityTest,
  runProviderConnectivityTest,
  type ConnectivityRequestPayload,
} from './provider-connectivity-test';

const router = Router();

async function requireAdmin(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      next();
      return;
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    if (user && user.role === 'admin') {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'Admin access required' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to check admin' });
  }
}

/** provider_models 变更后刷新内存目录，供连通性推断与 ProviderFactory 合并 */
async function refreshProviderModelCatalog(): Promise<void> {
  try {
    const { loadProviderModelCatalog } = await import('../models/provider-model-catalog');
    await loadProviderModelCatalog();
    const { providerFactory } = await import('../models/providers');
    await providerFactory.loadProviderCatalog();
  } catch (e) {
    console.warn('[providers] refreshProviderModelCatalog failed:', e instanceof Error ? e.message : String(e));
  }
}

function normalizeModalityByScope(
  scope: string,
  modality?: string | null
): 'text' | 'image' | 'audio' | 'video' | null {
  const s = String(scope || '').toLowerCase();
  if (s === 'graph') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'video') return 'video';
  if (s === 'text' || s === 'default' || s === 'writing' || s === 'outline') return 'text';
  const m = (modality ?? '').toLowerCase();
  if (m === 'text' || m === 'image' || m === 'audio' || m === 'video') return m;
  return null;
}

router.use(requireAdmin);

/** GET 配置选项：各 provider 可选模型列表，供 Admin 切换业务对应 provider/模型时下拉使用 */
router.get('/options', async (_req: Request, res: Response) => {
  try {
    const modelsByProvider: Record<string, string[]> = {};
    const modelsByProviderByScope: Record<string, Record<string, string[]>> = {};

    // 1. 优先从 provider_models 加载启用模型
    try {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const repo = RepositoryFactory.createProviderModelRepository();
      const dbModels = await repo.list({ onlyEnabled: true });
      for (const m of dbModels) {
        const provider = m.provider;
        const scope = m.scope;
        const key = m.model_key;
        if (!modelsByProvider[provider]) modelsByProvider[provider] = [];
        if (!modelsByProvider[provider].includes(key)) modelsByProvider[provider].push(key);
        if (!modelsByProviderByScope[provider]) modelsByProviderByScope[provider] = {};
        if (!modelsByProviderByScope[provider][scope]) modelsByProviderByScope[provider][scope] = [];
        if (!modelsByProviderByScope[provider][scope].includes(key)) {
          modelsByProviderByScope[provider][scope].push(key);
        }
      }
    } catch (_) {
      // 忽略 DB 错误，继续使用静态模型
    }

    // 纯动态模式：不再合并 registry 静态模型

    // 排序，保证下拉稳定
    for (const p of Object.keys(modelsByProvider)) {
      modelsByProvider[p].sort();
    }
    for (const p of Object.keys(modelsByProviderByScope)) {
      const scopes = modelsByProviderByScope[p];
      for (const s of Object.keys(scopes)) {
        scopes[s].sort();
      }
    }

    res.json({ success: true, data: { modelsByProvider, modelsByProviderByScope } });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET 当前路由表（默认 + 覆盖） */
router.get('/routing', (_req: Request, res: Response) => {
  try {
    const table = getFullRoutingTable();
    res.json({ success: true, data: table });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** 规范化 logicalModel 用于持久化：writing-outline 统一存为 writing-outlines */
function canonicalLogicalModel(key: string): string {
  return key === 'writing-outline' ? 'writing-outlines' : key;
}

/** POST 更新单条路由覆盖（持久化到 DB，重启不丢失） */
router.post('/routing', async (req: Request, res: Response) => {
  try {
    const { logicalModel, provider, model } = req.body as {
      logicalModel?: string;
      provider?: ProviderType;
      model?: string;
    };
    if (!logicalModel || !provider || !model) {
      res.status(400).json({
        success: false,
        error: 'Missing logicalModel, provider, or model',
      });
      return;
    }
    const canonical = canonicalLogicalModel(logicalModel);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('model_routing_overrides')
      .upsert(
        { logical_model: canonical, provider, model, updated_at: new Date().toISOString() },
        { onConflict: 'logical_model' }
      );
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to persist routing override',
        message: error.message,
      });
    }
    setRoutingOverride(logicalModel, { provider, model });
    res.json({ success: true, data: { logicalModel, provider, model } });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** DELETE 清除单条路由覆盖: ?logicalModel=xxx（同时从 DB 删除） */
router.delete('/routing', async (req: Request, res: Response) => {
  try {
    const logicalModel = req.query.logicalModel as string | undefined;
    if (!logicalModel) {
      res.status(400).json({ success: false, error: 'Missing query logicalModel' });
      return;
    }
    const canonical = canonicalLogicalModel(logicalModel);
    const supabase = getSupabaseClient();
    await supabase.from('model_routing_overrides').delete().eq('logical_model', canonical);
    clearRoutingOverride(logicalModel);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET 统计：?provider=deer&window=1h&groupBy=provider|provider_model|logical_model */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider as ProviderType | undefined;
    const window = (req.query.window as string) || '1h';
    const groupBy = req.query.groupBy as 'provider' | 'provider_model' | 'logical_model' | undefined;
    const list = await getProviderStats({ provider, window, groupBy });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

const BILLING_PROVIDERS: ProviderType[] = [
  'deer',
  'replicate',
  'ppio',
  'openai',
  'google',
  'anthropic',
  'qwen',
  'volc',
  'minimax',
];

/** GET 各 Provider 余额/用量汇总（含 Admin 手动录入余额） */
router.get('/billing', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const { data: balanceRows } = await supabase.from('provider_balances').select('provider, balance, currency');
    const balanceMap = new Map<string, { balance: number; currency: string }>();
    (balanceRows || []).forEach((r: any) => {
      balanceMap.set(r.provider, { balance: Number(r.balance || 0), currency: r.currency || 'USD' });
    });

    const results: Array<{
      provider: string;
      supported: boolean;
      totalLimit?: string | number;
      used?: string | number;
      resetAt?: string;
      manualBalance?: number;
      currency?: string;
    }> = [];
    for (const type of BILLING_PROVIDERS) {
      try {
        const p = providerFactory.tryGet(type);
        if (p && typeof (p as any).getBillingInfo === 'function') {
          const info = await (p as any).getBillingInfo();
          const out: any = {
            provider: info.provider,
            supported: info.supported,
            totalLimit: info.totalLimit,
            used: info.used,
            resetAt: info.resetAt,
          };
          const manual = balanceMap.get(type);
          if (manual) {
            out.manualBalance = manual.balance;
            out.currency = manual.currency;
          }
          results.push(out);
        } else {
          const manual = balanceMap.get(type);
          results.push({
            provider: type,
            supported: false,
            manualBalance: manual?.balance ?? undefined,
            currency: manual?.currency ?? 'USD',
          });
        }
      } catch (e) {
        const manual = balanceMap.get(type);
        results.push({
          provider: type,
          supported: false,
          manualBalance: manual?.balance ?? undefined,
          currency: manual?.currency ?? 'USD',
        });
      }
    }
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET 各 Provider 手动余额 */
router.get('/balances', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('provider_balances')
      .select('provider, balance, currency, updated_at')
      .order('provider');
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, data: data || [] });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PUT 设置 Provider 手动余额 */
router.put('/balances', async (req: Request, res: Response) => {
  try {
    const { provider, balance } = req.body as { provider: string; balance: number };
    if (!provider || typeof balance !== 'number') {
      return res.status(400).json({ success: false, error: 'Missing provider or balance' });
    }
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('provider_balances')
      .select('id')
      .eq('provider', provider)
      .maybeSingle();
    if (existing) {
      const { data, error } = await supabase
        .from('provider_balances')
        .update({ balance: Number(balance), updated_at: new Date().toISOString() })
        .eq('provider', provider)
        .select()
        .maybeSingle();
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data });
    }
    const { data, error } = await supabase
      .from('provider_balances')
      .insert({ provider, balance: Number(balance), currency: 'USD' })
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/**
 * GET Provider 成本统计
 * GET /system/admin/providers/costs?window=7d&groupBy=provider|model
 *
 * - window: 统计时间窗口，支持 1d / 7d / 15d / 30d，默认 7d
 * - groupBy:
 *    - provider: 按 provider 聚合成本
 *    - model: 按 provider + model_key 聚合成本
 */
router.get('/costs', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();

    const windowParam = (req.query.window as string) || '7d';
    const groupBy = (req.query.groupBy as 'provider' | 'model' | undefined) || 'provider';

    const windowMap: Record<string, number> = {
      '1d': 1,
      '7d': 7,
      '15d': 15,
      '30d': 30,
    };
    const days = windowMap[windowParam] || 7;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();

    // 1. 拉取时间窗内 usage 行，在内存中按 provider + model_key 聚合
    // （supabase-js / PostgREST 客户端不支持 .group()，原实现会在运行时抛错导致 500）
    const { data: usageRaw, error: usageError } = await supabase
      .from('provider_usage_records')
      .select(
        'provider, model_key, input_tokens, output_tokens, total_tokens, image_count, audio_seconds, video_seconds, request_count',
      )
      .gte('created_at', fromIso);

    if (usageError) {
      res.status(500).json({
        success: false,
        error: 'Failed to query provider_usage_records',
        message: usageError.message,
      });
      return;
    }

    type UsageAggRow = {
      provider: string;
      model_key: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      image_count: number;
      audio_seconds: number;
      video_seconds: number;
      request_count: number;
    };

    const aggByPair = new Map<string, UsageAggRow>();
    for (const r of usageRaw ?? []) {
      const row = r as Record<string, unknown>;
      const provider = String(row.provider ?? '');
      const modelKey = String(row.model_key ?? '');
      const key = `${provider}::${modelKey}`;
      const prev = aggByPair.get(key);
      const it = Number(row.input_tokens ?? 0) || 0;
      const ot = Number(row.output_tokens ?? 0) || 0;
      const tt = Number(row.total_tokens ?? 0) || 0;
      const ic = Number(row.image_count ?? 0) || 0;
      const asec = Number(row.audio_seconds ?? 0) || 0;
      const vsec = Number(row.video_seconds ?? 0) || 0;
      const rc = Number(row.request_count ?? 0) || 0;
      if (!prev) {
        aggByPair.set(key, {
          provider,
          model_key: modelKey,
          input_tokens: it,
          output_tokens: ot,
          total_tokens: tt,
          image_count: ic,
          audio_seconds: asec,
          video_seconds: vsec,
          request_count: rc,
        });
      } else {
        prev.input_tokens += it;
        prev.output_tokens += ot;
        prev.total_tokens += tt;
        prev.image_count += ic;
        prev.audio_seconds += asec;
        prev.video_seconds += vsec;
        prev.request_count += rc;
      }
    }

    const rows: Array<{
      provider: string;
      model_key: string;
      input_tokens: number | null;
      output_tokens: number | null;
      total_tokens: number | null;
      image_count: number | null;
      audio_seconds: number | null;
      video_seconds: number | null;
      request_count: number | null;
    }> = Array.from(aggByPair.values()).map((u) => ({
      provider: u.provider,
      model_key: u.model_key,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      total_tokens: u.total_tokens,
      image_count: u.image_count,
      audio_seconds: u.audio_seconds,
      video_seconds: u.video_seconds,
      request_count: u.request_count,
    }));

    if (rows.length === 0) {
      res.json({
        success: true,
        data: [],
        window: windowParam,
        groupBy,
      });
      return;
    }

    // 2. 读取 Provider 价格表，用于估算成本
    const { data: pricingRows, error: pricingError } = await supabase
      .from('provider_pricing')
      .select('*');

    if (pricingError) {
      res.status(500).json({
        success: false,
        error: 'Failed to query provider_pricing',
        message: pricingError.message,
      });
      return;
    }

    type PricingRow = {
      provider: string;
      scope: string;
      model_key: string;
      charge_mode: string;
      unit_price: number;
      input_unit_price: number | null;
      output_unit_price: number | null;
    };

    const pricingMap = new Map<string, PricingRow>();
    (pricingRows || []).forEach((p: any) => {
      const key = `${p.provider}::${p.model_key}`;
      if (!pricingMap.has(key)) {
        pricingMap.set(key, {
          provider: p.provider,
          scope: p.scope,
          model_key: p.model_key,
          charge_mode: p.charge_mode,
          unit_price: Number(p.unit_price || 0),
          input_unit_price: p.input_unit_price !== null ? Number(p.input_unit_price) : null,
          output_unit_price: p.output_unit_price !== null ? Number(p.output_unit_price) : null,
        });
      }
    });

    interface ModelCostRow {
      provider: string;
      model_key: string;
      requestCount: number;
      totalTokens: number;
      imageCount: number;
      audioSeconds: number;
      videoSeconds: number;
      estimatedCost: number;
      chargeMode: string;
    }

    const modelCostRows: ModelCostRow[] = [];

    for (const row of rows) {
      const key = `${row.provider}::${row.model_key}`;
      const pricing = pricingMap.get(key);
      const totalTokens = Number(row.total_tokens || 0);
      const imageCount = Number(row.image_count || 0);
      const audioSeconds = Number(row.audio_seconds || 0);
      const videoSeconds = Number(row.video_seconds || 0);
      const requestCount = Number(row.request_count || 0);

      let estimatedCost = 0;
      let chargeMode = pricing?.charge_mode || 'unknown';

      if (pricing) {
        switch (pricing.charge_mode) {
          case 'token_based': {
            const inputTokens = Number(row.input_tokens || 0);
            const outputTokens = Number(row.output_tokens || 0);
            const hasInputOutput =
              pricing.input_unit_price != null &&
              pricing.output_unit_price != null &&
              (inputTokens > 0 || outputTokens > 0);
            if (hasInputOutput) {
              estimatedCost =
                (inputTokens / 1000) * pricing.input_unit_price! +
                (outputTokens / 1000) * pricing.output_unit_price!;
            } else {
              const units = totalTokens > 0 ? totalTokens / 1000 : 0;
              estimatedCost = units * pricing.unit_price;
            }
            break;
          }
          case 'per_image': {
            estimatedCost = imageCount * pricing.unit_price;
            break;
          }
          case 'per_second_audio': {
            estimatedCost = audioSeconds * pricing.unit_price;
            break;
          }
          case 'per_second_video': {
            estimatedCost = videoSeconds * pricing.unit_price;
            break;
          }
          case 'per_request': {
            estimatedCost = requestCount * pricing.unit_price;
            break;
          }
          default: {
            chargeMode = pricing.charge_mode || 'unknown';
            break;
          }
        }
      }

      modelCostRows.push({
        provider: row.provider,
        model_key: row.model_key,
        requestCount,
        totalTokens,
        imageCount,
        audioSeconds,
        videoSeconds,
        estimatedCost,
        chargeMode,
      });
    }

    if (groupBy === 'model') {
      res.json({
        success: true,
        data: modelCostRows,
        window: windowParam,
        groupBy: 'model',
      });
      return;
    }

    // groupBy = provider：按 provider 汇总成本
    const byProvider: Record<
      string,
      {
        provider: string;
        requestCount: number;
        totalTokens: number;
        imageCount: number;
        audioSeconds: number;
        videoSeconds: number;
        estimatedCost: number;
      }
    > = {};

    for (const row of modelCostRows) {
      const p = row.provider;
      if (!byProvider[p]) {
        byProvider[p] = {
          provider: p,
          requestCount: 0,
          totalTokens: 0,
          imageCount: 0,
          audioSeconds: 0,
          videoSeconds: 0,
          estimatedCost: 0,
        };
      }
      const agg = byProvider[p];
      agg.requestCount += row.requestCount;
      agg.totalTokens += row.totalTokens;
      agg.imageCount += row.imageCount;
      agg.audioSeconds += row.audioSeconds;
      agg.videoSeconds += row.videoSeconds;
      agg.estimatedCost += row.estimatedCost;
    }

    res.json({
      success: true,
      data: Object.values(byProvider),
      window: windowParam,
      groupBy: 'provider',
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET Provider API Keys 列表（脱敏，仅 Admin） */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderApiKeyRepository();
    const provider = req.query.provider as string | undefined;
    const service = req.query.service as string | undefined;
    const list = await repo.listMasked({ provider, service: service ?? null });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST 新增 Key（body: provider, service?, key_value, priority?） */
router.post('/keys', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { provider, service, key_value, priority, is_active } = req.body as {
      provider?: string;
      service?: string | null;
      key_value?: string;
      priority?: number;
      /** 默认启用；仅当显式传 false 时创建为停用 */
      is_active?: boolean;
    };
    if (!provider || !key_value || typeof key_value !== 'string') {
      res.status(400).json({ success: false, error: 'Missing provider or key_value' });
      return;
    }
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderApiKeyRepository();
    const created = await repo.create({
      provider: provider as 'deer' | 'replicate' | 'ppio',
      service: service ?? null,
      key_value,
      priority,
      is_active: typeof is_active === 'boolean' ? is_active : true,
      updated_by: userId ?? null,
    });
    res.json({
      success: true,
      data: {
        id: created.id,
        provider: created.provider,
        service: created.service,
        key_masked: '***' + (created.key_value.length > 4 ? created.key_value.slice(-4) : ''),
        priority: created.priority,
        is_active: created.is_active,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PUT 更新 Key（改 priority / is_active） */
router.put('/keys/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { priority, is_active } = req.body as { priority?: number; is_active?: boolean };
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderApiKeyRepository();
    const updated = await repo.update(req.params.id, { priority, is_active, updated_by: userId ?? null });
    res.json({
      success: true,
      data: {
        id: updated.id,
        provider: updated.provider,
        service: updated.service,
        key_masked: '***' + (updated.key_value.length > 4 ? updated.key_value.slice(-4) : ''),
        priority: updated.priority,
        is_active: updated.is_active,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** DELETE 删除 Key */
router.delete('/keys/:id', async (req: Request, res: Response) => {
  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderApiKeyRepository();
    await repo.delete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// ========== Provider 物理模型目录 (provider_models) ==========

/** GET 物理模型列表：?provider=deer&scope=text&onlyEnabled=true&page=1&pageSize=20 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider as string | undefined;
    const scope = req.query.scope as string | undefined;
    const onlyEnabled = req.query.onlyEnabled === 'true' || req.query.onlyEnabled === '1';
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || 20), 10)));

    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderModelRepository();
    let list = await repo.list({ provider, scope, onlyEnabled: onlyEnabled || undefined });
    list = list.map((m) => ({
      ...m,
      modality: normalizeModalityByScope(m.scope, m.modality),
    }));

    // 最近一次连通性测试状态（可选展示）
    try {
      const supabase = getSupabaseClient();
      const ids = list.map((m) => m.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: runs } = await supabase
          .from('provider_model_test_runs')
          .select('provider_model_id, success, latency_ms, error_message, created_at')
          .in('provider_model_id', ids)
          .order('created_at', { ascending: false });
        const latestById = new Map<string, any>();
        for (const r of (runs || []) as any[]) {
          const k = String(r.provider_model_id);
          if (!latestById.has(k)) latestById.set(k, r);
        }
        list = list.map((m: any) => ({
          ...m,
          latest_test: latestById.get(String(m.id)) ?? null,
        }));
      }
    } catch (e) {
      // 表不存在或无权限时不阻塞列表
      console.warn('[providers] load latest provider_model_test_runs failed:', e instanceof Error ? e.message : String(e));
    }
    const total = list.length;
    const offset = (page - 1) * pageSize;
    list = list.slice(offset, offset + pageSize);

    res.json({ success: true, data: list, total, page, pageSize });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET 某物理模型的最近测试记录：?limit=20 */
router.get('/models/:id/tests', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10)));
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('provider_model_test_runs')
      .select('*')
      .eq('provider_model_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({ success: true, data: data || [] });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

/** POST 创建物理模型 */
router.post('/models', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      provider: string;
      scope: string;
      model_key: string;
      upstream_model?: string | null;
      protocol?: string | null;
      modality?: string | null;
      io_schema?: string | null;
      display_name?: string | null;
      description?: string | null;
      capabilities?: Record<string, unknown> | null;
      default_parameters?: Record<string, unknown> | null;
      is_enabled?: boolean;
    };
    if (!body.provider || !body.scope || !body.model_key) {
      res.status(400).json({ success: false, error: 'Missing provider, scope, or model_key' });
      return;
    }
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderModelRepository();
    const created = await repo.upsert({
      provider: body.provider,
      scope: body.scope,
      model_key: body.model_key,
      upstream_model: body.upstream_model ?? null,
      protocol: body.protocol ?? null,
      modality: normalizeModalityByScope(body.scope, body.modality),
      io_schema: body.io_schema ?? null,
      display_name: body.display_name ?? null,
      description: body.description ?? null,
      capabilities: body.capabilities ?? null,
      default_parameters: body.default_parameters ?? null,
      is_enabled: body.is_enabled ?? true,
    });
    await refreshProviderModelCatalog();
    res.json({
      success: true,
      data: { ...created, modality: normalizeModalityByScope(created.scope, created.modality) },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PUT 更新物理模型 */
router.put('/models/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const body = req.body as {
      provider?: string;
      scope?: string;
      model_key?: string;
      upstream_model?: string | null;
      protocol?: string | null;
      modality?: string | null;
      io_schema?: string | null;
      display_name?: string | null;
      description?: string | null;
      capabilities?: Record<string, unknown> | null;
      default_parameters?: Record<string, unknown> | null;
      is_enabled?: boolean;
    };
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderModelRepository();
    const existing = await repo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Model not found' });
      return;
    }
    if (body.provider !== undefined && body.provider !== existing.provider) {
      res.status(400).json({ success: false, error: '不允许修改 provider' });
      return;
    }
    if (body.model_key !== undefined && body.model_key !== existing.model_key) {
      res.status(400).json({ success: false, error: '不允许修改 model_key' });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (body.scope !== undefined) patch.scope = body.scope;
    if (body.upstream_model !== undefined) patch.upstream_model = body.upstream_model;
    if (body.protocol !== undefined) patch.protocol = body.protocol;
    if (body.modality !== undefined || body.scope !== undefined) {
      patch.modality = normalizeModalityByScope(
        body.scope ?? existing.scope,
        body.modality ?? existing.modality
      );
    }
    if (body.io_schema !== undefined) patch.io_schema = body.io_schema;
    if (body.display_name !== undefined) patch.display_name = body.display_name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.capabilities !== undefined) patch.capabilities = body.capabilities;
    if (body.default_parameters !== undefined) patch.default_parameters = body.default_parameters;
    if (body.is_enabled !== undefined) patch.is_enabled = body.is_enabled;

    const newScope = patch.scope !== undefined ? (patch.scope as string) : existing.scope;
    if (patch.scope !== undefined && patch.scope !== existing.scope) {
      const duplicate = await repo.findByKey({
        provider: existing.provider,
        scope: newScope,
        model_key: existing.model_key,
      });
      if (duplicate && duplicate.id !== id) {
        const mergePatch: Record<string, unknown> = { ...patch };
        delete mergePatch.scope;
        if (Object.keys(mergePatch).length > 0) {
          await repo.update(duplicate.id, mergePatch);
        }
        const supabase = getSupabaseClient();
        const { error: pricingErr } = await supabase
          .from('provider_pricing')
          .delete()
          .eq('provider', existing.provider)
          .eq('scope', existing.scope)
          .eq('model_key', existing.model_key);
        if (pricingErr) {
          res.status(500).json({
            success: false,
            error: `合并重复记录时删除旧 Provider 成本行失败: ${pricingErr.message}`,
          });
          return;
        }
        await repo.deleteById(id);
        await refreshProviderModelCatalog();
        const finalRow = await repo.findById(duplicate.id);
        res.json({
          success: true,
          data: finalRow
            ? { ...finalRow, modality: normalizeModalityByScope(finalRow.scope, finalRow.modality) }
            : null,
          merged: true,
          message:
            '已存在相同 provider + scope + model_key 的记录：已将本次编辑合并到该记录，并删除重复的物理模型行。',
        });
        return;
      }
    }

    const updated = await repo.update(id, patch);
    await refreshProviderModelCatalog();
    res.json({
      success: true,
      data: { ...updated, modality: normalizeModalityByScope(updated.scope, updated.modality) },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** DELETE 物理模型：永久删除行，并删除同 provider+scope+model_key 的 provider_pricing（停用请用 PUT is_enabled=false） */
router.delete('/models/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderModelRepository();
    const existing = await repo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Model not found' });
      return;
    }
    const supabase = getSupabaseClient();
    const { error: pricingErr } = await supabase
      .from('provider_pricing')
      .delete()
      .eq('provider', existing.provider)
      .eq('scope', existing.scope)
      .eq('model_key', existing.model_key);
    if (pricingErr) {
      res.status(500).json({
        success: false,
        error: `删除关联定价失败: ${pricingErr.message}`,
      });
      return;
    }
    await repo.deleteById(id);
    await refreshProviderModelCatalog();
    res.json({ success: true, data: { id, deleted: true } });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST 连通性测试：body 为 provider_model_id 或 { provider, model_key, scope } */
router.post('/models/test', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      provider_model_id?: string;
      provider?: string;
      model_key?: string;
      scope?: string;
    };
    let provider: string;
    let modelKey: string;
    let scope: string;
    let modality: string | null = null;
    const steps: Array<{
      key: string;
      title: string;
      status: 'pending' | 'running' | 'success' | 'failed';
      detail?: string;
      at: string;
    }> = [];
    const pushStep = (
      key: string,
      title: string,
      status: 'pending' | 'running' | 'success' | 'failed',
      detail?: string
    ) => {
      steps.push({ key, title, status, detail, at: new Date().toISOString() });
    };

    let providerModelId: string | null = null;
    if (body.provider_model_id) {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const repo = RepositoryFactory.createProviderModelRepository();
      const m = await repo.findById(body.provider_model_id);
      if (!m) {
        res.status(404).json({ success: false, error: 'Provider model not found' });
        return;
      }
      providerModelId = m.id;
      provider = m.provider;
      modelKey = m.model_key;
      scope = m.scope;
      modality = m.modality ?? null;
    } else if (body.provider && body.model_key && body.scope) {
      provider = body.provider;
      modelKey = body.model_key;
      scope = body.scope;
      modality = null;
      try {
        const { RepositoryFactory } = await import('@mxmai/mxmdata');
        const repo = RepositoryFactory.createProviderModelRepository();
        const m = await repo.findByKey({ provider, scope, model_key: modelKey });
        providerModelId = m?.id ?? null;
      } catch {
        providerModelId = null;
      }
    } else {
      res.status(400).json({
        success: false,
        error: 'Provide provider_model_id or (provider, model_key, scope)',
      });
      return;
    }

    const start = Date.now();
    let success = false;
    let errorMessage: string | null = null;
    let requestPayload: ConnectivityRequestPayload | null = null;
    let responseMeta: Record<string, unknown> | null = null;

    try {
      const inferredModality = resolveInferedModalityForConnectivityTest(
        provider,
        modelKey,
        scope,
        modality
      );
      pushStep(
        'prepare',
        '构造最小测试请求',
        'success',
        `scope=${scope}, modality=${inferredModality}, provider=${provider}, model=${modelKey}`
      );
      pushStep('connect', '检查 Provider 与模型支持', 'running');
      const p = providerFactory.tryGet(provider as ProviderType);
      if (!p || !p.supportsModel(modelKey)) {
        pushStep('connect', '检查 Provider 与模型支持', 'failed', 'Provider 不支持该模型');
        errorMessage = `Provider ${provider} does not support model ${modelKey}`;
      } else {
        pushStep('connect', '检查 Provider 与模型支持', 'success');
        const outcome = await runProviderConnectivityTest({
          provider,
          modelKey,
          inferredModality,
          p,
          pushStep,
        });
        success = outcome.success;
        responseMeta = outcome.responseMeta ?? null;
        requestPayload = outcome.requestPayload;
        if (!success) {
          errorMessage = outcome.error ?? '连通性测试失败';
        }
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      steps.push({
        key: 'invoke',
        title: '发送最小测试请求',
        status: 'failed',
        detail: errorMessage,
        at: new Date().toISOString(),
      });
    }

    const latencyMs = Date.now() - start;
    pushStep(
      'done',
      '测试完成',
      success ? 'success' : 'failed',
      success ? `耗时 ${latencyMs}ms` : (errorMessage || '测试失败')
    );

    // 写入测试记录（不影响返回）
    try {
      if (providerModelId) {
        const inferred = String(requestPayload?.inferredModality ?? modality ?? 'text');
        const supabase = getSupabaseClient();
        await supabase.from('provider_model_test_runs').insert({
          provider_model_id: providerModelId,
          provider,
          scope,
          model_key: modelKey,
          inferred_modality: inferred,
          success,
          latency_ms: latencyMs,
          error_message: errorMessage,
          request_payload: requestPayload,
          response_meta: responseMeta,
          steps,
        });
      }
    } catch (e) {
      console.warn('[providers] insert provider_model_test_runs failed:', e instanceof Error ? e.message : String(e));
    }

    res.json({
      success: true,
      data: {
        success,
        latencyMs,
        error: errorMessage,
        provider,
        model_key: modelKey,
        scope,
        modality: requestPayload?.inferredModality ?? modality ?? null,
        requestPayload,
        responseMeta,
        steps,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
