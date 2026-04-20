import { randomUUID } from 'node:crypto';
import type { TaskRunV2Request, TaskRunV2Response } from './types';
import { loadTaskDefinition } from './task-definition';
import { validateWithJsonSchema } from './schema-validator';
import { renderPromptFromTemplate } from './prompt-template';
import type { TaskContext } from './types';
import { runFixedTaskV2Prelude } from './task-v2-prelude';
import { getResolvedRouting } from '../models/providers';
import type { GenerateResult } from '../models/providers';
import { BillingService } from '../statistics/billing-service';
import { UsageService } from '../statistics/usage-service';
import { taskExecutor } from '../task/task-executor';

function pickGenerateDefaultsFromTemplate(template: any): Partial<Record<'temperature' | 'maxTokens' | 'topP', number>> {
  const raw = template?.extra?.generateParams ?? template?.extra?.llmParams ?? template?.extra?.generationParams;
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Record<'temperature' | 'maxTokens' | 'topP', number>> = {};
  const t = (raw as any).temperature;
  const mt = (raw as any).maxTokens;
  const tp = (raw as any).topP;
  if (typeof t === 'number' && Number.isFinite(t)) out.temperature = t;
  if (typeof mt === 'number' && Number.isFinite(mt)) out.maxTokens = mt;
  if (typeof tp === 'number' && Number.isFinite(tp)) out.topP = tp;
  return out;
}

function mergeGenerateDefaults<T extends Record<string, any>>(
  params: T,
  defaults: Partial<Record<'temperature' | 'maxTokens' | 'topP', number>>
): T {
  const next: Record<string, any> = { ...params };
  for (const k of ['temperature', 'maxTokens', 'topP'] as const) {
    if (next[k] === undefined && defaults[k] !== undefined) {
      next[k] = defaults[k];
    }
  }
  return next as T;
}

