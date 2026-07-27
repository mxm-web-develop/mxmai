import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { WritingTaskItem } from '../../api/client';
import { TaskOpenApiBadge } from '../TaskOpenApiBadge';
import { animateCardEnter } from '../../lib/motion/gsapPresets';
import { prefersReducedMotion } from '../../lib/motion/useReducedMotion';
import {
  extractMarkdownHeadline,
  formatTaskCreatedAt,
  pickTaskOutputPreviewRaw,
  pickWritingCollectionMeta,
  type WritingCollectionTeaser,
} from './taskPreviewText';
import { TaskCardDeleteButton } from './TaskCardDeleteButton';
import { TaskCardMoreMenu } from './TaskCardMoreMenu';
import { TaskCardSelectCheckbox } from './TaskCardSelectCheckbox';
import {
  formatWritingCollectionProgressHint,
  resolveWritingPipelinePhaseIndex,
  WRITING_PIPELINE_PHASES,
} from './writingPipelineProgress';

gsap.registerPlugin(useGSAP);

export type WritingTaskCardProps = {
  task: WritingTaskItem;
  title: string;
  status: string;
  statusLabel: string;
  typeLabel?: string;
  subtypeLabel?: string;
  animateKey?: number;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onMove?: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void | Promise<void>;
  deleting: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** 知识库软链等场景可隐藏状态徽标 */
  showStatus?: boolean;
  showDelete?: boolean;
  /** more=⋯菜单（生成列表默认）；delete=直接删除（知识库等） */
  deleteAction?: 'more' | 'delete';
  /** 卡片底部额外内容（如知识库特征标签） */
  extra?: ReactNode;
};

function animateMastShimmer(
  el: Element | null,
  opts: { faster?: boolean }
): gsap.core.Tween | null {
  if (!el || prefersReducedMotion()) return null;
  gsap.set(el, { x: '-100%' });
  return gsap.to(el, {
    x: '200%',
    duration: opts.faster ? 1.05 : 1.8,
    ease: 'power2.inOut',
    repeat: -1,
    repeatDelay: opts.faster ? 0.35 : 2.2,
  });
}

function animateInkPulse(lines: NodeListOf<Element> | undefined): gsap.core.Tween | null {
  if (!lines?.length || prefersReducedMotion()) return null;
  return gsap.to(lines, {
    opacity: () => 0.35 + Math.random() * 0.55,
    scaleX: () => 0.55 + Math.random() * 0.45,
    duration: 0.55,
    stagger: { each: 0.07, from: 'start' },
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    transformOrigin: 'left center',
  });
}

