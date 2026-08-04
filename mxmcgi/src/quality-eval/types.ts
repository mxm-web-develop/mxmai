/**
 * 写作质量评估 — 类型定义
 */

export type QualityEvalSourceKind = 'task' | 'folder_item' | 'paste';

export type QualityEvalRunStatus =
  | 'pending'
  | 'scoring'
  | 'attributing'
  | 'completed'
  | 'failed';

export interface QualityEvalDimension {
  key: string;
  label: string;
  description: string;
  /** 权重，默认 1；总分按加权平均 */
  weight: number;
  /** 低于此分视为不及格，触发归因（0-100） */
  failBelow: number;
}

export interface QualityEvalRubric {
  id: string;
  scope: string;
  task_key: string;
  subtype: string;
  dimensions: QualityEvalDimension[];
  business_brief: string;
  provider: string;
  model_key: string;
  auto_on_complete: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QualityEvalRubricUpsert {
  scope?: string;
  task_key: string;
  subtype: string;
  dimensions: QualityEvalDimension[];
  business_brief?: string;
  provider?: string;
  model_key?: string;
  auto_on_complete?: boolean;
  is_active?: boolean;
}

export interface DimensionScore {
  key: string;
  label: string;
  score: number;
  failed: boolean;
  evidence: string[];
  comment: string;
}

export interface ArticleScoreResult {
  overall: number;
  summary: string;
  dimensions: DimensionScore[];
  articleTypeFit: string;
}

export interface AttributionStepFinding {
  step: string;
  phase?: string;
  severity: 'high' | 'medium' | 'low';
  relatedDimensions: string[];
  reason: string;
  suggestion: string;
}

export interface AttributionResult {
  findings: AttributionStepFinding[];
  summary: string;
}

export interface QualityEvalSourceRef {
  taskId?: string;
  folderId?: string;
  /** folder_items 关联的 task_id 或 storage_object_id */
  itemId?: string;
  storageObjectId?: string;
}

export interface ResolvedSource {
  text: string;
  isSystemGenerated: boolean;
  sourceRef: QualityEvalSourceRef | null;
  pipelineBundle?: string;
  taskId?: string;
  /** 用户表单选项等，用于动态评分标准 */
  evalRunContext?: import('./eval-run-context').EvalRunContext;
}

export interface QualityEvalRun {
  id: string;
  rubric_id: string | null;
  scope: string;
  task_key: string;
  subtype: string;
  source_kind: QualityEvalSourceKind;
  source_ref: QualityEvalSourceRef | null;
  article_text: string | null;
  article_text_truncated: string | null;
  is_system_generated: boolean;
  scores: ArticleScoreResult | null;
  attribution: AttributionResult | null;
  model_provider: string | null;
  model_key: string | null;
  status: QualityEvalRunStatus;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_QUALITY_EVAL_PROVIDER = 'atlascloud';
export const DEFAULT_QUALITY_EVAL_MODEL = 'openai/gpt-5.6-terra';

/** 评估正文最大字符（超出截断） */
export const MAX_ARTICLE_CHARS = 48_000;
/** 管线摘要最大字符 */
export const MAX_PIPELINE_BUNDLE_CHARS = 24_000;
/** 快照存库最大字符（完整正文可截断） */
export const MAX_STORED_ARTICLE_CHARS = 100_000;
