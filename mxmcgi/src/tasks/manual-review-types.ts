/**
 * 多闸门人工审核 — 类型定义
 */
import type { PipelineStep } from './types';

/**
 * 审核类型：
 * - text: 文本（如 TTS 文案、广告语）
 * - json: 通用 JSON
 * - image: 图片（单图 / 多图）
 * - media: 媒体（视频/音频 URL）
 * - composite: 复合（多类型）
 * - **video-timeline**: 视频时间轴
 * - **interactive-card**: pre 交互卡（选题/行业等）
 * - **basic-form**: 分步 basic 采集（可含话题推荐 chips）
 * - **writing-chat**: 写作类审核 — 后端调用 LLM 把原始 JSON 合同整理成人话版摘要（Markdown），
 *   前端默认渲染摘要对话 + 可折叠原始 JSON + 可调字段交互卡。需 `summaryTaskKey`。
 */
export type ManualReviewKind =
  | 'text'
  | 'json'
  | 'image'
  | 'media'
  | 'composite'
  | 'video-timeline'
  | 'interactive-card'
  | 'basic-form'
  | 'writing-chat';

export type ManualReviewPhase = 'pre' | 'post';

export interface ReviewCheckpoint {
  phase: ManualReviewPhase;
  stepIndex: number;
  completedGateIds: string[];
}

export interface ManualReviewGateInfo {
  gateId: string;
  phase: ManualReviewPhase;
  stepIndex: number;
  label?: string;
  hint?: string;
  kind: ManualReviewKind;
  index?: number;
  totalGates?: number;
}

export interface ReviewDraftPayload {
  version: 1;
  gateId: string;
  phase: ManualReviewPhase;
  kind: ManualReviewKind;
  text?: string;
  json?: unknown;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  editable: boolean;
  label?: string;
  hint?: string;
  /**
   * kind=writing-chat：LLM 整理的人话版 Markdown 摘要（默认渲染）。
   * 原始合同 JSON 保存在 `json`；用户调整回写走 `applyMapping` + `interactiveCardFields`。
   */
  summary?: string;
  /** kind=writing-chat：可选的摘要「可调字段」清单（结构同 interactive-card.fields）。 */
  interactiveCardFields?: unknown;
}

/** json 审核展示面：business=仅编辑合同 business；full=整份 JSON */
export type ManualReviewSurface = 'business' | 'full';

export interface ManualReviewStepParams {
  id?: string;
  label?: string;
  hint?: string;
  kind?: ManualReviewKind;
  /** video-timeline 专用：plan=分镜方案审核，rendered=各段成片审核 */
  timelinePhase?: 'plan' | 'rendered';
  /**
   * kind=json 时：business 仅展示/编辑 contract.business（writing warp 合同）
   * 未设置时前端对含 business 的合同自动走 business 面
   */
  reviewSurface?: ManualReviewSurface;
  draftFrom?: string;
  applyMapping?: Record<string, string>;
  editable?: boolean;
  /**
   * kind=writing-chat 必填：调用哪个 text 子业务把 JSON 整理为人话版 Markdown 摘要。
   * 形如 `text/transform/writing-review-summary`（须为 transform，勿用 expert）。
   */
  summaryTaskKey?: string;
  /** kind=writing-chat 可选：摘要 prompt 模板覆盖（默认会拼上 contract + draft） */
  summaryInstruction?: string;
  /** 多人语音：审核【角色】台词本后回写 contract.business.lines */
  syncDialogueLines?: boolean;
}

export const MANUAL_REVIEW_STEP = 'manualReview';

export function parseManualReviewStepParams(step: PipelineStep): ManualReviewStepParams {
  const p = (step.params ?? {}) as ManualReviewStepParams;
  const reviewSurface =
    p.reviewSurface === 'business' || p.reviewSurface === 'full' ? p.reviewSurface : undefined;
  return {
    id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : undefined,
    label: typeof p.label === 'string' ? p.label : undefined,
    hint: typeof p.hint === 'string' ? p.hint : undefined,
    kind: p.kind ?? 'text',
    timelinePhase: p.timelinePhase === 'rendered' ? 'rendered' : p.timelinePhase === 'plan' ? 'plan' : undefined,
    reviewSurface,
    draftFrom: typeof p.draftFrom === 'string' ? p.draftFrom : undefined,
    applyMapping: p.applyMapping,
    editable: p.editable,
    summaryTaskKey: typeof p.summaryTaskKey === 'string' && p.summaryTaskKey.trim() ? p.summaryTaskKey.trim() : undefined,
    summaryInstruction: typeof p.summaryInstruction === 'string' ? p.summaryInstruction : undefined,
    syncDialogueLines: p.syncDialogueLines === true,
  };
}

export function resolveGateId(step: PipelineStep, phase: ManualReviewPhase, stepIndex: number): string {
  const params = parseManualReviewStepParams(step);
  if (params.id) return params.id;
  return `${phase}-manual-review-${stepIndex}`;
}

export function isManualReviewStep(step: PipelineStep): boolean {
  return step.step === MANUAL_REVIEW_STEP;
}

/** worker 内存标记：需暂停等待人工审核 */
export const PAUSE_FOR_MANUAL_REVIEW = '__pauseForManualReview';

export interface ManualReviewPausePayload {
  gate: ManualReviewGateInfo;
  draft: ReviewDraftPayload;
  checkpoint: ReviewCheckpoint;
}
