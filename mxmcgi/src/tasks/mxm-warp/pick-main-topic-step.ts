/**
 * enrich 确定性步骤：pickMainTopic — 无 LLM。
 * 用户未指定目标字段时，按 topicChips 热度从多选源字段回填。
 *
 * params（均可选，默认兼容行业日报字段名）：
 * - sourceField?: 多选话题字段，默认 core_topic
 * - targetField?: 主话题字段，默认 main_topic
 * - chipsPath?: 默认 sources.websource.topicChips
 */
import type { PipelineStep, TaskContext } from '../types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';
import { getContract, withContract } from './input-stage';
import {
  ensureMainTopicInBasic,
  readTopicChipsFromWebsource,
  splitCoreTopics,
  pickMainTopicByHeat,
} from './pick-main-topic';

function readChipsByPath(contract: NonNullable<ReturnType<typeof getContract>>, chipsPath: string): string[] {
  const path = chipsPath.trim() || 'sources.websource.topicChips';
  if (path === 'sources.websource.topicChips' || path === 'websource.topicChips') {
    return readTopicChipsFromWebsource(contract.sources?.websource);
  }
  // 宽松：仅支持 sources.websource.topicChips 变体
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = contract;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return [];
    cur = (cur as Record<string, unknown>)[part];
  }
  if (Array.isArray(cur)) return cur.map((c) => String(c ?? '').trim()).filter(Boolean);
  return [];
}

export async function runPickMainTopicStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) return ctx;

  const params = (step.params ?? {}) as Record<string, unknown>;
  const sourceField = String(params.sourceField ?? 'core_topic').trim() || 'core_topic';
  const targetField = String(params.targetField ?? 'main_topic').trim() || 'main_topic';
  const chipsPath = String(params.chipsPath ?? 'sources.websource.topicChips').trim();

  const chips = readChipsByPath(contract, chipsPath);
  const basic = { ...(contract.basic ?? {}) };
  const ctxParams = (ctx.params ?? {}) as Record<string, unknown>;

  // 兼容旧路径：默认字段走 ensureMainTopicInBasic
  if (sourceField === 'core_topic' && targetField === 'main_topic') {
    const { basic: nextBasic, autoFilled } = ensureMainTopicInBasic(basic, {
      topicChips: chips,
      params: ctxParams,
    });
    const next = withContract(ctx, { ...contract, basic: nextBasic });
    if (autoFilled && nextBasic.main_topic) {
      return {
        ...next,
        params: {
          ...next.params,
          main_topic: nextBasic.main_topic,
        },
      };
    }
    return next;
  }

  const existing = String(basic[targetField] ?? ctxParams[targetField] ?? '').trim();
  if (existing) {
    return withContract(ctx, {
      ...contract,
      basic: { ...basic, [targetField]: existing },
    });
  }

  const selected = splitCoreTopics(basic[sourceField] ?? ctxParams[sourceField] ?? '');
  const picked = pickMainTopicByHeat({ selectedTopics: selected, topicChips: chips });
  if (!picked) {
    return withContract(ctx, { ...contract, basic });
  }

  return {
    ...withContract(ctx, {
      ...contract,
      basic: { ...basic, [targetField]: picked },
    }),
    params: {
      ...ctx.params,
      [targetField]: picked,
    },
  };
}

export function registerPickMainTopicStep(): void {
  registerInputStep('pickMainTopic', runPickMainTopicStep);
  registerOutputStep('pickMainTopic', runPickMainTopicStep);
}

registerPickMainTopicStep();
