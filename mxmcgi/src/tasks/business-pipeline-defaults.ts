import type { BusinessPipelineConfig, JsonSchemaV2, PipelineStep, TaskScope, TaskTemplate } from './types';
import { collectContextFieldDescriptors, readContextResolvePhase } from './context-field-resolver';

function hasContextFieldsForPhase(formSchema: JsonSchemaV2 | undefined, phase: 'pre' | 'post'): boolean {
  return collectContextFieldDescriptors(formSchema).some(
    (d) => readContextResolvePhase(d.fieldSchema) === phase
  );
}

function hasKnowledgeRetrieve(template: TaskTemplate): boolean {
  // knowledgeRetrieve 保留给 Smartflow；Task V2 业务管线不再自动注入
  void template;
  return false;
}

function synthesizeGraphNestedTextStep(
  template: TaskTemplate,
  rowExtra?: Record<string, unknown> | null
): PipelineStep | null {
  const pre = template.pipeline?.pre ?? [];
  const explicit = pre.find(
    (s) =>
      s.step === 'nestedText' &&
      (s.params?.graphPreFormat === true || s.params?.afterPromptRender === true) &&
      typeof s.nestedTextTaskKey === 'string' &&
      s.nestedTextTaskKey.trim()
  );
  if (explicit) {
    return {
      ...explicit,
      params: { graphPreFormat: true, afterPromptRender: true, ...explicit.params },
      inputMapping: explicit.inputMapping ?? { prompt: '${state.finalPrompt}' },
    };
  }

  const ptkRaw =
    (typeof rowExtra?.promptTextTaskKey === 'string' ? rowExtra.promptTextTaskKey : '') ||
    (typeof template.extra?.promptTextTaskKey === 'string' ? template.extra.promptTextTaskKey : '');
  const ptk = ptkRaw.trim();
  if (!ptk || !ptk.startsWith('text/')) return null;
  return {
    step: 'nestedText',
    nestedTextTaskKey: ptk,
    params: { graphPreFormat: true, afterPromptRender: true },
    inputMapping: { prompt: '${state.finalPrompt}' },
  };
}

function migrateLegacyPipeline(template: TaskTemplate): BusinessPipelineConfig | undefined {
  const pre = template.pipeline?.pre ?? template.inputPipeline;
  const enrich = template.pipeline?.enrich;
  const post = template.pipeline?.post ?? template.outputPipeline;
  if (pre?.length || enrich?.length || post?.length) {
    return {
      pre: pre ? [...pre] : undefined,
      enrich: enrich ? [...enrich] : undefined,
      post: post ? [...post] : undefined,
    };
  }
  return template.pipeline;
}

/** 构建 scope 默认 pre/post，并与业务 pipeline 合并 */
export function mergeEffectivePipeline(
  scope: TaskScope | string,
  template: TaskTemplate,
  rowExtra?: Record<string, unknown> | null
): { pre: PipelineStep[]; enrich: PipelineStep[]; post: PipelineStep[] } {
  const formSchema = template.formSchema;
  const migrated = migrateLegacyPipeline(template);
  const explicitPre = migrated?.pre ?? [];
  const explicitEnrich = migrated?.enrich ?? [];
  const explicitPost = migrated?.post ?? [];

  const defaultPre: PipelineStep[] = [];

  if (hasContextFieldsForPhase(formSchema, 'pre')) {
    defaultPre.push({ step: 'resolveContextFields', params: { phase: 'pre' } });
  }

  if (hasKnowledgeRetrieve(template)) {
    defaultPre.push({
      step: 'knowledgeRetrieve',
      params: {
        knowledgeBaseIds: template.knowledge!.defaultKnowledgeBaseIds,
        limit: 5,
      },
    });
  }

  if (scope === 'graph') {
    const nested = synthesizeGraphNestedTextStep(template, rowExtra);
    if (nested && !explicitPre.some((s) => s.step === 'nestedText' && s.nestedTextTaskKey === nested.nestedTextTaskKey)) {
      defaultPre.push(nested);
    }
  }

  const defaultPost: PipelineStep[] = [];
  if (hasContextFieldsForPhase(formSchema, 'post')) {
    defaultPost.push({ step: 'resolveContextFields', params: { phase: 'post' } });
  }

  const mergeSteps = (
    defaults: PipelineStep[],
    overrides: PipelineStep[],
    phase: 'pre' | 'post'
  ): PipelineStep[] => {
    if (overrides.length === 0) return defaults;

    const merged = [...overrides];

    // Schema / graph 派生步骤：显式 pipeline 不能覆盖掉（如 intel_kb / intel_web → resolveContextFields）
    for (const d of defaults) {
      if (d.step === 'resolveContextFields') {
        const stepPhase = (d.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
        const covered = merged.some(
          (s) =>
            s.step === 'resolveContextFields' &&
            ((s.params?.phase as string | undefined) ?? 'pre') === stepPhase
        );
        if (!covered) {
          const afterSensitive = merged.findIndex((s) => s.step === 'sensitiveCheck');
          if (afterSensitive >= 0) merged.splice(afterSensitive + 1, 0, d);
          else merged.unshift(d);
        }
      } else if (d.step === 'nestedText' && d.params?.graphPreFormat === true) {
        const key = d.nestedTextTaskKey;
        if (!merged.some((s) => s.step === 'nestedText' && s.nestedTextTaskKey === key)) {
          merged.push(d);
        }
      }
    }

    return merged;
  };

  return {
    pre: mergeSteps(defaultPre, explicitPre, 'pre'),
    enrich: explicitEnrich,
    post: mergeSteps(defaultPost, explicitPost, 'post'),
  };
}

export function normalizeTaskTemplatePipeline(
  template: TaskTemplate,
  scope: TaskScope | string,
  rowExtra?: Record<string, unknown> | null
): void {
  const merged = mergeEffectivePipeline(scope, template, rowExtra);
  template.pipeline = {
    pre: merged.pre.length ? merged.pre : undefined,
    enrich: merged.enrich.length ? merged.enrich : undefined,
    post: merged.post.length ? merged.post : undefined,
  };
  delete template.inputPipeline;
  delete template.outputPipeline;
}
