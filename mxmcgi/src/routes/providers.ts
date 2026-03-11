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
import { listModels } from '../models/registry';
import { getSupabaseClient } from '@mxmai/mxmdata';

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

router.use(requireAdmin);

/** GET 配置选项：各 provider 可选模型列表，供 Admin 切换业务对应 provider/模型时下拉使用 */
router.get('/options', (_req: Request, res: Response) => {
  try {
    const allModels = listModels();
    const modelsByProvider: Record<string, string[]> = {};
    const modelsByProviderByScope: Record<string, Record<string, string[]>> = {};

    for (const def of allModels) {
      const provider = def.provider;
      const scope = def.scope;
      const key = def.modelKey;

      if (!modelsByProvider[provider]) {
        modelsByProvider[provider] = [];
      }
      if (!modelsByProvider[provider].includes(key)) {
        modelsByProvider[provider].push(key);
      }

      if (!modelsByProviderByScope[provider]) {
        modelsByProviderByScope[provider] = {};
      }
      if (!modelsByProviderByScope[provider][scope]) {
        modelsByProviderByScope[provider][scope] = [];
      }
      if (!modelsByProviderByScope[provider][scope].includes(key)) {
        modelsByProviderByScope[provider][scope].push(key);
      }
    }

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

/** GET 统计：?provider=deer&window=1h */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider as ProviderType | undefined;
    const window = (req.query.window as string) || '1h';
    const list = await getProviderStats({ provider, window });
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

    // 1. 按 provider + model_key 聚合 usage
    const { data: usageAgg, error: usageError } = await supabase
      .from('provider_usage_records')
      .select(
        `
        provider,
        model_key,
        input_tokens:sum(input_tokens),
        output_tokens:sum(output_tokens),
        total_tokens:sum(total_tokens),
        image_count:sum(image_count),
        audio_seconds:sum(audio_seconds),
        video_seconds:sum(video_seconds),
        request_count:count(*)
      `,
      )
      .gte('created_at', fromIso)
      .group('provider, model_key');

    if (usageError) {
      res.status(500).json({
        success: false,
        error: 'Failed to query provider_usage_records',
        message: usageError.message,
      });
      return;
    }

    const rows = (usageAgg || []) as Array<{
      provider: string;
      model_key: string;
      input_tokens: number | null;
      output_tokens: number | null;
      total_tokens: number | null;
      image_count: number | null;
      audio_seconds: number | null;
      video_seconds: number | null;
      request_count: number | null;
    }>;

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
    const { provider, service, key_value, priority } = req.body as {
      provider?: string;
      service?: string | null;
      key_value?: string;
      priority?: number;
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

export default router;
