/**
 * 系统信息路由
 * 提供模型配置信息查询、账户信息、账单查询等功能
 */

import { Router, Request, Response } from 'express';
import supportList, { ModelConfig, ChargeMode } from '../models/suport-list';
import { PPIOClient } from '../models/ppio/client';
import promptConfigRouter from './prompt-config';
import providersAdminRouter from './providers';
import sensitiveWordsAdminRouter from './sensitive-words';
import { getSupabaseClient } from '@mxmai/mxmdata';

const router = Router();

router.use('/prompt-config', promptConfigRouter);
router.use('/admin/providers', providersAdminRouter);
router.use('/admin/sensitive-words', sensitiveWordsAdminRouter);

/**
 * Admin 专用：系统统计
 * GET /system/admin/stats
 * 支持 query: days=30（每日用量天数，默认 30）, topLimit=10（Top 用户数量，默认 10）
 */
router.get('/admin/stats', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const supabase = getSupabaseClient();
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 7), 90);
    const topLimit = Math.min(Math.max(parseInt(req.query.topLimit as string) || 10, 5), 50);

    const [
      userCountRes,
      taskCountRes,
      statusRes,
      typeRes,
      dailyRes,
      topUsersRes,
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('cgi_tasks').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('cgi_tasks').select('status').is('deleted_at', null),
      supabase.from('cgi_tasks').select('task_type').is('deleted_at', null),
      supabase
        .rpc('admin_get_daily_task_stats', { p_days: days })
        .then((r) => {
          if (r.error) {
            console.warn('[System Route] admin_get_daily_task_stats RPC error:', r.error.message);
            return { data: [] };
          }
          return r;
        }),
      supabase
        .rpc('admin_get_top_users_by_usage', { p_limit: topLimit })
        .then((r) => {
          if (r.error) {
            console.warn('[System Route] admin_get_top_users_by_usage RPC error:', r.error.message);
            return { data: [] };
          }
          return r;
        }),
    ]);

    const taskCountByStatus: Record<string, number> = {};
    (statusRes.data || []).forEach((row: { status: string }) => {
      const s = row.status || 'unknown';
      taskCountByStatus[s] = (taskCountByStatus[s] || 0) + 1;
    });

    const taskCountByType: Record<string, number> = {};
    (typeRes.data || []).forEach((row: { task_type: string }) => {
      const t = row.task_type || 'unknown';
      taskCountByType[t] = (taskCountByType[t] || 0) + 1;
    });

    const dailyUsage = (dailyRes.data || []).map((row: { stat_date: string; task_count: number }) => ({
      date: row.stat_date,
      count: Number(row.task_count) || 0,
    }));

    const topUsersByUsage = (topUsersRes.data || []).map((row: { user_id: string; username: string; task_count: number }) => ({
      userId: row.user_id,
      username: row.username || row.user_id,
      taskCount: Number(row.task_count) || 0,
    }));

    if (process.env.NODE_ENV !== 'production') {
      console.log('[System Route] Admin stats:', {
        dailyUsageLen: dailyUsage.length,
        topUsersLen: topUsersByUsage.length,
        dailySample: dailyUsage.slice(0, 2),
        topSample: topUsersByUsage.slice(0, 2),
      });
    }

    return res.json({
      success: true,
      data: {
        userCount: userCountRes.count ?? 0,
        taskCount: taskCountRes.count ?? 0,
        taskCountByStatus,
        taskCountByType,
        dailyUsage,
        topUsersByUsage,
      },
    });
  } catch (error) {
    console.error('[System Route] 获取 Admin 统计失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get admin stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 检查用户是否为管理员
 * @param req Express 请求对象
 * @returns 是否为管理员
 */
async function isAdminUser(req: Request): Promise<boolean> {
  try {
    // 方法1: 从请求头获取用户角色（如果 Gateway 传递了）
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      return true;
    }

    // 方法2: 从请求头获取用户 ID，然后查询数据库
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return false;
    }

    // 尝试从数据库查询用户信息
    try {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      
      if (user && user.role === 'admin') {
        return true;
      }
    } catch (dbError) {
      // 如果数据库查询失败，记录日志但不影响流程
      console.warn('[System Route] 查询用户角色失败:', dbError);
    }

    return false;
  } catch (error) {
    console.warn('[System Route] 检查管理员权限失败:', error);
    return false;
  }
}