export async function runTaskV2(req: TaskRunV2Request, userId?: string): Promise<TaskRunV2Response> {
  const { scope, taskKey, subtype } = req;
  const { template } = await loadTaskDefinition({ scope, taskKey, subtype: subtype ?? null, lang: 'zh' });

  validateWithJsonSchema(template.formSchema, req.params);

  let ctx: TaskContext = {
    scope,
    taskKey,
    subtype: subtype ?? null,
    userId,
    taskId: '',
    params: req.params,
    state: {},
  };

  ctx = await runFixedTaskV2Prelude(ctx, template);

  const { finalPrompt } = renderPromptFromTemplate({
    prompt: template.prompt,
    paramsSchema: template.formSchema,
    params: ctx.params,
    contextVars: {
      userId: userId ?? '',
      taskId: '',
      uuid: '',
      timestamp: Date.now(),
      date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    },
  });
  const finalPromptEnhanced =
    typeof (ctx.state as any)?.finalPrompt === 'string' && String((ctx.state as any).finalPrompt).trim()
      ? String((ctx.state as any).finalPrompt).trim()
      : finalPrompt;

  // v2 接入完整链路：余额预检 -> 创建 cgi_tasks -> 异步执行 -> 费用/用量由 TaskExecutor 内部统一处理
  if (!userId) {
    throw new Error('Missing userId');
  }

  const prefix = scope;
  const computedRoutingKey = taskKey.startsWith(`${prefix}-`) ? taskKey : `${prefix}-${taskKey}`;

  const extraLogicalModelRaw = (template.extra as any)?.logicalModel;
  const extraLogicalModel =
    typeof extraLogicalModelRaw === 'string' && extraLogicalModelRaw.trim() ? extraLogicalModelRaw.trim() : undefined;

  // 若配置显式 logicalModel，且与 scope 前缀一致，则优先使用
  const routingKey =
    extraLogicalModel && extraLogicalModel.startsWith(`${prefix}-`)
      ? extraLogicalModel
      : computedRoutingKey;

  // 路由解析：优先内存覆盖；若未命中（常见于多实例/热重载导致的覆盖未加载），再从 DB 兜底读取并回填内存。
  const preferredProvider = (req.params.provider as any) ?? undefined;
  let resolved = getResolvedRouting(routingKey, preferredProvider);
  if (!resolved.fromRouting) {
    try {
      const { getSupabaseClient } = await import('@mxmai/mxmdata');
      const { setRoutingOverride } = await import('../models/providers');
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('model_routing_overrides')
        .select('logical_model, provider, model')
        .eq('logical_model', routingKey)
        .maybeSingle();
      if (!error && row && row.provider && row.model) {
        setRoutingOverride(routingKey, { provider: row.provider as any, model: row.model });
        resolved = getResolvedRouting(routingKey, preferredProvider);
      }
    } catch {
      // ignore DB fallback errors; keep original resolved
    }
  }

  // 余额预检（按 provider_pricing.platform_* 估算；不同 scope 的单位不同）
  const paramsAny = ctx.params as Record<string, any>;
  const templateGenerateDefaults = pickGenerateDefaultsFromTemplate(template as any);
  const paramsWithDefaults = mergeGenerateDefaults(paramsAny, templateGenerateDefaults);
  const estOutputTokens = Math.ceil(Number(paramsAny.total_textcount || 1500) * 1.5);
  const estInputTokens = 1000;
  const estImageCount = Math.max(0, Number(paramsAny.image_count ?? paramsAny.n ?? 1) || 0);
  const durRaw = paramsAny.total_duration_seconds ?? paramsAny.duration ?? paramsAny.duration_sec ?? paramsAny.seconds;
  const estSeconds = Math.max(0, Number(durRaw ?? 0) || 0);
  const estRequestCount = 1;

  const estimated = (() => {
    if (scope === 'writing' || scope === 'outline' || scope === 'text') {
      return { estimatedInputTokens: estInputTokens, estimatedOutputTokens: estOutputTokens, estimatedRequestCount: 1 };
    }
    if (scope === 'graph') {
      return { estimatedImageCount: estImageCount > 0 ? estImageCount : 1, estimatedRequestCount: 1 };
    }
    if (scope === 'audio') {
      return { estimatedAudioSeconds: estSeconds, estimatedRequestCount: 1 };
    }
    if (scope === 'music') {
      return { estimatedAudioSeconds: estSeconds, estimatedRequestCount: 1 };
    }
    if (scope === 'video') {
      return { estimatedVideoSeconds: estSeconds, estimatedRequestCount: 1 };
    }
    return { estimatedRequestCount: estRequestCount };
  })();
  const balanceCheck = await BillingService.checkBalance({
    userId,
    provider: resolved.provider,
    modelKey: resolved.model,
    scope,
    ...estimated,
  });
  if (!balanceCheck.allowed) {
    const err: any = new Error(
      `余额不足，本次预计消耗约 ${balanceCheck.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheck.currentBalance}`,
    );
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  // scope=text：同步调用模型，不落 cgi_tasks、不触发任务通知；用量与扣费与异步任务一致
  if (scope === 'text') {
    const syncId = `text-${randomUUID()}`;
    const paramsForGen = {
      ...paramsWithDefaults,
      prompt: finalPromptEnhanced,
      useConfiguredPrompt: true,
      logicalModel: routingKey,
    };
    // text 业务：routingKey 是「业务逻辑模型名」（如 text-plan），实际调用必须使用 resolved.model（物理模型 key）
    // 否则会把 text-plan 当作物理模型去 provider_models 查，导致“未找到模型”。
    if (!resolved.fromRouting || !resolved.model || typeof resolved.model !== 'string') {
      throw new Error(
        `未配置业务模型路由覆盖：logicalModel=${routingKey}。` +
          `请在 Admin「模型与定价」中为该业务保存 provider/model（将写入 model_routing_overrides）。`
      );
    }
    const physicalModelKey = resolved.model;
    const result = await taskExecutor.callModelGenerate(physicalModelKey, paramsForGen, resolved.provider as any);

    const extractText = (r: GenerateResult): string | undefined => {
      const t = (r as { text?: string }).text;
      if (typeof t === 'string' && t.trim()) return t;
      const mt = r.metadata?.text;
      if (typeof mt === 'string' && mt.trim()) return mt;
      if (Array.isArray(r.mediaUrls) && r.mediaUrls.length && typeof r.mediaUrls[0] === 'string' && !r.mediaUrls[0].startsWith('http')) {
        return r.mediaUrls[0];
      }
      return undefined;
    };

    const finalMetadata: Record<string, unknown> = {
      ...(result.metadata || {}),
      model: result.metadata?.model ?? resolved.model,
      provider: result.metadata?.provider ?? resolved.provider,
      text: extractText(result),
      taskType: 'text',
    };

    const { costUsd } = await UsageService.logProviderUsage({
      taskId: syncId,
      userId,
      logicalModel: routingKey,
      result: {
        ...result,
        metadata: finalMetadata as GenerateResult['metadata'],
      },
      providerOverride: finalMetadata.provider as any,
    });

    const usageMeta = finalMetadata as Record<string, any>;
    const inferredScope = UsageService.inferScopePublic(routingKey, usageMeta);
    try {
      await BillingService.consumeForTask({
        taskId: syncId,
        userId,
        provider: String(finalMetadata.provider || 'unknown'),
        modelKey: String(finalMetadata.model || resolved.model),
        scope: inferredScope,
        inputTokens: Number(usageMeta.usage?.prompt_tokens ?? usageMeta.usage?.input_tokens ?? 0),
        outputTokens: Number(usageMeta.usage?.completion_tokens ?? usageMeta.usage?.output_tokens ?? 0),
        totalTokens: Number(usageMeta.usage?.total_tokens ?? 0),
        imageCount: 0,
        audioSeconds: 0,
        videoSeconds: 0,
        requestCount: 1,
        providerCostUsd: costUsd,
      });
    } catch (billingErr) {
      console.warn('[TaskV2/text] consumeForTask failed:', billingErr);
    }

    return {
      success: true,
      taskId: syncId,
      status: 'completed',
      scope,
      taskKey,
      subtype: subtype ?? null,
      syncResult: {
        text: extractText(result),
        metadata: finalMetadata,
      },
    };
  }

  const taskManager = taskExecutor.getTaskManager();
  const createRes = await taskManager.createTask({
    type: scope,
    model: routingKey, // DB 中记录业务逻辑模型名，便于 Admin 配置与监控
    provider: resolved.provider as any,
    params: {
      ...(scope === 'outline'
        ? {
            // 兼容现有 writing-task / task-executor：通过 taskType=outline 走大纲链路
            taskType: 'outline',
            prompt: finalPromptEnhanced,
            params: {
              ...paramsWithDefaults,
              writing_type: paramsAny.writing_type || 'outlines',
              prompt: finalPromptEnhanced,
              useConfiguredPrompt: true,
              logicalModel: routingKey,
            },
          }
        : scope === 'writing'
          ? {
              taskType: 'writing',
              prompt: finalPromptEnhanced,
              params: {
                ...paramsWithDefaults,
                prompt: finalPromptEnhanced,
                useConfiguredPrompt: true,
              },
            }
          : scope === 'graph'
            ? {
                taskType: 'graph',
                graphType: String(taskKey || ''),
                prompt: finalPromptEnhanced,
                params: {
                  ...paramsWithDefaults,
                  prompt: finalPromptEnhanced,
                  useConfiguredPrompt: true,
                  logicalModel: routingKey,
                  graphType: String(taskKey || ''),
                },
              }
            : {
                taskType: scope,
                prompt: finalPromptEnhanced,
                params: {
                  ...paramsWithDefaults,
                  prompt: finalPromptEnhanced,
                  useConfiguredPrompt: true,
                  logicalModel: routingKey,
                },
              }),
      userId,
      provider: resolved.provider,
    },
    userId,
    storeToMinio: false,
  });

  // 传 routingKey 使 task-executor 进入对应分支（outline-/writing-/graph- 等）
  taskExecutor.executeTask({
    taskId: createRes.taskId,
    modelName: routingKey,
    provider: resolved.provider as any,
    params: {
      ...(scope === 'outline'
        ? {
            taskType: 'outline',
            prompt: finalPromptEnhanced,
            params: {
              ...paramsWithDefaults,
              writing_type: paramsAny.writing_type || 'outlines',
              prompt: finalPromptEnhanced,
              useConfiguredPrompt: true,
              logicalModel: routingKey,
            },
          }
        : scope === 'writing'
          ? {
              taskType: 'writing',
              prompt: finalPromptEnhanced,
              params: { ...paramsWithDefaults, prompt: finalPromptEnhanced, useConfiguredPrompt: true },
            }
          : scope === 'graph'
            ? {
                taskType: 'graph',
                graphType: String(taskKey || ''),
                prompt: finalPromptEnhanced,
                params: {
                  ...paramsWithDefaults,
                  prompt: finalPromptEnhanced,
                  useConfiguredPrompt: true,
                  logicalModel: routingKey,
                  graphType: String(taskKey || ''),
                },
              }
            : {
                taskType: scope,
                prompt: finalPromptEnhanced,
                params: { ...paramsWithDefaults, prompt: finalPromptEnhanced, useConfiguredPrompt: true, logicalModel: routingKey },
              }),
      userId,
      provider: resolved.provider,
    },
    userId,
    storeToMinio: false,
  }).catch((e) => {
    console.error('[TaskV2] executeTask failed:', e);
  });

  return {
    success: true,
    taskId: createRes.taskId,
    status: createRes.status,
    scope,
    taskKey,
    subtype: subtype ?? null,
  };
}

