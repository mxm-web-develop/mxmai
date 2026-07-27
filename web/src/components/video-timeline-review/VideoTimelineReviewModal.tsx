import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../../i18n/appLocale';
import { App, Button, Modal } from 'antd';
import type { WritingTaskItem } from '../../api/client';
import { approveTaskReview, getTaskReviewDraft, retryRenderedReviewClips, type ReviewDraftPayload } from '../../api/client';
import { ClipInspector } from './ClipInspector';
import { OverlayInspector } from './OverlayInspector';
import { SegmentPreview } from './SegmentPreview';
import { TimelinePanel } from './TimelinePanel';
import {
  AUDIO_PREVIEW_CLIP_ID,
  BGM_PREVIEW_CLIP_ID,
  type TimelineSelection,
  type VideoGeneratorOption,
} from './types';
import { findAudioTrack, getClipAudioSettings } from './audioTrackUtils';
import { findVisualClipAtTime } from './timelineClipAtTime';
import { useVideoEditScript } from './useVideoEditScript';
import { useTimelinePlayback } from './useTimelinePlayback';
import { useVoiceoverPlaybackUrl } from './useVoiceoverPlaybackUrl';
import { resolveVoiceoverEnrichInput } from './voiceoverTimelineEnrich';
import { findSubtitleAtTime } from './previewSubtitle';
import { resolveTimelineReviewHint } from '../manualReviewUserCopy';
import { ManualReviewModalTitle } from '../ManualReviewModalTitle';
import { VideoPreviewLoading } from './VideoPreviewLoading';
import type { VideoPreviewLoadingPhase } from './VideoPreviewLoading';
import { resolveReviewScriptInitial } from './resolveReviewScriptInitial';
import './video-timeline-review.css';
import { MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES } from '../manualReviewModalLayout';
import { countFailedClipRenders, listBlockingClipRenders } from './clipRenderPreviewUtils';
import {
  ReviewBillingBar,
  formatGenerateButtonLabel,
  useReviewBillingEstimate,
} from '../billing/ReviewBillingEstimate';

const DRAFT_LOAD_SLOW_MS = 12_000;

type DraftLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type VideoTimelineReviewModalProps = {
  open: boolean;
  task: WritingTaskItem | null;
  title?: string;
  hint?: string;
  onClose: () => void;
  onApproved?: () => void;
};

function resolveGateMeta(task: WritingTaskItem | null) {
  const meta = task?.metadata as { manualReviewGate?: { gateId?: string; label?: string; hint?: string } } | undefined;
  return meta?.manualReviewGate;
}