/**
 * 处理模型配置，根据是否为 admin 决定是否包含 provider_price
 */
function processModelConfig(
  config: ModelConfig | string,
  isAdmin: boolean
): {
  modelname: string;
  price: number;
  charge_mode: ChargeMode;
  currency: string;
  provider_price?: number;
} {
  // 如果是字符串格式（向后兼容），返回默认配置
  if (typeof config === 'string') {
    return {
      modelname: config,
      price: 0,
      charge_mode: ChargeMode.per_change_mode,
      currency: 'USD',
    };
  }

  // 如果是对象格式
  const result: {
    modelname: string;
    price: number;
    charge_mode: ChargeMode;
    currency: string;
    provider_price?: number;
  } = {
    modelname: config.modelname,
    price: config.price,
    charge_mode: config.charge_mode,
    currency: config.currency || 'USD',
  };

  // 只有管理员才能看到 provider_price
  if (isAdmin && config.provider_price !== undefined) {
    result.provider_price = config.provider_price;
  }

  return result;
}

/**
 * 获取模型配置信息
 * GET /system/models
 * 
 * 查询参数：
 * - category: 'graph' | 'text' | 'audio' (可选，不传则返回所有类别)
 * - provider: 'replicate' | 'ppio' | 'deer' (可选，不传则返回所有 provider)
 * 
 * 返回模型配置信息，admin 用户可以看到 provider_price
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const { category, provider } = req.query;
    const isAdmin = await isAdminUser(req);

    // 如果指定了 category 和 provider，只返回对应的配置
    if (category && provider) {
      const categoryKey = category as 'graph' | 'text' | 'audio';
      const providerKey = provider as 'replicate' | 'ppio' | 'deer';
      
      const providerModels = supportList[providerKey]?.[categoryKey];
      if (!providerModels) {
        return res.status(404).json({
          success: false,
          error: 'Not found',
          message: `No models found for provider "${providerKey}" and category "${categoryKey}"`,
        });
      }

      const result: Record<string, any> = {};
      for (const [modelName, config] of Object.entries(providerModels)) {
        result[modelName] = processModelConfig(config as ModelConfig | string, isAdmin);
      }

      return res.json({
        success: true,
        data: {
          [providerKey]: {
            [categoryKey]: result,
          },
        },
      });
    }

    // 如果只指定了 category，返回所有 provider 的该类别配置
    if (category) {
      const categoryKey = category as 'graph' | 'text' | 'audio';
      const result: Record<string, any> = {};

      for (const providerKey of ['replicate', 'ppio', 'deer'] as const) {
        const providerModels = supportList[providerKey]?.[categoryKey];
        if (providerModels) {
          result[providerKey] = {};
          result[providerKey][categoryKey] = {};
          for (const [modelName, config] of Object.entries(providerModels)) {
            result[providerKey][categoryKey][modelName] = processModelConfig(
              config as ModelConfig | string,
              isAdmin
            );
          }
        }
      }

      return res.json({
        success: true,
        data: result,
      });
    }

    // 如果只指定了 provider，返回该 provider 的所有类别配置
    if (provider) {
      const providerKey = provider as 'replicate' | 'ppio' | 'deer';
      const providerData = supportList[providerKey];
      if (!providerData) {
        return res.status(404).json({
          success: false,
          error: 'Not found',
          message: `Provider "${providerKey}" not found`,
        });
      }

      const result: Record<string, any> = {};
      for (const categoryKey of ['graph', 'text', 'audio'] as const) {
        const categoryModels = providerData[categoryKey];
        if (categoryModels) {
          result[categoryKey] = {};
          for (const [modelName, config] of Object.entries(categoryModels)) {
            result[categoryKey][modelName] = processModelConfig(
              config as ModelConfig | string,
              isAdmin
            );
          }
        }
      }

      return res.json({
        success: true,
        data: {
          [providerKey]: result,
        },
      });
    }

    // 如果都没有指定，返回所有配置
    const result: Record<string, any> = {};
    for (const providerKey of ['replicate', 'ppio', 'deer'] as const) {
      const providerData = supportList[providerKey];
      if (providerData) {
        result[providerKey] = {};
        for (const categoryKey of ['graph', 'text', 'audio'] as const) {
          const categoryModels = providerData[categoryKey];
          if (categoryModels) {
            result[providerKey][categoryKey] = {};
            for (const [modelName, config] of Object.entries(categoryModels)) {
              result[providerKey][categoryKey][modelName] = processModelConfig(
                config as ModelConfig | string,
                isAdmin
              );
            }
          }
        }
      }
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[System Route] 获取模型配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model configurations',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取账户信息
 * GET /system/account
 * 
 * 返回所有 provider 的账户信息（余额等）
 */
