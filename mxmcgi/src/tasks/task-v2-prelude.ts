/**
 * Task v2 固定前置链（替代可配置 inputPipeline）：
 * 敏感词 → 知识库（按 template.knowledge）→ 将 enhancedPrompt 并入 params 供模板渲染
 */
import type { TaskContext, TaskTemplate } from './types';
import { getInputRunner } from './pipeline-registry';
import './pipeline';

export async function runFixedTaskV2Prelude(ctx: TaskContext, template: TaskTemplate): Promise<TaskContext> {
  const sens = getInputRunner('sensitiveCheck');
  if (!sens) {
    throw new Error('internal: sensitiveCheck step not registered');
  }
  let next = await sens(ctx, { step: 'sensitiveCheck', params: { paths: ['prompt'] } });

  const kb = template.knowledge;
  if (kb?.useKnowledge && Array.isArray(kb.defaultKnowledgeBaseIds) && kb.defaultKnowledgeBaseIds.length > 0) {
    const kr = getInputRunner('knowledgeRetrieve');
    if (kr) {
      next = await kr(next, {
        step: 'knowledgeRetrieve',
        params: { knowledgeBaseIds: kb.defaultKnowledgeBaseIds, limit: 5 },
      });
    }
  }

  const stateFp =
    typeof (next.state as any)?.finalPrompt === 'string' ? String((next.state as any).finalPrompt).trim() : '';
  const ep =
    typeof (next.state as any)?.enhancedPrompt === 'string'
      ? String((next.state as any).enhancedPrompt).trim()
      : '';

  if (ep && !stateFp) {
    next = {
      ...next,
      params: { ...next.params, prompt: ep },
    };
  }

  return next;
}