export function VideoTimelineReviewModal({
  open,
  task,
  title,
  hint,
  onClose,
  onApproved,
}: VideoTimelineReviewModalProps) {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const messageRef = useRef(message);
  messageRef.current = message;
  const gateMeta = resolveGateMeta(task);
  const [draft, setDraft] = useState<ReviewDraftPayload | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftLoadState, setDraftLoadState] = useState<DraftLoadState>('idle');
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftLoadSlow, setDraftLoadSlow] = useState(false);
  const [draftReloadKey, setDraftReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryingClipId, setRetryingClipId] = useState<string | null>(null);
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  /** 视频轨多选（主选中 id 始终包含在内） */
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([]);
  const [contentReady, setContentReady] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const scriptInitial = useMemo(() => {
    if (loadingDraft) return undefined;
    return resolveReviewScriptInitial(task, draft);
  }, [loadingDraft, task, draft]);

  const voiceoverEnrich = useMemo(
    () => resolveVoiceoverEnrichInput(task, draft ?? undefined),
    [task, draft]
  );

  const {
    visualClips,
    voiceClips,
    bgmClips,
    subtitles,
    textClips,
    voicePreviewUrl,
    bgmPreviewUrl,
    audioMix,
    totalDuration,
    updateClip,
    commitAutoStockSources,
    updateAudioClip,
    setBgmMedia,
    clearBgmMedia,
    updateSubtitle,
    updateSegmentVoiceover,
    updateTextClip,
    updateTransition,
    resizeClipBoundary,
    splitVisualClipAt,
    deleteVisualClip,
    mergeVisualWithNext,
    undoTimelineEdit,
    redoTimelineEdit,
    canSplitAt,
    canMergeAt,
    timelineEditState,
    script,
    scriptParseFailed,
    exportJson,
  } = useVideoEditScript(scriptInitial, voiceoverEnrich);

  const onCloseRef = useRef(onClose);
  const onApprovedRef = useRef(onApproved);
  onCloseRef.current = onClose;
  onApprovedRef.current = onApproved;

  const voiceoverPlayback = useVoiceoverPlaybackUrl(voicePreviewUrl);
  const bgmPlayback = useVoiceoverPlaybackUrl(bgmPreviewUrl);
  const voicePlaybackUrl = voiceoverPlayback.playbackUrl;
  const bgmPlaybackUrlResolved = bgmPlayback.playbackUrl;
  const playback = useTimelinePlayback(totalDuration, {
    ...audioMix,
    voiceUrl: voicePlaybackUrl,
    bgmUrl: bgmPlaybackUrlResolved,
  });

  const timelinePhase = useMemo((): 'plan' | 'rendered' => {
    const fromDraft = draft?.metadata?.timelinePhase;
    if (fromDraft === 'rendered' || fromDraft === 'plan') return fromDraft;
    if (gateMeta?.gateId?.includes('render-review')) return 'rendered';
    return 'plan';
  }, [draft?.metadata?.timelinePhase, gateMeta?.gateId]);
  const isRenderedReview = timelinePhase === 'rendered';

  const blockingClipRenders = useMemo(() => {
    if (!isRenderedReview || !script) return [];
    return listBlockingClipRenders(script);
  }, [isRenderedReview, script]);

  const failedClipCount = useMemo(() => {
    if (!isRenderedReview || !script) return 0;
    return countFailedClipRenders(script);
  }, [isRenderedReview, script]);

  const hasBlockingClipRenders = blockingClipRenders.length > 0;
  const approveBlockedByClips = isRenderedReview && hasBlockingClipRenders;

  const requiresVoice = Boolean(voicePreviewUrl);
  const voiceReady =
    !requiresVoice ||
    Boolean(voicePlaybackUrl) ||
    (voiceoverPlayback.hasError && !voiceoverPlayback.isLoading);
  const scriptReady = !loadingDraft && Boolean(script);
  /** 成片审核走 stream 直链，不必等整段 blob；分镜阶段仍等素材就绪 */
  const previewReady =
    scriptReady && voiceReady && (isRenderedReview || contentReady);

  const activePreviewSubtitle = useMemo(
    () => findSubtitleAtTime(subtitles, playback.currentTime),
    [subtitles, playback.currentTime]
  );

  useEffect(() => {
    if (!open) setContentReady(false);
  }, [open]);

  useEffect(() => {
    setContentReady(false);
  }, [draft?.json, voicePreviewUrl]);

  const selectedClip = useMemo(() => {
    if (selection?.kind === 'visual') {
      return visualClips.find((c) => c.id === selection.id) ?? null;
    }
    return null;
  }, [visualClips, selection]);

  const selectedSubtitle = useMemo(() => {
    if (selection?.kind === 'subtitle') {
      return subtitles.find((s) => s.id === selection.id) ?? null;
    }
    return null;
  }, [subtitles, selection]);

  const selectedOverlay = useMemo(() => {
    if (selection?.kind === 'overlay') {
      return textClips.find((c) => c.id === selection.id) ?? null;
    }
    return null;
  }, [textClips, selection]);

  const selectedAudioInspector = useMemo(() => {
    if (selection?.kind !== 'audio' || !script) return null;
    const role = selection.audioRole ?? 'voice';
    const track = findAudioTrack(script, role);
    const clips = role === 'bgm' ? bgmClips : voiceClips;
    const clip =
      selection.id === AUDIO_PREVIEW_CLIP_ID || selection.id === BGM_PREVIEW_CLIP_ID
        ? clips[0]
        : clips.find((c) => c.id === selection.id);
    const clipId = clip?.id ?? (role === 'bgm' ? 'clip-audio-bgm' : selection.id);
    const settings = getClipAudioSettings(clip, track, role);
    const hasMedia =
      role === 'voice'
        ? Boolean(clip?.mediaUrl ?? voicePreviewUrl)
        : Boolean(clip?.mediaUrl);
    return {
      role,
      clipId,
      volume: settings.volume,
      muted: settings.muted,
      fadeIn: settings.fadeIn,
      fadeOut: settings.fadeOut,
      hasMedia,
    };
  }, [selection, script, voiceClips, bgmClips, voicePreviewUrl]);

  /** 播放头所在片段优先，否则用选中片段（右侧配置与预览对齐） */
  const previewClip = useMemo(() => {
    const atPlayhead = findVisualClipAtTime(visualClips, playback.currentTime);
    return atPlayhead ?? selectedClip ?? visualClips[0] ?? null;
  }, [visualClips, playback.currentTime, selectedClip]);

  const handleSeek = useCallback(
    (time: number) => {
      playback.seek(time);
      // 编辑叠加层时不因 scrub 抢占选中态
      if (selection?.kind === 'overlay') return;
      // 多选时 scrub 不打断选择
      if (selectedVisualIds.length > 1) return;
      const atPlayhead = findVisualClipAtTime(visualClips, time);
      if (atPlayhead) {
        setSelection({ kind: 'visual', id: atPlayhead.id });
        setSelectedVisualIds([atPlayhead.id]);
      }
    },
    [playback, visualClips, selection?.kind, selectedVisualIds.length]
  );

  const handleSelectVisual = useCallback(
    (clipId: string, opts: { toggle: boolean; range: boolean }) => {
      const orderedIds = [...visualClips]
        .sort((a, b) => a.startTime - b.startTime)
        .map((c) => c.id);
      const idx = orderedIds.indexOf(clipId);
      if (idx < 0) return;

      setSelectedVisualIds((prev) => {
        let next: string[];
        if (opts.range && prev.length > 0) {
          const anchorId = selection?.kind === 'visual' ? selection.id : prev[prev.length - 1]!;
          const anchorIdx = orderedIds.indexOf(anchorId);
          const from = Math.min(anchorIdx >= 0 ? anchorIdx : idx, idx);
          const to = Math.max(anchorIdx >= 0 ? anchorIdx : idx, idx);
          next = orderedIds.slice(from, to + 1);
        } else if (opts.toggle) {
          const set = new Set(prev);
          if (set.has(clipId)) set.delete(clipId);
          else set.add(clipId);
          next = orderedIds.filter((id) => set.has(id));
          if (next.length === 0) next = [clipId];
        } else {
          next = [clipId];
        }
        setSelection({ kind: 'visual', id: clipId });
        return next;
      });
    },
    [visualClips, selection]
  );

  const activeEditClipId = useMemo(() => {
    if (selection?.kind === 'visual') return selection.id;
    const atPlayhead = findVisualClipAtTime(visualClips, playback.currentTime);
    return atPlayhead?.id ?? null;
  }, [selection, visualClips, playback.currentTime]);

  const canSplitSelected = useMemo(() => {
    if (!activeEditClipId) return false;
    return canSplitAt(activeEditClipId, playback.currentTime);
  }, [activeEditClipId, canSplitAt, playback.currentTime]);

  const canDeleteSelected = useMemo(() => {
    return Boolean(activeEditClipId) && timelineEditState.canDelete;
  }, [activeEditClipId, timelineEditState.canDelete]);

  const canMergeSelected = useMemo(() => {
    if (!activeEditClipId) return false;
    return canMergeAt(activeEditClipId);
  }, [activeEditClipId, canMergeAt]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (!activeEditClipId) {
      message.warning(t('video.review.selectClipFirst'));
      return;
    }
    const result = splitVisualClipAt(activeEditClipId, playback.currentTime);
    if (result.error) {
      message.warning(result.error);
      return;
    }
    if (result.focusClipId) {
      setSelection({ kind: 'visual', id: result.focusClipId });
    }
    message.success(t('video.review.splitAtPlayhead'));
  }, [activeEditClipId, splitVisualClipAt, playback.currentTime, message, t]);

  const handleDeleteSelectedClip = useCallback(() => {
    if (!activeEditClipId) {
      message.warning(t('video.review.selectClipToDelete'));
      return;
    }
    const result = deleteVisualClip(activeEditClipId);
    if (result.error) {
      message.warning(result.error);
      return;
    }
    if (result.focusClipId) {
      setSelection({ kind: 'visual', id: result.focusClipId });
    }
    message.success(t('video.review.deletedClip'));
  }, [activeEditClipId, deleteVisualClip, message, t]);

  const handleMergeWithNext = useCallback(() => {
    if (!activeEditClipId) {
      message.warning(t('video.review.selectClipToMerge'));
      return;
    }
    const result = mergeVisualWithNext(activeEditClipId);
    if (result.error) {
      message.warning(result.error);
      return;
    }
    if (result.focusClipId) {
      setSelection({ kind: 'visual', id: result.focusClipId });
    }
    message.success(t('video.review.mergedClip'));
  }, [activeEditClipId, mergeVisualWithNext, message, t]);

  const handleUndoEdit = useCallback(() => {
    undoTimelineEdit();
  }, [undoTimelineEdit]);

  const handleRedoEdit = useCallback(() => {
    redoTimelineEdit();
  }, [redoTimelineEdit]);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setLoadingDraft(false);
      setDraftLoadState('idle');
      setDraftLoadError(null);
      setDraftLoadSlow(false);
      setSubmitting(false);
      setRetrying(false);
      setRetryingClipId(null);
      setSelection(null);
      setSelectedVisualIds([]);
      setBatchBusy(false);
      return;
    }
    if (!task?.id) return;

    let cancelled = false;
    setLoadingDraft(true);
    setDraftLoadState('loading');
    setDraftLoadError(null);
    setDraftLoadSlow(false);
    setDraft(null);

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setDraftLoadSlow(true);
    }, DRAFT_LOAD_SLOW_MS);

    void getTaskReviewDraft(task.id, gateMeta?.gateId)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          if (/not awaiting review|status=completed/i.test(res.error)) {
            messageRef.current.warning(t('video.review.notInReviewShort'));
            onCloseRef.current();
            onApprovedRef.current?.();
            return;
          }
          throw new Error(res.error);
        }
        const payload = res.data?.data?.draft ?? null;
        setDraft(payload);
        const initial = resolveReviewScriptInitial(task, payload);
        if (initial == null) {
          setDraftLoadState('empty');
          setDraftLoadError(t('video.review.draftEmpty'));
        } else {
          setDraftLoadState('ready');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const errMsg = e instanceof Error ? e.message : String(e);
          setDraftLoadError(errMsg);
          setDraftLoadState('error');
          setDraft(null);
          messageRef.current.error(errMsg);
        }
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        if (!cancelled) setLoadingDraft(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [open, task?.id, gateMeta?.gateId, draftReloadKey, t]);

  useEffect(() => {
    if (visualClips.length && !selection) {
      setSelection({ kind: 'visual', id: visualClips[0]!.id });
    }
  }, [visualClips, selection]);

  useEffect(() => {
    if (!open) playback.pause();
  }, [open, playback.pause]);

  const projectTopic = script?.project?.name?.trim();

  const videoGeneratorOptions = useMemo((): VideoGeneratorOption[] => {
    const raw = draft?.metadata?.videoGeneratorOptions;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is VideoGeneratorOption =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as VideoGeneratorOption).taskKey === 'string' &&
        typeof (item as VideoGeneratorOption).label === 'string'
    );
  }, [draft?.metadata?.videoGeneratorOptions]);

  const defaultVideoGenerator = useMemo(() => {
    const raw = draft?.metadata?.defaultVideoGenerator;
    if (raw && typeof raw === 'object' && typeof (raw as { taskKey?: string }).taskKey === 'string') {
      return raw as { taskKey: string; subtype: string | null };
    }
    return { taskKey: 'generator', subtype: 'fragment' };
  }, [draft?.metadata?.defaultVideoGenerator]);

  const graphGeneratorOptions = useMemo((): VideoGeneratorOption[] => {
    const raw = draft?.metadata?.graphGeneratorOptions;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is VideoGeneratorOption =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as VideoGeneratorOption).taskKey === 'string' &&
        typeof (item as VideoGeneratorOption).label === 'string'
    );
  }, [draft?.metadata?.graphGeneratorOptions]);

  const defaultGraphGenerator = useMemo(() => {
    const raw = draft?.metadata?.defaultGraphGenerator;
    if (raw && typeof raw === 'object' && typeof (raw as { taskKey?: string }).taskKey === 'string') {
      return raw as { taskKey: string; subtype: string | null };
    }
    return { taskKey: 'design', subtype: 'content-illustration' };
  }, [draft?.metadata?.defaultGraphGenerator]);

  const sortedVisualClips = useMemo(
    () => [...visualClips].sort((a, b) => a.startTime - b.startTime),
    [visualClips]
  );

  const nextVisualClipForSelected = useMemo(() => {
    if (!selectedClip || !isRenderedReview) return null;
    const idx = sortedVisualClips.findIndex((c) => c.id === selectedClip.id);
    if (idx < 0 || idx >= sortedVisualClips.length - 1) return null;
    return sortedVisualClips[idx + 1] ?? null;
  }, [selectedClip, sortedVisualClips, isRenderedReview]);

  const transitionToNextForSelected = useMemo(() => {
    if (!selectedClip || !nextVisualClipForSelected || !script) return null;
    const videoTrack = script.project.timeline.tracks.find((t) => t.type === 'video');
    return (
      videoTrack?.transitions?.find(
        (tr) => tr.clipAId === selectedClip.id && tr.clipBId === nextVisualClipForSelected.id
      ) ?? null
    );
  }, [selectedClip, nextVisualClipForSelected, script]);

  const displayTitle = title ?? gateMeta?.label ?? (isRenderedReview ? t('video.review.refineTitle') : t('video.review.title'));
  const reviewHint = resolveTimelineReviewHint({
    hint,
    draftHint: draft?.hint,
    gateHint: gateMeta?.hint,
    isRenderedReview,
  });

  const previewLoadingPhase: VideoPreviewLoadingPhase = !scriptReady
    ? 'script'
    : !voiceReady
      ? 'audio'
      : !isRenderedReview && !contentReady
        ? 'content'
        : 'default';

  const previewLoadingMessage = !scriptReady
    ? loadingDraft
      ? draftLoadSlow
        ? isRenderedReview
          ? t('video.review.scriptLoadSlowRefine')
          : t('video.review.scriptLoadSlowPlan')
        : isRenderedReview
          ? t('video.review.scriptLoadingRefine')
          : t('video.review.scriptLoadingPlan')
      : scriptParseFailed
        ? t('video.review.scriptInvalid')
        : draftLoadError ?? t('video.review.scriptNotReady')
    : !voiceReady
      ? t('video.review.voiceLoading')
      : !isRenderedReview && !contentReady
        ? t('video.review.contentLoading')
        : t('video.review.preparingPreview');

  const showPreviewError =
    !loadingDraft &&
    !scriptReady &&
    (Boolean(draftLoadError) || scriptParseFailed || draftLoadState === 'empty');

  const handleReloadDraft = () => setDraftReloadKey((k) => k + 1);

  const handleRetryClips = async (clipIds?: string[]) => {
    if (!task?.id) return;
    const json = exportJson();
    if (!json) {
      message.error(t('video.review.invalidScript'));
      return;
    }
    setRetrying(true);
    if (clipIds?.length === 1) {
      setRetryingClipId(clipIds[0]!);
    } else {
      setRetryingClipId(null);
    }
    try {
      const res = await retryRenderedReviewClips(task.id, {
        gateId: gateMeta?.gateId,
        reviewJson: json,
        clipIds,
      });
      if (res.error) throw new Error(res.error);
      const count = res.data?.data?.retriedClipIds?.length ?? clipIds?.length ?? 0;
      message.success(t('video.review.retrySubmitted', { count }));
      onApproved?.();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('video.review.retryFailed'));
    } finally {
      setRetrying(false);
      setRetryingClipId(null);
    }
  };

  const handleRetryClip = (clipId: string) => void handleRetryClips([clipId]);

  const handleUpdateManyClips = useCallback(
    (clipIds: string[], patch: Record<string, unknown>) => {
      flushSync(() => {
        for (const id of clipIds) updateClip(id, patch);
      });
    },
    [updateClip]
  );

  const handleBatchRetryRender = useCallback(
    (clipIds: string[]) => {
      if (clipIds.length < 2) return;
      setBatchBusy(true);
      void handleRetryClips(clipIds).finally(() => setBatchBusy(false));
    },
    // handleRetryClips closes over latest exportJson/task
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleRetryClips]
  );

  const handleRetryAllFailed = () => {
    const failedIds = blockingClipRenders.filter((b) => b.reason === 'failed').map((b) => b.clipId);
    if (!failedIds.length) {
      message.warning(t('video.review.noFailedClips'));
      return;
    }
    void handleRetryClips(failedIds);
  };

  const reviewPayloadForBilling = useMemo((): Record<string, unknown> | null => {
    if (!script || typeof script !== 'object') return null;
    return script as Record<string, unknown>;
  }, [script]);

  const { estimate: reviewEstimate, loading: reviewBillingLoading, blockApprove } =
    useReviewBillingEstimate({
      open,
      task,
      reviewPayload: reviewPayloadForBilling,
      enabled: !!script && !isRenderedReview,
    });

  const handleApprove = async () => {
    if (!task?.id) return;
    if (approveBlockedByClips) {
      message.warning(t('video.review.clipsNotReady'));
      return;
    }
    if (!isRenderedReview && blockApprove) {
      message.warning(reviewEstimate?.message || '余额不足或计费异常，暂不可继续');
      return;
    }
    const json = exportJson();
    if (!json) {
      message.error(t('video.review.invalidScript'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await approveTaskReview(task.id, {
        gateId: gateMeta?.gateId,
        reviewJson: json,
        approved: true,
      });
      if (res.error) throw new Error(res.error);
      message.success(
        isRenderedReview ? t('video.review.approveRefineSuccess') : t('video.review.approvePlanSuccess')
      );
      onApproved?.();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('video.review.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="100%"
      centered={false}
      wrapClassName="manual-review-modal-wrap--fullscreen"
      className={`manual-review-modal manual-review-modal--fullscreen video-timeline-review-modal${
        isRenderedReview
          ? ' video-timeline-review-modal--refine'
          : ' video-timeline-review-modal--plan'
      }`}
      styles={MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES}
      title={<ManualReviewModalTitle title={displayTitle} hint={reviewHint} />}
      destroyOnHidden
      footer={
        <div className="manual-review-modal__footer">
          <div className="manual-review-modal__footer-main">
            {!isRenderedReview ? (
              <ReviewBillingBar estimate={reviewEstimate} loading={reviewBillingLoading} />
            ) : null}
            {isRenderedReview && hasBlockingClipRenders ? (
              <span className="video-timeline-review__footer-hint">
                {t('video.review.clipsNotReadyCount', { count: blockingClipRenders.length })}
                {failedClipCount > 0 ? t('video.review.clipsFailedCount', { count: failedClipCount }) : ''}
                {t('video.review.retryBeforeApprove')}
              </span>
            ) : null}
            <div className="manual-review-modal__footer-actions">
              {isRenderedReview && failedClipCount > 0 ? (
                <Button loading={retrying && !retryingClipId} onClick={handleRetryAllFailed}>
                  {t('video.review.retryAllFailed')}
                </Button>
              ) : null}
              <Button onClick={onClose}>{t('video.review.cancel')}</Button>
              <Button
                type="primary"
                loading={submitting}
                disabled={
                  loadingDraft ||
                  submitting ||
                  retrying ||
                  !script ||
                  approveBlockedByClips ||
                  (!isRenderedReview && (blockApprove || reviewBillingLoading))
                }
                onClick={() => void handleApprove()}
              >
                {formatGenerateButtonLabel(
                  isRenderedReview ? t('video.review.approveExport') : t('video.review.approvePlan'),
                  isRenderedReview ? null : reviewEstimate,
                  reviewBillingLoading,
                  {
                    insufficientBalance: !!(
                      reviewEstimate &&
                      !reviewEstimate.allowed &&
                      !reviewEstimate.isAdmin &&
                      reviewEstimate.hasPricing !== false
                    ),
                    locale: toAppLang(i18n.language),
                  }
                )}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div
        className={`video-timeline-review video-timeline-review--fullscreen${
          isRenderedReview ? ' video-timeline-review--refine' : ' video-timeline-review--plan'
        }`}
      >
        <div className="video-timeline-review__layout">
          <div className="video-timeline-review__main-pane">
            <div className="video-timeline-review__preview-slot">
              {!previewReady && (
                <div className="video-timeline-review__preview-loading" aria-live="polite">
                  {showPreviewError ? (
                    <div className="video-timeline-review__preview-error">
                      <p className="video-timeline-review__preview-error-text">
                        {scriptParseFailed
                          ? t('video.review.scriptParseError')
                          : draftLoadError ?? t('video.review.draftLoadFailed')}
                      </p>
                      <Button size="small" onClick={handleReloadDraft}>
                        {t('video.review.reload')}
                      </Button>
                    </div>
                  ) : (
                    <VideoPreviewLoading
                      message={previewLoadingMessage}
                      phase={previewLoadingPhase}
                    />
                  )}
                </div>
              )}
              <SegmentPreview
                clip={previewClip}
                visualClips={visualClips}
                textClips={textClips}
                projectWidth={script?.project.settings.width}
                projectHeight={script?.project.settings.height}
                subtitles={subtitles}
                currentTime={playback.currentTime}
                timelinePhase={timelinePhase}
                projectTopic={projectTopic}
                fitContainer
                contentVisible={previewReady}
                isPlaying={playback.isPlaying}
                onContentReadyChange={setContentReady}
                selectedOverlayId={selection?.kind === 'overlay' ? selection.id : null}
                onSelectOverlay={
                  isRenderedReview
                    ? (id) => setSelection({ kind: 'overlay', id })
                    : undefined
                }
                onMoveOverlay={
                  isRenderedReview
                    ? (id, position) => {
                        const clip = textClips.find((c) => c.id === id);
                        if (!clip) return;
                        updateTextClip(id, {
                          transform: { ...clip.transform, position },
                        });
                      }
                    : undefined
                }
                onAutoStockBatchReady={
                  isRenderedReview
                    ? undefined
                    : (commits) => commitAutoStockSources(commits)
                }
              />
              {previewReady && activePreviewSubtitle && (
                <div className="video-timeline-review__preview-subtitle-bar" aria-live="polite">
                  <span className="video-timeline-review__preview-subtitle-bar-text">
                    {activePreviewSubtitle.text}
                  </span>
                </div>
              )}
            </div>
            <div className="video-timeline-review__timeline-slot">
              <TimelinePanel
                visualClips={visualClips}
                voiceClips={voiceClips}
                bgmClips={bgmClips}
                subtitles={subtitles}
                textClips={textClips}
                totalDuration={totalDuration}
                selection={selection}
                selectedVisualIds={selectedVisualIds}
                voiceSourceUrl={voicePreviewUrl}
                voicePlaybackUrl={voicePlaybackUrl}
                bgmPlaybackUrl={bgmPlaybackUrlResolved}
                voiceLoading={voiceoverPlayback.isLoading}
                previewReady={previewReady}
                currentTime={playback.currentTime}
                isPlaying={playback.isPlaying}
                voiceRef={playback.voiceRef}
                bgmRef={playback.bgmRef}
                onTogglePlay={playback.toggle}
                onSeek={handleSeek}
                onSelect={(sel) => {
                  setSelection(sel);
                  if (sel.kind === 'visual') setSelectedVisualIds([sel.id]);
                  else setSelectedVisualIds([]);
                }}
                onSelectVisual={handleSelectVisual}
                onResizeClipBoundary={resizeClipBoundary}
                canSplit={canSplitSelected}
                canDelete={canDeleteSelected}
                canMerge={canMergeSelected}
                canUndo={timelineEditState.canUndo}
                canRedo={timelineEditState.canRedo}
                onSplitAtPlayhead={handleSplitAtPlayhead}
                onDeleteSelectedClip={handleDeleteSelectedClip}
                onMergeWithNext={handleMergeWithNext}
                onUndo={handleUndoEdit}
                onRedo={handleRedoEdit}
                timelinePhase={timelinePhase}
              />
            </div>
          </div>
          <div className="video-timeline-review__inspector-scroll">
            {selectedOverlay ? (
              <OverlayInspector clip={selectedOverlay} onUpdate={updateTextClip} />
            ) : (
              <ClipInspector
                selection={selection}
                clip={selectedClip}
                subtitle={selectedSubtitle}
                audioInspector={selectedAudioInspector}
                subtitles={subtitles}
                taskId={task?.id ?? ''}
                gateId={gateMeta?.gateId}
                timelinePhase={timelinePhase}
                projectTopic={projectTopic}
                videoGeneratorOptions={videoGeneratorOptions}
                defaultVideoGenerator={defaultVideoGenerator}
                graphGeneratorOptions={graphGeneratorOptions}
                defaultGraphGenerator={defaultGraphGenerator}
                onUpdate={(id, patch) => updateClip(id, patch)}
                onUpdateMany={handleUpdateManyClips}
                selectedVisualIds={selectedVisualIds}
                onBatchRetryRender={isRenderedReview ? handleBatchRetryRender : undefined}
                batchBusy={batchBusy || retrying}
                onUpdateAudio={(id, patch) => updateAudioClip(id, patch)}
                onPickBgm={setBgmMedia}
                onClearBgm={clearBgmMedia}
                onUpdateSubtitle={updateSubtitle}
                onUpdateSegmentVoiceover={updateSegmentVoiceover}
                textClips={textClips}
                onUpdateTextClip={updateTextClip}
                onSelectOverlay={(id) => setSelection({ kind: 'overlay', id })}
                nextVisualClipId={nextVisualClipForSelected?.id ?? null}
                transitionToNext={transitionToNextForSelected}
                onUpdateTransition={updateTransition}
                onRetryClipRender={isRenderedReview ? handleRetryClip : undefined}
                retryingClipId={retryingClipId}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