router.get('/account', async (_req: Request, res: Response) => {
  try {
    const result: {
      ppio?: {
        credit_balance?: number;
        allow_features?: string[];
        free_trial?: any;
        error?: string;
      };
      replicate?: {
        // Replicate 账户信息（待实现）
        error?: string;
      };
      deerapi?: {
        // DeerAPI 账户信息（待实现）
        error?: string;
      };
    } = {};

    // PPIO 账户信息
    try {
      const ppioClient = PPIOClient.fromEnv();
      const userInfo = await ppioClient.getUserInfo();
      result.ppio = {
        credit_balance: userInfo.credit_balance,
        allow_features: userInfo.allow_features,
        free_trial: userInfo.free_trial,
      };
      console.log('[System Route] PPIO 账户信息:', JSON.stringify(result.ppio, null, 2));
    } catch (error) {
      console.error('[System Route] PPIO 获取账户信息失败:', error);
      result.ppio = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Replicate 账户信息（待实现）
    // try {
    //   const replicateClient = ReplicateClient.fromEnv();
    //   // TODO: 实现 Replicate 账户信息查询
    //   result.replicate = {
    //     // ...
    //   };
    // } catch (error) {
    //   console.error('[System Route] Replicate 获取账户信息失败:', error);
    //   result.replicate = {
    //     error: error instanceof Error ? error.message : String(error),
    //   };
    // }

    // DeerAPI 账户信息（待实现）
    // try {
    //   const deerapiClient = DeerAPIClient.fromEnv();
    //   // TODO: 实现 DeerAPI 账户信息查询
    //   result.deerapi = {
    //     // ...
    //   };
    // } catch (error) {
    //   console.error('[System Route] DeerAPI 获取账户信息失败:', error);
    //   result.deerapi = {
    //     error: error instanceof Error ? error.message : String(error),
    //   };
    // }

    const response = {
      success: true,
      data: result,
    };
    console.log('[System Route] 账户信息响应:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('[System Route] 获取账户信息失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get account information',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 查询账单
 * GET /system/bills
 * 
 * 查询参数：
 * - cycleType: 'Hour' | 'Day' | 'Week' | 'Month' (PPIO)
 * - productCategory: 'llm' | 'gen_api' (PPIO)
 * - startTime: 开始时间（Unix 时间戳）
 * - endTime: 结束时间（Unix 时间戳）
 * 
 * 返回所有 provider 的账单信息
 */
router.get('/bills', async (req: Request, res: Response) => {
  try {
    const {
      cycleType,
      productCategory,
      startTime,
      endTime,
    } = req.query;

    const result: {
      ppio?: {
        bills?: Array<{
          userId: string;
          startTime: string;
          endTime: string;
          billingMethod: string | number;
          productName: string;
          category: string;
          ownerID: string;
          billNum0: string;
          billNum1: string;
          basePrice0: string;
          basePrice1: string;
          discountPrice0: string;
          discountPrice1: string;
          amount: string;
          voucherAmount: string;
          payAmount: string;
          payAmountDisplay?: number;
          pricePrecision: string | number;
          productId?: string;
          basePrice2?: string;
          basePrice3?: string;
          basePrice4?: string;
          discountPrice2?: string;
          discountPrice3?: string;
          discountPrice4?: string;
          billNum2?: string;
          billNum3?: string;
          billNum4?: string;
          llmSeries?: string;
        }>;
        summary?: {
          totalBills: number;
          totalAmount: string;
          totalPayAmount: string;
          totalVoucherAmount: string;
        };
        account?: {
          credit_balance: number;
          allow_features?: string[];
          free_trial?: any;
        };
        error?: string;
      };
      replicate?: {
        // Replicate 账单信息（待实现）
        error?: string;
      };
      deerapi?: {
        // DeerAPI 账单信息（待实现）
        error?: string;
      };
    } = {};

    // PPIO 账单查询
    try {
      const ppioClient = PPIOClient.fromEnv();
      
      // PPIO API 要求 cycleType 和 productCategory 必填
      // 如果用户没有提供参数，默认查询最近7天的所有主要类别数据
      const userCycleType = (cycleType as 'Hour' | 'Day' | 'Week' | 'Month' | undefined) || 'Day';
      const userProductCategory = productCategory as string | undefined;
      
      // 如果没有提供时间范围，默认查询最近7天
      let finalStartTime = startTime as string | undefined;
      let finalEndTime = endTime as string | undefined;
      if (!finalStartTime || !finalEndTime) {
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysAgo = now - (7 * 24 * 60 * 60);
        finalStartTime = finalStartTime || sevenDaysAgo.toString();
        finalEndTime = finalEndTime || now.toString();
        console.log('[System Route] 未提供时间范围，默认查询最近7天');
      }
      
      let allBills: any[] = [];
      
      if (userProductCategory && userProductCategory !== '') {
        // 用户指定了 productCategory，只查询指定的
        const queryParams = {
          cycleType: userCycleType,
          productCategory: userProductCategory,
          startTime: finalStartTime,
          endTime: finalEndTime,
        };
        
        console.log('[System Route] PPIO 账单查询参数（指定 category）:', JSON.stringify(queryParams, null, 2));
        const bills = await ppioClient.getBills(queryParams);
        allBills = bills.bills || [];
      } else {
        // 用户没有指定 productCategory，查询所有主要类别并合并
        const categoriesToQuery = ['llm', 'gen_api'];
        
        console.log('[System Route] 未指定 productCategory，查询所有类别:', categoriesToQuery);
        
        for (const category of categoriesToQuery) {
          try {
            const queryParams = {
              cycleType: userCycleType,
              productCategory: category,
              startTime: finalStartTime,
              endTime: finalEndTime,
            };
            
            console.log(`[System Route] 查询 ${category} 类别账单...`);
            const bills = await ppioClient.getBills(queryParams);
            if (bills.bills && bills.bills.length > 0) {
              allBills = allBills.concat(bills.bills);
            }
          } catch (error) {
            console.warn(`[System Route] 查询 ${category} 类别账单失败:`, error);
            // 继续查询其他类别
          }
        }
      }
      
      // 去重（根据 userId, startTime, endTime, productName）
      const uniqueBills = Array.from(
        new Map(
          allBills.map(bill => [
            `${bill.userId}-${bill.startTime}-${bill.endTime}-${bill.productName}`,
            bill
          ])
        ).values()
      );
      
      const bills = { bills: uniqueBills };
      
      // 计算汇总信息
      const summary = {
        totalBills: bills.bills?.length || 0,
        totalAmount: bills.bills?.reduce((sum, bill) => sum + parseFloat(bill.amount || '0'), 0).toString() || '0',
        totalPayAmount: bills.bills?.reduce((sum, bill) => sum + parseFloat(bill.payAmount || '0'), 0).toString() || '0',
        totalVoucherAmount: bills.bills?.reduce((sum, bill) => sum + parseFloat(bill.voucherAmount || '0'), 0).toString() || '0',
      };
      
      // 转换账单数据，确保类型匹配
      const formattedBills = bills.bills?.map(bill => ({
        userId: bill.userId,
        startTime: bill.startTime,
        endTime: bill.endTime,
        billingMethod: String(bill.billingMethod),
        productName: bill.productName,
        category: bill.category,
        ownerID: bill.ownerID,
        billNum0: bill.billNum0,
        billNum1: bill.billNum1,
        basePrice0: bill.basePrice0,
        basePrice1: bill.basePrice1,
        discountPrice0: bill.discountPrice0,
        discountPrice1: bill.discountPrice1,
        amount: bill.amount,
        voucherAmount: bill.voucherAmount,
        payAmount: bill.payAmount,
        payAmountDisplay: bill.payAmountDisplay,
        pricePrecision: String(bill.pricePrecision),
        productId: bill.productId,
        basePrice2: bill.basePrice2,
        basePrice3: bill.basePrice3,
        basePrice4: bill.basePrice4,
        discountPrice2: bill.discountPrice2,
        discountPrice3: bill.discountPrice3,
        discountPrice4: bill.discountPrice4,
        billNum2: bill.billNum2,
        billNum3: bill.billNum3,
        billNum4: bill.billNum4,
        llmSeries: bill.llmSeries,
      })) || [];
      
      // 获取账户余额信息
      let accountInfo: { credit_balance: number; allow_features?: string[]; free_trial?: any } | undefined;
      try {
        const userInfo = await ppioClient.getUserInfo();
        accountInfo = {
          credit_balance: userInfo.credit_balance,
          allow_features: userInfo.allow_features,
          free_trial: userInfo.free_trial,
        };
        console.log('[System Route] PPIO 账户余额:', userInfo.credit_balance);
      } catch (accountError) {
        console.warn('[System Route] 获取 PPIO 账户余额失败:', accountError);
        // 账户余额获取失败不影响账单查询结果
      }
      
      result.ppio = {
        bills: formattedBills,
        summary,
        account: accountInfo,
      };
      console.log('[System Route] PPIO 账单查询结果:', JSON.stringify({
        billCount: bills.bills?.length || 0,
        summary,
        bills: bills.bills,
      }, null, 2));
    } catch (error) {
      console.error('[System Route] PPIO 查询账单失败:', error);
      result.ppio = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Replicate 账单查询（待实现）
    // try {
    //   const replicateClient = ReplicateClient.fromEnv();
    //   // TODO: 实现 Replicate 账单查询
    //   result.replicate = {
    //     // ...
    //   };
    // } catch (error) {
    //   console.error('[System Route] Replicate 查询账单失败:', error);
    //   result.replicate = {
    //     error: error instanceof Error ? error.message : String(error),
    //   };
    // }

    // DeerAPI 账单查询（待实现）
    // try {
    //   const deerapiClient = DeerAPIClient.fromEnv();
    //   // TODO: 实现 DeerAPI 账单查询
    //   result.deerapi = {
    //     // ...
    //   };
    // } catch (error) {
    //   console.error('[System Route] DeerAPI 查询账单失败:', error);
    //   result.deerapi = {
    //     error: error instanceof Error ? error.message : String(error),
    //   };
    // }

    const response = {
      success: true,
      data: result,
    };
    console.log('[System Route] 账单查询响应:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('[System Route] 查询账单失败:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bills',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Admin 专用：Provider 定价（provider_pricing）CRUD
 * GET /system/admin/pricing/provider
 * PUT /system/admin/pricing/provider
 * DELETE /system/admin/pricing/provider/:id
 */
router.get('/admin/pricing/provider', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const supabase = getSupabaseClient();
    const { provider, scope } = req.query;
    let query = supabase.from('provider_pricing').select('*');
    if (provider) {
      query = query.eq('provider', String(provider));
    }
    if (scope) {
      query = query.eq('scope', String(scope));
    }
    query = query.order('provider', { ascending: true }).order('scope', { ascending: true }).order('model_key', {
      ascending: true,
    });
    const { data, error } = await query;
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch provider_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch provider_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.put('/admin/pricing/provider', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const {
      id,
      provider,
      scope,
      model_key,
      charge_mode,
      unit_price,
      currency,
      input_unit_price,
      output_unit_price,
      platform_unit_price,
      platform_input_unit_price,
      platform_output_unit_price,
      platform_min_charge,
      metadata,
    } = req.body as {
      id?: string;
      provider: string;
      scope: string;
      model_key: string;
      charge_mode: string;
      unit_price: number;
      currency?: string;
      input_unit_price?: number | null;
      output_unit_price?: number | null;
      platform_unit_price?: number | null;
      platform_input_unit_price?: number | null;
      platform_output_unit_price?: number | null;
      platform_min_charge?: number | null;
      metadata?: Record<string, unknown> | null;
    };

    if (!provider || !scope || !model_key || !charge_mode || unit_price == null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: provider, scope, model_key, charge_mode, unit_price',
      });
    }

    const pricingPayload = {
      provider,
      scope,
      model_key,
      charge_mode,
      unit_price,
      currency: currency || 'USD',
      input_unit_price: input_unit_price ?? null,
      output_unit_price: output_unit_price ?? null,
      platform_unit_price: platform_unit_price ?? null,
      platform_input_unit_price: platform_input_unit_price ?? null,
      platform_output_unit_price: platform_output_unit_price ?? null,
      platform_min_charge: platform_min_charge ?? null,
      metadata: metadata ?? null,
    };

    const supabase = getSupabaseClient();
    if (id) {
      const { data, error } = await supabase
        .from('provider_pricing')
        .update(pricingPayload)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update provider_pricing',
          message: error.message,
        });
      }
      return res.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from('provider_pricing')
      .insert(pricingPayload)
      .select('*')
      .maybeSingle();
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to insert provider_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to upsert provider_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/admin/pricing/provider/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id' });
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('provider_pricing').delete().eq('id', id);
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete provider_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete provider_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Admin 专用：业务定价（business_pricing）CRUD
 */
router.get('/admin/pricing/business', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const supabase = getSupabaseClient();
    const { business_type } = req.query;
    let query = supabase.from('business_pricing').select('*');
    if (business_type) {
      query = query.eq('business_type', String(business_type));
    }
    query = query.order('business_type', { ascending: true }).order('charge_metric', { ascending: true });
    const { data, error } = await query;
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch business_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch business_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.put('/admin/pricing/business', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const {
      id,
      business_type,
      charge_metric,
      price_in_tokens,
      min_charge_tokens,
      provider,
      model_key,
      subtype,
      metadata,
    } = req.body as {
      id?: string;
      business_type: string;
      charge_metric: string;
      price_in_tokens: number;
      min_charge_tokens?: number | null;
      provider?: string | null;
      model_key?: string | null;
      subtype?: string | null;
      metadata?: Record<string, unknown> | null;
    };

    if (!business_type || !charge_metric || price_in_tokens == null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: business_type, charge_metric, price_in_tokens',
      });
    }

    const supabase = getSupabaseClient();
    if (id) {
      const { data, error } = await supabase
        .from('business_pricing')
        .update({
          business_type,
          charge_metric,
          price_in_tokens,
          min_charge_tokens: min_charge_tokens ?? 0,
          provider: provider ?? null,
          model_key: model_key ?? null,
          subtype: subtype ?? null,
          metadata: metadata ?? null,
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update business_pricing',
          message: error.message,
        });
      }
      return res.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from('business_pricing')
      .insert({
        business_type,
        charge_metric,
        price_in_tokens,
        min_charge_tokens: min_charge_tokens ?? 0,
        provider: provider ?? null,
        model_key: model_key ?? null,
        subtype: subtype ?? null,
        metadata: metadata ?? null,
      })
      .select('*')
      .maybeSingle();
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to insert business_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to upsert business_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/admin/pricing/business/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id' });
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('business_pricing').delete().eq('id', id);
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete business_pricing',
        message: error.message,
      });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete business_pricing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