function animateMastCaret(el: Element | null): gsap.core.Tween | null {
  if (!el || prefersReducedMotion()) return null;
  return gsap.to(el, {
    opacity: 0.15,
    duration: 0.55,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

function readNestedParam(task: WritingTaskItem, key: string): unknown {
  const rp = task.requestParams as Record<string, unknown> | undefined;
  if (!rp) return undefined;
  const params = rp.params as Record<string, unknown> | undefined;
  const inner = params?.params as Record<string, unknown> | undefined;
  return inner?.[key] ?? params?.[key] ?? rp[key];
}

function pickSeekTopic(task: WritingTaskItem): string | undefined {
  const raw = readNestedParam(task, 'topic');
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function pickSeekCount(task: WritingTaskItem): number | undefined {
  const raw = readNestedParam(task, 'seek_count');
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n >= 2) return Math.min(10, Math.floor(n));
  return undefined;
}

function shortenPieceLabel(label: string, max = 16): string {
  const one = label
    .replace(/^\d+[\.\、]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function buildAnthologyPieces(
  teasers: WritingCollectionTeaser[],
  countHint: number
): Array<{ id: string; label: string; angle?: string }> {
  if (teasers.length > 0) {
    return teasers.slice(0, 5).map((t, i) => ({
      id: t.id || `p${i + 1}`,
      label: shortenPieceLabel(t.name || t.title || `第 ${i + 1} 路`),
      angle: t.angle ? shortenPieceLabel(t.angle, 22) : undefined,
    }));
  }
  const n = Math.min(5, Math.max(2, countHint || 3));
  return Array.from({ length: n }, (_, i) => ({
    id: `slot-${i + 1}`,
    label: `第 ${i + 1} 路`,
  }));
}

export function WritingTaskCard({
  task,
  title,
  status,
  statusLabel,
  typeLabel,
  subtypeLabel,
  animateKey = 0,
  onClick,
  onDelete,
  onMove,
  onDownload,
  deleting,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  showStatus = true,
  showDelete = true,
  deleteAction = 'more',
  extra,
}: WritingTaskCardProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const useDeleteButton = Boolean(showDelete && deleteAction === 'delete' && onDelete);
  const useMoreMenu = Boolean(showDelete && deleteAction === 'more' && onDelete);
  const isProcessing =
    status === 'processing' || status === 'pending' || status === 'queued';
  const isFailed = status === 'failed' || status === 'cancelled';
  const isReview = status === 'awaiting_review';
  const errorMessage = task.progress?.error?.trim();
  const outputPreview = pickTaskOutputPreviewRaw(task, 480);
  const collectionMeta = pickWritingCollectionMeta(task);
  const showSummary =
    status === 'completed' && Boolean(outputPreview.trim() || collectionMeta.isCollection);
  const seekTopic = pickSeekTopic(task);
  const seekCount = pickSeekCount(task);
  const collectionReady = collectionMeta.readyCount ?? null;
  const collectionTotal =
    collectionMeta.itemCount ?? seekCount ?? collectionReady ?? null;
  const isWritingCollection = collectionMeta.isCollection;
  const pieceCount =
    collectionTotal ?? collectionReady ?? collectionMeta.teasers.length ?? seekCount ?? 0;
  const anthologyPieces = isWritingCollection
    ? buildAnthologyPieces(collectionMeta.teasers, pieceCount || seekCount || 3)
    : [];
  const progressPct =
    typeof task.progress?.progress === 'number' ? Math.round(task.progress.progress) : null;
  const phaseIndex = isProcessing
    ? resolveWritingPipelinePhaseIndex({
        phase: task.progress?.phase,
        phaseIndex: task.progress?.phaseIndex,
        progress: progressPct,
        status,
        collectionReady: isWritingCollection ? collectionReady : null,
        collectionTotal: isWritingCollection ? collectionTotal : null,
      })
    : -1;
  const progressMessage = isWritingCollection
    ? formatWritingCollectionProgressHint({
        message: task.progress?.message,
        statusLabel,
        ready: collectionReady,
        total: collectionTotal,
        status,
      })
    : task.progress?.message?.trim() || null;

  const headlineSource = isWritingCollection
    ? ''
    : showSummary
      ? outputPreview
      : outputPreview || subtypeLabel || typeLabel || title;
  const headline = extractMarkdownHeadline(headlineSource, 56);
  const bodyExcerpt =
    showSummary && !isWritingCollection
      ? outputPreview
          .replace(/^#{1,3}\s+[^\n]*\n?/, '')
          .replace(/\s+/g, ' ')
          .trim() || outputPreview.replace(/\s+/g, ' ').trim()
      : '';
  const eyebrow = subtypeLabel || typeLabel || '文稿';
  /** 封面内唯一主题行：探索主题；不得用子篇标题顶替任务名 */
  const collectionTheme =
    [collectionMeta.title, seekTopic]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .find((s) => s && s !== title) || '';
  const displayPieceCount = pieceCount > 0 ? pieceCount : anthologyPieces.length;

  useGSAP(
    () => {
      if (!cardRef.current) return;
      animateCardEnter(cardRef.current);
      const shimmer = cardRef.current.querySelector('.writing-doc-card__shimmer');
      animateMastShimmer(shimmer, { faster: isProcessing || isReview });
      if (isWritingCollection || !isProcessing) return;
      const inks = cardRef.current.querySelectorAll('.writing-doc-card__ink');
      animateInkPulse(inks);
      const mastInks = cardRef.current.querySelectorAll('.writing-doc-card__mast-ink');
      animateInkPulse(mastInks);
      animateMastCaret(cardRef.current.querySelector('.writing-doc-card__mast-caret'));
    },
    {
      scope: cardRef,
      dependencies: [task.id, animateKey, status, isProcessing, isReview, isWritingCollection],
      revertOnUpdate: true,
    }
  );

  return (
    <li
      ref={cardRef}
      className={[
        'writing-doc-card',
        isWritingCollection ? 'writing-doc-card--anthology' : 'writing-doc-card--mast',
        `writing-doc-card--${status}`,
        'writing-task-item-clickable',
        isProcessing ? 'writing-doc-card--generating' : '',
        isReview ? 'writing-doc-card--review' : '',
        isFailed ? 'writing-doc-card--failed' : '',
        selected ? 'generation-task-item--selected' : '',
        selectionMode ? 'generation-task-item--selecting' : '',
        useDeleteButton || !showDelete ? 'writing-doc-card--no-more' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {selectionMode && onToggleSelect ? (
        <TaskCardSelectCheckbox checked={selected} onToggle={onToggleSelect} />
      ) : null}

      {isWritingCollection ? (
        <div
          className="writing-doc-card__visual writing-anthology"
          aria-label={`文集，共 ${displayPieceCount} 篇`}
        >
          <div className="writing-doc-card__mast writing-anthology__mast">
            <div className="writing-doc-card__shimmer" aria-hidden />
            <div className="writing-anthology__mast-row">
              <strong className="writing-doc-card__eyebrow">文集</strong>
              {displayPieceCount > 0 ? (
                <span className="writing-anthology__count">{displayPieceCount} 篇</span>
              ) : null}
            </div>
            {isProcessing ? (
              <div className="writing-doc-card__gen" aria-live="polite">
                <span className="writing-doc-card__gen-hint">
                  {progressMessage || statusLabel}
                </span>
                <div
                  className="writing-doc-card__phases"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct ?? undefined}
                  aria-valuetext={progressMessage || statusLabel}
                >
                  {WRITING_PIPELINE_PHASES.map((p, i) => {
                    const state =
                      i < phaseIndex ? 'done' : i === phaseIndex ? 'active' : 'todo';
                    return (
                      <span
                        key={p.id}
                        className={`writing-doc-card__phase writing-doc-card__phase--${state}`}
                        title={p.label}
                      >
                        <i className="writing-doc-card__phase-bar" aria-hidden />
                        <em className="writing-doc-card__phase-label">{p.label}</em>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : collectionTheme ? (
              <span className="writing-doc-card__headline" title={collectionTheme}>
                {collectionTheme}
              </span>
            ) : null}
          </div>

          <div className="writing-doc-card__sheet writing-anthology__sheet-panel">
            {isProcessing ? (
              <div className="writing-doc-card__inking" aria-hidden>
                <span className="writing-doc-card__ink writing-doc-card__ink--title" />
                <span className="writing-doc-card__ink" />
                <span className="writing-doc-card__ink writing-doc-card__ink--short" />
                <span className="writing-doc-card__ink writing-doc-card__ink--mid" />
              </div>
            ) : anthologyPieces.length > 0 ? (
              <ol className="writing-anthology__pieces">
                {anthologyPieces.map((piece, i) => (
                  <li key={piece.id} className="writing-anthology__piece">
                    <span className="writing-anthology__piece-idx" aria-hidden>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="writing-anthology__piece-label" title={piece.label}>
                      {piece.label}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="writing-doc-card__excerpt writing-doc-card__excerpt--muted">
                篇目准备中…
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="writing-doc-card__visual">
          <div className="writing-doc-card__mast">
            <div className="writing-doc-card__shimmer" aria-hidden />
            <strong className="writing-doc-card__eyebrow">{eyebrow}</strong>
            {isProcessing ? (
              <div
                className="writing-doc-card__mast-writing"
                aria-hidden
                title="正在撰写"
              >
                <span className="writing-doc-card__mast-ink" />
                <span className="writing-doc-card__mast-ink writing-doc-card__mast-ink--mid" />
                <span className="writing-doc-card__mast-ink writing-doc-card__mast-ink--short" />
                <span className="writing-doc-card__mast-caret" />
              </div>
            ) : (
              <span className="writing-doc-card__headline" title={headline}>
                {headline || title}
              </span>
            )}
            {isProcessing ? (
              <div className="writing-doc-card__gen" aria-live="polite">
                <span className="writing-doc-card__gen-hint">
                  {progressMessage || statusLabel}
                </span>
                <div
                  className="writing-doc-card__phases"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct ?? undefined}
                  aria-valuetext={progressMessage || statusLabel}
                >
                  {WRITING_PIPELINE_PHASES.map((p, i) => {
                    const state =
                      i < phaseIndex ? 'done' : i === phaseIndex ? 'active' : 'todo';
                    return (
                      <span
                        key={p.id}
                        className={`writing-doc-card__phase writing-doc-card__phase--${state}`}
                        title={p.label}
                      >
                        <i className="writing-doc-card__phase-bar" aria-hidden />
                        <em className="writing-doc-card__phase-label">{p.label}</em>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="writing-doc-card__sheet">
            {isProcessing ? (
              <div className="writing-doc-card__inking" aria-hidden>
                <span className="writing-doc-card__ink writing-doc-card__ink--title" />
                <span className="writing-doc-card__ink" />
                <span className="writing-doc-card__ink" />
                <span className="writing-doc-card__ink writing-doc-card__ink--short" />
                <span className="writing-doc-card__ink" />
                <span className="writing-doc-card__ink writing-doc-card__ink--mid" />
              </div>
            ) : null}

            {showSummary && bodyExcerpt ? (
              <p className="writing-doc-card__excerpt" title={bodyExcerpt}>
                {bodyExcerpt}
              </p>
            ) : null}

            {isFailed && errorMessage ? (
              <p className="writing-doc-card__error" title={errorMessage}>
                {errorMessage}
              </p>
            ) : null}

            {!isProcessing && !showSummary && !isFailed ? (
              <p className="writing-doc-card__excerpt writing-doc-card__excerpt--muted">
                {status === 'completed' ? '正文摘要加载中…' : statusLabel}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <h3 className="writing-doc-card__title" title={title}>
        {title}
      </h3>
      <div className="writing-doc-card__meta writing-doc-card__meta--term">
        <TaskOpenApiBadge metadata={task.metadata} />
        {showStatus ? (
          <span className={`writing-task-status status-badge status-badge--${status}`}>
            {statusLabel}
          </span>
        ) : null}
        {task.createdAt ? (
          <time dateTime={task.createdAt}>{formatTaskCreatedAt(task.createdAt)}</time>
        ) : null}
        {typeLabel || subtypeLabel ? (
          <span className="writing-doc-card__term-type">
            {[typeLabel, subtypeLabel].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </div>

      {extra}

      {useDeleteButton && !selectionMode ? (
        <div className="writing-doc-card__actions">
          <TaskCardDeleteButton onClick={onDelete!} disabled={deleting} deleting={deleting} />
        </div>
      ) : null}
      {useMoreMenu && !selectionMode ? (
        <TaskCardMoreMenu
          onDelete={onDelete!}
          onMove={onMove}
          onDownload={onDownload}
          completedActionsEnabled={status === 'completed'}
          disabled={deleting}
          deleting={deleting}
        />
      ) : null}
    </li>
  );
}
