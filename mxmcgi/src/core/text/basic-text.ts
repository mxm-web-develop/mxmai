import type { ProviderType, GenerateParams, GenerateResult } from '../providers/types';
import { getResolvedRouting } from '../providers/model-routing';
import { runByModelKey } from '../../models/run';
import { UsageService } from '../usage/usage-service';

export interface RunBasicTextOptions {
  userId?: string;
  /** 对应父级任务（graph / writing / video 等）的 taskId，用于账单关联 */
  parentTaskId?: string;
  /** 预留给未来 Flow 编排 */
  flowId?: string;
  /** 预留给未来 Flow 的单步标识 */
  flowStepId?: string;
  /** 强制指定 Provider（覆盖路由中的 provider） */
  providerOverride?: ProviderType;
  /** 透传给底层文本模型的附加参数（如 temperature、max_tokens 等） */
  llmParams?: Record<string, any>;
}

export interface RunBasicTextResult {
  text: string;
  /** 原始模型返回结果（含 usage / metadata 等） */
  usage: GenerateResult;
  /** Provider 侧实际成本（USD），来自 ProviderBalanceService 计算 */
  costUsd: number;
  /** 决策后的 Provider 与物理模型信息，便于上层追踪 */
  provider: ProviderType;
  model: string;
  logicalModel: string;
}

/**
 * BasicText 统一入口：
 * - 通过 model-routing 解析 logicalModel -> { provider, physicalModel }
 * - 调用 writing scope 下对应的文本模型
 * - 记录 provider_usage_records + 扣减 Provider 余额
 * - 返回标准 text + usage + costUsd
 *
 * 不创建独立 Task，仅通过 parentTaskId 与父任务关联。
 */
export async function runBasicText(
  logicalModel: string,
  prompt: string,
  options: RunBasicTextOptions = {}
): Promise<RunBasicTextResult> {
  const { userId, parentTaskId, flowId, flowStepId, providerOverride, llmParams } = options;

  // 1. 解析路由：logicalModel -> { provider, physicalModel }
  const resolved = getResolvedRouting(logicalModel, providerOverride);
  const provider = resolved.provider as ProviderType;
  const physicalModelKey = resolved.model;

  // 2. 调用文本模型（writing scope）
  const params: GenerateParams = {
    prompt,
    outputFormat: 'json',
    enableCollection: true,
    ...(llmParams || {}),
  };

  const result = await runByModelKey<GenerateParams, GenerateResult & { text?: string }>(
    'writing',
    physicalModelKey,
    params,
    { providerOverride: provider }
  );

  // 3. 统一补充 metadata，写入 logicalModel / provider / model / Flow 信息
  const metadata: Record<string, any> = {
    ...(result.metadata || {}),
    provider,
    model: physicalModelKey,
    logicalModel,
  };
  if (flowId) metadata.flowId = flowId;
  if (flowStepId) metadata.flowStepId = flowStepId;

  result.metadata = metadata;

  // 4. 记录 Provider usage + 扣减 Provider 余额
  const { costUsd } = await UsageService.logProviderUsage({
    taskId: parentTaskId,
    userId,
    logicalModel,
    result,
    providerOverride: provider,
  });

  // 5. 尽可能稳定地抽取文本内容
  let text: string | undefined = (result as any).text;
  if (!text && typeof metadata.text === 'string') {
    text = metadata.text;
  }
  if (!text && Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0) {
    text = result.mediaUrls.join('');
  }

  return {
    text: text ?? '',
    usage: result,
    costUsd,
    provider,
    model: physicalModelKey,
    logicalModel,
  };
}

