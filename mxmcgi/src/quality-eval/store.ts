/**
 * quality_eval_rubrics / quality_eval_runs 仓储（Supabase）
 */

import { getSupabaseClient } from '@mxmai/mxmdata';
import type {
  ArticleScoreResult,
  AttributionResult,
  QualityEvalRubric,
  QualityEvalRubricUpsert,
  QualityEvalRun,
  QualityEvalRunStatus,
  QualityEvalSourceKind,
  QualityEvalSourceRef,
} from './types';
import { DEFAULT_QUALITY_EVAL_MODEL, DEFAULT_QUALITY_EVAL_PROVIDER } from './types';

function mapRubric(row: Record<string, unknown>): QualityEvalRubric {
  return {
    id: String(row.id),
    scope: String(row.scope || 'writing'),
    task_key: String(row.task_key),
    subtype: String(row.subtype),
    dimensions: Array.isArray(row.dimensions) ? (row.dimensions as QualityEvalRubric['dimensions']) : [],
    business_brief: String(row.business_brief ?? ''),
    provider: String(row.provider || DEFAULT_QUALITY_EVAL_PROVIDER),
    model_key: String(row.model_key || DEFAULT_QUALITY_EVAL_MODEL),
    auto_on_complete: Boolean(row.auto_on_complete),
    is_active: row.is_active !== false,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapRun(row: Record<string, unknown>): QualityEvalRun {
  return {
    id: String(row.id),
    rubric_id: row.rubric_id ? String(row.rubric_id) : null,
    scope: String(row.scope || 'writing'),
    task_key: String(row.task_key),
    subtype: String(row.subtype),
    source_kind: row.source_kind as QualityEvalSourceKind,
    source_ref: (row.source_ref as QualityEvalSourceRef) ?? null,
    article_text: row.article_text != null ? String(row.article_text) : null,
    article_text_truncated: row.article_text_truncated != null ? String(row.article_text_truncated) : null,
    is_system_generated: Boolean(row.is_system_generated),
    scores: (row.scores as ArticleScoreResult) ?? null,
    attribution: (row.attribution as AttributionResult) ?? null,
    model_provider: row.model_provider != null ? String(row.model_provider) : null,
    model_key: row.model_key != null ? String(row.model_key) : null,
    status: row.status as QualityEvalRunStatus,
    error: row.error != null ? String(row.error) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listRubrics(scope = 'writing'): Promise<QualityEvalRubric[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quality_eval_rubrics')
    .select('*')
    .eq('scope', scope)
    .order('task_key', { ascending: true })
    .order('subtype', { ascending: true });
  if (error) throw new Error(`listRubrics: ${error.message}`);
  return (data || []).map((r) => mapRubric(r as Record<string, unknown>));
}

export async function getRubric(
  scope: string,
  taskKey: string,
  subtype: string
): Promise<QualityEvalRubric | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quality_eval_rubrics')
    .select('*')
    .eq('scope', scope)
    .eq('task_key', taskKey)
    .eq('subtype', subtype)
    .maybeSingle();
  if (error) throw new Error(`getRubric: ${error.message}`);
  return data ? mapRubric(data as Record<string, unknown>) : null;
}

export async function getRubricById(id: string): Promise<QualityEvalRubric | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('quality_eval_rubrics').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getRubricById: ${error.message}`);
  return data ? mapRubric(data as Record<string, unknown>) : null;
}

export async function upsertRubric(input: QualityEvalRubricUpsert): Promise<QualityEvalRubric> {
  const scope = input.scope || 'writing';
  const dimensions = (input.dimensions || []).map((d) => ({
    key: String(d.key || '').trim(),
    label: String(d.label || d.key || '').trim(),
    description: String(d.description || '').trim(),
    weight: Number.isFinite(d.weight) ? Number(d.weight) : 1,
    failBelow: Number.isFinite(d.failBelow) ? Number(d.failBelow) : 60,
  })).filter((d) => d.key);

  if (!input.task_key?.trim() || !input.subtype?.trim()) {
    throw new Error('task_key 与 subtype 必填');
  }
  if (dimensions.length === 0) {
    throw new Error('至少配置一个评分维度');
  }

  const row = {
    scope,
    task_key: input.task_key.trim(),
    subtype: input.subtype.trim(),
    dimensions,
    business_brief: String(input.business_brief ?? ''),
    provider: (input.provider || DEFAULT_QUALITY_EVAL_PROVIDER).trim(),
    model_key: (input.model_key || DEFAULT_QUALITY_EVAL_MODEL).trim(),
    auto_on_complete: Boolean(input.auto_on_complete),
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quality_eval_rubrics')
    .upsert(row, { onConflict: 'scope,task_key,subtype' })
    .select('*')
    .single();
  if (error) throw new Error(`upsertRubric: ${error.message}`);
  return mapRubric(data as Record<string, unknown>);
}

export async function createRun(params: {
  rubricId: string | null;
  scope: string;
  taskKey: string;
  subtype: string;
  sourceKind: QualityEvalSourceKind;
  sourceRef: QualityEvalSourceRef | null;
  articleText: string;
  articleTextTruncated: string;
  isSystemGenerated: boolean;
  modelProvider: string;
  modelKey: string;
  createdBy: string | null;
  status?: QualityEvalRunStatus;
}): Promise<QualityEvalRun> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quality_eval_runs')
    .insert({
      rubric_id: params.rubricId,
      scope: params.scope,
      task_key: params.taskKey,
      subtype: params.subtype,
      source_kind: params.sourceKind,
      source_ref: params.sourceRef,
      article_text: params.articleText,
      article_text_truncated: params.articleTextTruncated,
      is_system_generated: params.isSystemGenerated,
      model_provider: params.modelProvider,
      model_key: params.modelKey,
      created_by: params.createdBy,
      status: params.status || 'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`createRun: ${error.message}`);
  return mapRun(data as Record<string, unknown>);
}

export async function updateRun(
  id: string,
  patch: {
    status?: QualityEvalRunStatus;
    scores?: ArticleScoreResult | null;
    attribution?: AttributionResult | null;
    error?: string | null;
    article_text?: string | null;
  }
): Promise<QualityEvalRun> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quality_eval_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateRun: ${error.message}`);
  return mapRun(data as Record<string, unknown>);
}

export async function getRunById(id: string): Promise<QualityEvalRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('quality_eval_runs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getRunById: ${error.message}`);
  return data ? mapRun(data as Record<string, unknown>) : null;
}

export async function listRuns(params?: {
  scope?: string;
  taskKey?: string;
  subtype?: string;
  limit?: number;
  offset?: number;
}): Promise<{ runs: QualityEvalRun[]; total: number }> {
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
  const offset = Math.max(params?.offset ?? 0, 0);
  const supabase = getSupabaseClient();
  let q = supabase
    .from('quality_eval_runs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (params?.scope) q = q.eq('scope', params.scope);
  if (params?.taskKey) q = q.eq('task_key', params.taskKey);
  if (params?.subtype) q = q.eq('subtype', params.subtype);
  const { data, error, count } = await q;
  if (error) throw new Error(`listRuns: ${error.message}`);
  return {
    runs: (data || []).map((r) => mapRun(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}
