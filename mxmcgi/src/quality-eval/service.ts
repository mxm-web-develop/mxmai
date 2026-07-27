/**
 * 质量评估编排：resolve → score → maybe attribute → persist
 */

import { RepositoryFactory, pickDisplayLocalizedString } from '@mxmai/mxmdata';
import { attributePipeline } from './attributor';
import { buildBusinessContext, scoreArticle } from './scorer';
import { resolveSource } from './source-resolver';
import * as store from './store';
import type {
  QualityEvalRun,
  QualityEvalSourceKind,
  QualityEvalSourceRef,
} from './types';
import {
  DEFAULT_QUALITY_EVAL_MODEL,
  DEFAULT_QUALITY_EVAL_PROVIDER,
  MAX_STORED_ARTICLE_CHARS,
} from './types';

async function loadBusinessDisplayContext(
  scope: string,
  taskKey: string,
  subtype: string
): Promise<{ displayBrief: string; formFieldTitles: string[] }> {
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey(scope, taskKey, subtype ?? null);
    if (!row) return { displayBrief: '', formFieldTitles: [] };

    const extra = (row.extra || {}) as Record<string, unknown>;
    const display = (extra.display || {}) as Record<string, unknown>;
    const taskLabel = pickDisplayLocalizedString(
      display.taskLabel as string | undefined,
      display.taskLabelI18n as Record<string, string> | null | undefined,
      'zh'
    );
    const subtypeLabel = pickDisplayLocalizedString(
      display.subtypeLabel as string | undefined,
      display.subtypeLabelI18n as Record<string, string> | null | undefined,
      'zh'
    );
    const description = pickDisplayLocalizedString(
      display.description as string | undefined,
      display.descriptionI18n as Record<string, string> | null | undefined,
      'zh'
    );

    const displayBrief = [taskLabel, subtypeLabel, description].filter(Boolean).map(String).join(' · ');

    const taskTemplate = (extra.taskTemplate || {}) as Record<string, unknown>;
    const formSchema = (taskTemplate.formSchema || {}) as { properties?: Record<string, { title?: string }> };
    const formFieldTitles = Object.values(formSchema.properties || {})
      .map((p) => p?.title)
      .filter((t): t is string => typeof t === 'string' && !!t.trim());

    return { displayBrief, formFieldTitles };
  } catch (e) {
    console.warn('[quality-eval] loadBusinessDisplayContext failed:', e instanceof Error ? e.message : e);
    return { displayBrief: '', formFieldTitles: [] };
  }
}

export async function runQualityEval(args: {
  scope?: string;
  taskKey: string;
  subtype: string;
  sourceKind: QualityEvalSourceKind;
  sourceRef?: QualityEvalSourceRef | null;
  text?: string;
  modelOverride?: { provider?: string; modelKey?: string };
  createdBy?: string | null;
  /** 无 rubric 时用临时维度（不应常发生） */
  skipRubricRequire?: boolean;
}): Promise<QualityEvalRun> {
  const scope = args.scope || 'writing';
  const rubric = await store.getRubric(scope, args.taskKey, args.subtype);
  if (!rubric || !rubric.is_active) {
    throw new Error(`未配置评分标准：请先在「评分配置」为 ${args.taskKey}/${args.subtype} 保存维度`);
  }

  const provider = args.modelOverride?.provider || rubric.provider || DEFAULT_QUALITY_EVAL_PROVIDER;
  const modelKey = args.modelOverride?.modelKey || rubric.model_key || DEFAULT_QUALITY_EVAL_MODEL;

  const resolved = await resolveSource({
    sourceKind: args.sourceKind,
    sourceRef: args.sourceRef,
    text: args.text,
  });

  const storedArticle =
    resolved.text.length > MAX_STORED_ARTICLE_CHARS
      ? resolved.text.slice(0, MAX_STORED_ARTICLE_CHARS)
      : resolved.text;

  let run = await store.createRun({
    rubricId: rubric.id,
    scope,
    taskKey: args.taskKey,
    subtype: args.subtype,
    sourceKind: args.sourceKind,
    sourceRef: resolved.sourceRef || args.sourceRef || null,
    articleText: storedArticle,
    articleTextTruncated: resolved.text.length > MAX_STORED_ARTICLE_CHARS ? storedArticle : resolved.text,
    isSystemGenerated: resolved.isSystemGenerated,
    modelProvider: provider,
    modelKey,
    createdBy: args.createdBy || null,
    status: 'scoring',
  });

  try {
    const { displayBrief, formFieldTitles } = await loadBusinessDisplayContext(
      scope,
      args.taskKey,
      args.subtype
    );
    const businessContext = buildBusinessContext({ rubric, displayBrief, formFieldTitles });

    const scores = await scoreArticle({
      rubric,
      article: resolved.text,
      businessContext,
      provider,
      modelKey,
      runId: run.id,
    });

    run = await store.updateRun(run.id, { status: 'scoring', scores });

    const hasFailed = scores.dimensions.some((d) => d.failed);
    if (resolved.isSystemGenerated && hasFailed && resolved.pipelineBundle) {
      run = await store.updateRun(run.id, { status: 'attributing' });
      const attribution = await attributePipeline({
        rubric,
        scores,
        pipelineBundle: resolved.pipelineBundle,
        provider,
        modelKey,
        runId: run.id,
      });
      run = await store.updateRun(run.id, {
        status: 'completed',
        scores,
        attribution,
        error: null,
      });
    } else {
      run = await store.updateRun(run.id, {
        status: 'completed',
        scores,
        attribution: resolved.isSystemGenerated
          ? { findings: [], summary: hasFailed ? '无可用管线摘要，跳过归因。' : '各维度达标，跳过归因。' }
          : {
              findings: [],
              summary: '非本系统生成稿件，仅完成文章类型与维度评估，不做管线归因。',
            },
        error: null,
      });
    }

    return run;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    run = await store.updateRun(run.id, { status: 'failed', error: msg });
    throw Object.assign(new Error(msg), { run });
  }
}

export async function reattributeRun(runId: string): Promise<QualityEvalRun> {
  const run = await store.getRunById(runId);
  if (!run) throw new Error('评估记录不存在');
  if (!run.scores) throw new Error('尚无评分结果，无法归因');
  if (!run.is_system_generated) throw new Error('非系统生成稿，无法归因');

  const taskId = run.source_ref?.taskId;
  if (!taskId) throw new Error('记录未关联 taskId');

  const rubric =
    (run.rubric_id ? await store.getRubricById(run.rubric_id) : null) ||
    (await store.getRubric(run.scope, run.task_key, run.subtype));
  if (!rubric) throw new Error('找不到对应评分配置');

  const resolved = await resolveSource({
    sourceKind: 'task',
    sourceRef: { taskId },
    text: run.article_text || undefined,
  });
  if (!resolved.pipelineBundle) throw new Error('无法构建管线摘要');

  await store.updateRun(runId, { status: 'attributing', error: null });
  try {
    const attribution = await attributePipeline({
      rubric,
      scores: run.scores,
      pipelineBundle: resolved.pipelineBundle,
      provider: run.model_provider || rubric.provider,
      modelKey: run.model_key || rubric.model_key,
      runId,
    });
    return store.updateRun(runId, { status: 'completed', attribution, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.updateRun(runId, { status: 'failed', error: msg });
    throw e;
  }
}

export { store as qualityEvalStore };
