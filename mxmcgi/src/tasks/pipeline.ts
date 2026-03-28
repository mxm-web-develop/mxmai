import type { PipelineStep, TaskContext } from './types';
import { getSensitiveWordsForSlot } from '../prompts/sensitive-resolver';
import { containsSensitiveWords } from '../sensitive/check';
import {
  retrieveKnowledge,
  formatKnowledgeContext,
  enhancePromptWithKnowledge,
  type KnowledgeBaseConfig,
} from '../core/writing/knowledge-enhancer';
import {
  registerInputStep,
  registerOutputStep,
} from './pipeline-registry';

export type { TaskContext } from './pipeline-registry';

export { runInputPipeline, runOutputPipeline } from './pipeline-registry';

// ---- 内置最小 step（第一版只提供 no-op / 兼容性） ----

registerInputStep('noop', async (ctx) => ctx);
registerOutputStep('noop', async (ctx) => ctx);

/**
 * sensitiveCheck:
 * - 从 DB/回退词表获取敏感词（按 scope/taskKey/subtype）
 * - 检查 params.prompt（默认）或 step.params.paths 指定的字段
 * - 命中则抛错（由上层返回 400）
 */
registerInputStep('sensitiveCheck', async (ctx: TaskContext, step: PipelineStep) => {
  const { scope, taskKey, subtype } = ctx;
  const sensitives = await getSensitiveWordsForSlot(scope, taskKey, subtype ?? null);

  const paths = (step.params?.paths as string[] | undefined) ?? ['prompt'];
  for (const p of paths) {
    const v = (ctx.params as any)?.[p];
    if (typeof v === 'string' && v.trim()) {
      if (containsSensitiveWords(v, sensitives)) {
        throw new Error('你提交的内容涉及敏感内容，请检查');
      }
    }
  }
  return ctx;
});

/**
 * knowledgeRetrieve:
 * - 根据 step.params.knowledgeBases 或 template/params 指定的知识库 id 列表进行召回
 * - 将召回内容注入 ctx.state.knowledgeContext / ctx.state.enhancedPrompt
 * - 默认对 ctx.state.finalPrompt（若存在）或 params.prompt 做增强
 */
registerInputStep('knowledgeRetrieve', async (ctx: TaskContext, step: PipelineStep) => {
  const userId = ctx.userId;
  const query =
    (typeof (ctx.params as any)?.prompt === 'string' ? String((ctx.params as any).prompt) : '').trim();
  if (!query) return ctx;

  const kbIds =
    (step.params?.knowledgeBaseIds as string[] | undefined) ??
    (step.params?.defaultKnowledgeBaseIds as string[] | undefined) ??
    [];
  if (!Array.isArray(kbIds) || kbIds.length === 0) return ctx;

  const limit = typeof step.params?.limit === 'number' ? step.params.limit : 5;

  const knowledgeBases: KnowledgeBaseConfig[] = kbIds.map((id) => ({
    knowledgeBaseId: String(id),
    query,
    limit,
  }));

  const results = await retrieveKnowledge(knowledgeBases, userId);
  const knowledgeContext = formatKnowledgeContext(results, knowledgeBases);
  if (!knowledgeContext) return ctx;

  // 注入 state，供后续 prompt 渲染/执行使用
  const mergedState = {
    ...ctx.state,
    knowledgeContext,
  };

  // 如果上游已经把最终 prompt 放到了 state.finalPrompt，则直接增强它；否则增强 params.prompt
  const stateFinalPrompt = typeof (ctx.state as any)?.finalPrompt === 'string' ? String((ctx.state as any).finalPrompt) : '';
  if (stateFinalPrompt) {
    (mergedState as any).finalPrompt = enhancePromptWithKnowledge(stateFinalPrompt, knowledgeContext);
  } else {
    (mergedState as any).enhancedPrompt = enhancePromptWithKnowledge(query, knowledgeContext);
  }

  return { ...ctx, state: mergedState };
});

// ─────────────────────────────────────────────────────────────────────────────
// 初始化 LLM Step 插件（在所有内置 step 注册之后）
// ─────────────────────────────────────────────────────────────────────────────
import { setupLLMSteps } from './pipeline-llm-plugin';
setupLLMSteps();
