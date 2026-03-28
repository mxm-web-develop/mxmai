import type { TaskRunV2Request, TaskRunV2Response } from './types';
import { loadTaskDefinition } from './task-definition';
import { validateWithJsonSchema } from './schema-validator';
import { renderPromptFromTemplate } from './prompt-template';
import { runInputPipeline, type TaskContext } from './pipeline';
import { getResolvedRouting } from '../models/providers';
import { BillingService } from '../statistics/billing-service';
import { taskExecutor } from '../task/task-executor';

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

  ctx = await runInputPipeline(ctx, template.inputPipeline);

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
  if (scope !== 'writing' && scope !== 'outline') {
    throw new Error(`Task v2 暂未实现 scope=${scope} 的完整任务链路`);
  }

  const isOutlineScope = scope === 'outline';
  const computedRoutingKey = isOutlineScope
    ? taskKey.startsWith('outline-')
      ? taskKey
      : `outline-${taskKey}`
    : taskKey.startsWith('writing-')
      ? taskKey
      : `writing-${taskKey}`;

  const extraLogicalModelRaw = (template.extra as any)?.logicalModel;
  const extraLogicalModel =
    typeof extraLogicalModelRaw === 'string' && extraLogicalModelRaw.trim() ? extraLogicalModelRaw.trim() : undefined;

  // outline scope 下强制使用 outline-* 作为模型路由前缀，保证 TaskExecutor 分支与路由表一致
  const routingKey =
    isOutlineScope && extraLogicalModel && extraLogicalModel.startsWith('outline-')
      ? extraLogicalModel
      : computedRoutingKey;

  const resolved = getResolvedRouting(routingKey, (req.params.provider as any) ?? undefined);

  // 余额预检（与 /api/v1/writing/outline 的策略一致，估算 token）
  const paramsAny = ctx.params as Record<string, any>;
  const estOutputTokens = Math.ceil(Number(paramsAny.total_textcount || 1500) * 1.5);
  const balanceCheck = await BillingService.checkBalance({
    userId,
    provider: resolved.provider,
    modelKey: resolved.model,
    scope: isOutlineScope ? 'outline' : 'writing',
    estimatedOutputTokens: estOutputTokens,
    estimatedInputTokens: 1000,
  });
  if (!balanceCheck.allowed) {
    const err: any = new Error(
      `余额不足，本次预计消耗约 ${balanceCheck.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheck.currentBalance}`,
    );
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  const taskManager = taskExecutor.getTaskManager();
  const createRes = await taskManager.createTask({
    type: isOutlineScope ? 'outline' : 'writing',
    model: routingKey, // DB 中记录业务逻辑模型名，便于 Admin 配置与监控
    provider: resolved.provider as any,
    params: {
      // 兼容现有 writing-task / task-executor：通过 taskType=outline 走大纲链路
      taskType: 'outline',
      prompt: finalPromptEnhanced, // 方便 DB prompt 字段展示（含 KB 增强）
      params: {
        ...paramsAny,
        writing_type: paramsAny.writing_type || 'outlines',
        prompt: finalPromptEnhanced,
        useConfiguredPrompt: true, // v2：generateOutline 使用 params.prompt 作为唯一 prompt，不拼接硬编码
        ...(isOutlineScope ? { logicalModel: routingKey } : {}),
      },
      userId,
      provider: resolved.provider,
    },
    userId,
    storeToMinio: false,
  });

  // 传 routingKey 使 task-executor 进入 outline 分支，产出 outline 结构；
  // 物理模型在 generateOutline 内 selectModelWithRouting 解析
  taskExecutor.executeTask({
    taskId: createRes.taskId,
    modelName: routingKey,
    provider: resolved.provider as any,
    params: {
      taskType: 'outline',
      prompt: finalPromptEnhanced,
      params: {
        ...paramsAny,
        writing_type: paramsAny.writing_type || 'outlines',
        prompt: finalPromptEnhanced,
        useConfiguredPrompt: true,
        ...(isOutlineScope ? { logicalModel: routingKey } : {}),
      },
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

