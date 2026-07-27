import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, InputNumber, Select, Switch, Typography } from 'antd';
import { INSPECTOR_TIPS } from '../manualReviewUserCopy';
import { AudioTrackInspector } from './AudioTrackInspector';
import { ClipStaticMediaSourceField } from './ClipStaticMediaSourceField';
import { InspectorField } from './InspectorField';
import type { AudioRole } from './audioTrackUtils';
import type {
  MxmImageFit,
  MxmImageMotion,
  MxmRenderMode,
  MxmVideoMode,
  TextClip,
  TimelineClip,
  TimelineSelection,
  TimelineSubtitle,
  TimelineTransition,
  VideoGeneratorOption,
} from './types';
import {
  buildStockSearchQuery,
  resolveClipSubtitleSearchContext,
  DEFAULT_AUTO_STOCK_IMAGE,
  DEFAULT_AUTO_STOCK_VIDEO,
  DEFAULT_IMAGE_FIT,
  IMAGE_FIT_LABEL_KEY,
  IMAGE_MOTION_LABEL_KEY,
  IMAGE_MOTION_OPTIONS,
  isAutoStockImageEnabled,
  isAutoStockVideoEnabled,
  isImageMotionEnabled,
  resolveClipImageMotion,
  ACTIVE_RENDER_MODES,
  RENDER_MODE_LABEL_KEY,
  RENDER_STATUS_LABEL_KEY,
  TRANSITION_TYPE_LABEL_KEY,
  TRANSITION_TYPE_OPTIONS,
  VIDEO_MODE_LABEL_KEY,
  formatGeneratorRouteValue,
  parseGeneratorRouteValue,
} from './types';
import { ClipReferenceMediaField } from './ClipReferenceMediaField';
import { normalizeClipReferenceAssets, syncLegacyReferenceFields } from './referenceAssetUtils';
import {
  normalizeVideoGeneratorRoute,
  resolveGeneratorLabel,
  resolveGeneratorRouteValue,
} from './generatorRouteUtils';
import { PageHint } from '../PageHint';
import { segmentVoiceoverDisplayText } from './segmentVoiceoverUtils';

type ClipItem = TimelineClip & { trackType: string; trackName: string };

type AudioInspectorState = {
  role: AudioRole;
  clipId: string;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  hasMedia: boolean;
};

type ClipInspectorProps = {
  selection: TimelineSelection | null;
  clip: ClipItem | null;
  subtitle: TimelineSubtitle | null;
  audioInspector: AudioInspectorState | null;
  subtitles: TimelineSubtitle[];
  taskId: string;
  gateId?: string;
  timelinePhase?: 'plan' | 'rendered';
  projectTopic?: string;
  videoGeneratorOptions?: VideoGeneratorOption[];
  defaultVideoGenerator?: { taskKey: string; subtype: string | null };
  graphGeneratorOptions?: VideoGeneratorOption[];
  defaultGraphGenerator?: { taskKey: string; subtype: string | null };
  onUpdate: (clipId: string, patch: Record<string, unknown>) => void;
  onUpdateAudio: (
    clipId: string,
    patch: { volume?: number; muted?: boolean; fadeIn?: number; fadeOut?: number }
  ) => void;
  onPickBgm: (url: string, assetId?: string) => void;
  onClearBgm: () => void;
  onUpdateSubtitle: (subtitleId: string, patch: { text?: string }) => void;
  onUpdateSegmentVoiceover?: (clipId: string, text: string) => void;
  textClips?: TextClip[];
  onUpdateTextClip?: (
    textClipId: string,
    patch: Partial<
      Pick<TextClip, 'text' | 'animation' | 'style' | 'transform' | 'startTime' | 'duration'>
    >
  ) => void;
  onSelectOverlay?: (id: string) => void;
  nextVisualClipId?: string | null;
  transitionToNext?: TimelineTransition | null;
  onUpdateTransition?: (
    clipAId: string,
    clipBId: string,
    patch: { type?: string; duration?: number }
  ) => void;
  onRetryClipRender?: (clipId: string) => void;
  retryingClipId?: string | null;
  /** 视频轨多选 id（≥2 时右侧进入批量配置） */
  selectedVisualIds?: string[];
  onUpdateMany?: (clipIds: string[], patch: Record<string, unknown>) => void;
  onBatchRetryRender?: (clipIds: string[]) => void;
  batchBusy?: boolean;
};

function isAlbumGraphRoute(taskKey?: string, subtype?: string | null): boolean {
  const tk = (taskKey ?? '').trim();
  const sub = (subtype ?? '').trim();
  return tk === 'group' || sub.includes('album');
}

function resolveAlbumGraphRoute(
  options: VideoGeneratorOption[],
  fallback?: { taskKey: string; subtype: string | null }
): { taskKey: string; subtype: string | null } {
  const hit = options.find((g) => isAlbumGraphRoute(g.taskKey, g.subtype));
  if (hit) return { taskKey: hit.taskKey, subtype: hit.subtype };
  if (fallback && isAlbumGraphRoute(fallback.taskKey, fallback.subtype)) {
    return { taskKey: fallback.taskKey, subtype: fallback.subtype };
  }
  return { taskKey: 'group', subtype: 'content-album' };
}

function overlapsClip(sub: TimelineSubtitle, clip: ClipItem): boolean {
  const clipEnd = clip.startTime + clip.duration;
  return sub.startTime < clipEnd && sub.endTime > clip.startTime;
}

function InspectorEmpty({ message, tip, tipTitle }: { message: string; tip?: string; tipTitle?: string }) {
  const { t } = useTranslation();
  return (
    <div className="video-timeline-review__inspector video-timeline-review__inspector--empty">
      <p className="video-timeline-review__inspector-empty-text">{message}</p>
      {tip ? (
        <PageHint title={tipTitle ?? t('video.inspector.tip')} description={tip} placement="left" />
      ) : null}
    </div>
  );
}

export function ClipInspector({
  selection,
  clip,
  subtitle,
  audioInspector,
  subtitles,
  taskId,
  gateId,
  timelinePhase = 'plan',
  projectTopic,
  videoGeneratorOptions = [],
  defaultVideoGenerator,
  graphGeneratorOptions = [],
  defaultGraphGenerator,
  onUpdate,
  onUpdateAudio,
  onPickBgm,
  onClearBgm,
  onUpdateSubtitle,
  onUpdateSegmentVoiceover,
  textClips = [],
  onUpdateTextClip,
  onSelectOverlay,
  nextVisualClipId = null,
  transitionToNext = null,
  onUpdateTransition,
  onRetryClipRender,
  retryingClipId = null,
  selectedVisualIds = [],
  onUpdateMany,
  onBatchRetryRender,
  batchBusy = false,
}: ClipInspectorProps) {
  const { t } = useTranslation();
  const multiIds = selectedVisualIds.length >= 2 ? selectedVisualIds : [];
  const isMulti = multiIds.length >= 2;
  const albumDefaultAppliedFor = useRef<string>('');
  const overlappingSubtitles = useMemo(() => {
    if (!clip) return [] as TimelineSubtitle[];
    return subtitles.filter((s) => overlapsClip(s, clip));
  }, [clip, subtitles]);

  const clipTextOverlays = useMemo(() => {
    if (!clip || textClips.length === 0) return [] as TextClip[];
    const clipEnd = clip.startTime + clip.duration;
    return textClips.filter(
      (tc) => tc.startTime < clipEnd && tc.startTime + tc.duration > clip.startTime
    );
  }, [clip, textClips]);

  const generatorSelectOptions = useMemo(() => {
    if (videoGeneratorOptions.length > 0) {
      return videoGeneratorOptions.map((g) => ({
        value: formatGeneratorRouteValue(g.taskKey, g.subtype),
        label: g.label,
      }));
    }
    const fallback = defaultVideoGenerator ?? { taskKey: 'generator', subtype: 'fragment' };
    const route = formatGeneratorRouteValue(fallback.taskKey, fallback.subtype);
    return [
      {
        value: route,
        label: t('video.inspector.defaultGeneratorLabel'),
      },
    ];
  }, [videoGeneratorOptions, defaultVideoGenerator, t]);

  const currentGeneratorRoute = useMemo(() => {
    const meta = clip?.metadata ?? {};
    return (
      resolveGeneratorRouteValue(meta.mxmVideoTaskKey, meta.mxmVideoSubtype) ||
      resolveGeneratorRouteValue(
        defaultVideoGenerator?.taskKey,
        defaultVideoGenerator?.subtype ?? 'fragment'
      )
    );
  }, [clip?.metadata, defaultVideoGenerator]);

  const currentGeneratorLabel = useMemo(
    () => resolveGeneratorLabel(currentGeneratorRoute, videoGeneratorOptions),
    [currentGeneratorRoute, videoGeneratorOptions]
  );

  const graphGeneratorSelectOptions = useMemo(() => {
    if (graphGeneratorOptions.length > 0) {
      return graphGeneratorOptions.map((g) => ({
        value: formatGeneratorRouteValue(g.taskKey, g.subtype),
        label: g.label,
      }));
    }
    const fallback = defaultGraphGenerator ?? { taskKey: 'design', subtype: 'content-illustration' };
    const route = formatGeneratorRouteValue(fallback.taskKey, fallback.subtype);
    return [{ value: route, label: t('video.inspector.defaultGraphLabel') }];
  }, [graphGeneratorOptions, defaultGraphGenerator, t]);

  const currentGraphGeneratorRoute = useMemo(() => {
    const meta = clip?.metadata ?? {};
    return (
      formatGeneratorRouteValue(meta.mxmGraphTaskKey, meta.mxmGraphSubtype) ||
      formatGeneratorRouteValue(
        defaultGraphGenerator?.taskKey ?? 'design',
        defaultGraphGenerator?.subtype ?? 'content-illustration'
      )
    );
  }, [clip?.metadata, defaultGraphGenerator]);

  const currentGraphGeneratorLabel = useMemo(
    () => resolveGeneratorLabel(currentGraphGeneratorRoute, graphGeneratorOptions),
    [currentGraphGeneratorRoute, graphGeneratorOptions]
  );

  const albumRoute = useMemo(
    () => resolveAlbumGraphRoute(graphGeneratorOptions, defaultGraphGenerator),
    [graphGeneratorOptions, defaultGraphGenerator]
  );
  const albumRouteValue = formatGeneratorRouteValue(albumRoute.taskKey, albumRoute.subtype);

  // 多选 + 已选「AI 生成 / AI 配图」→ 默认图集/内容配图（每种多选自集合只写入一次）
  useEffect(() => {
    if (!isMulti || !onUpdateMany || !clip) return;
    const m = clip.metadata ?? {};
    const modeNow = m.mxmRenderMode ?? 'ai-video-gen';
    const kindNow = m.mxmAiOutputKind ?? 'video';
    if (modeNow !== 'ai-video-gen' || kindNow !== 'image') return;
    const key = multiIds.slice().sort().join(',');
    if (albumDefaultAppliedFor.current === key) return;
    albumDefaultAppliedFor.current = key;
    onUpdateMany(multiIds, {
      mxmGraphTaskKey: albumRoute.taskKey,
      mxmGraphSubtype: albumRoute.subtype ?? undefined,
    });
  }, [
    isMulti,
    multiIds,
    onUpdateMany,
    clip,
    albumRoute.taskKey,
    albumRoute.subtype,
  ]);

  const segmentVoiceoverText = useMemo(() => {
    if (!clip) return '';
    return segmentVoiceoverDisplayText(clip.metadata ?? {}, clip, subtitles);
  }, [clip, subtitles]);

  const showSegmentVoiceover = useMemo(() => {
    if (!clip) return false;
    const meta = clip.metadata ?? {};
    return (
      timelinePhase === 'plan' ||
      overlappingSubtitles.length > 0 ||
      Boolean(meta.mxmVoiceoverText?.trim())
    );
  }, [clip, timelinePhase, overlappingSubtitles]);

  if (selection?.kind === 'subtitle') {
    if (!subtitle) {
      return <InspectorEmpty message={t('video.inspector.subtitleMissing')} />;
    }
    return (
      <div className="video-timeline-review__inspector">
        <header className="video-timeline-review__inspector-header">
          <h4 className="video-timeline-review__inspector-title">{t('video.inspector.subtitle')}</h4>
          <PageHint title={t('video.inspector.subtitleHelp')} description={INSPECTOR_TIPS.subtitleEdit} placement="left" />
        </header>
        <div className="video-timeline-review__inspector-body">
          <div className="video-timeline-review__inspector-meta">
            {subtitle.startTime.toFixed(1)}s – {subtitle.endTime.toFixed(1)}s
          </div>
          <InspectorField label={t('video.inspector.subtitleText')}>
            <Input.TextArea
              rows={4}
              value={subtitle.text}
              onChange={(e) => onUpdateSubtitle(subtitle.id, { text: e.target.value })}
            />
          </InspectorField>
        </div>
      </div>
    );
  }

  if (selection?.kind === 'audio' && audioInspector) {
    return (
      <AudioTrackInspector
        role={audioInspector.role}
        volume={audioInspector.volume}
        muted={audioInspector.muted}
        fadeIn={audioInspector.fadeIn}
        fadeOut={audioInspector.fadeOut}
        hasMedia={audioInspector.hasMedia}
        onUpdate={(patch) => onUpdateAudio(audioInspector.clipId, patch)}
        onPickMedia={audioInspector.role === 'bgm' ? onPickBgm : undefined}
        onClearMedia={audioInspector.role === 'bgm' ? onClearBgm : undefined}
      />
    );
  }

  if (!clip) {
    return (
      <InspectorEmpty message={t('video.inspector.selectBlockToEdit')} tip={INSPECTOR_TIPS.clipEmpty} />
    );
  }

  const meta = clip.metadata ?? {};
  const mode = meta.mxmRenderMode ?? 'ai-video-gen';
  const stockSearchDefault = buildStockSearchQuery(
    meta,
    undefined,
    resolveClipSubtitleSearchContext(subtitles, clip.startTime, clip.duration, projectTopic)
  );
  const hasManualMedia = Boolean(meta.mxmSourceImageUrl?.trim() || meta.mxmSourceVideoUrl?.trim());
  const videoMode: MxmVideoMode = meta.mxmVideoMode ?? 'text-to-video';
  const isRenderedReview = timelinePhase === 'rendered';
  const aiOutputKind = meta.mxmAiOutputKind ?? 'video';
  const canPickGraphBusiness = mode === 'ai-video-gen' && aiOutputKind === 'image';

  const patchClips = (patch: Record<string, unknown>) => {
    if (isMulti && onUpdateMany) onUpdateMany(multiIds, patch);
    else onUpdate(clip.id, patch);
  };

  const applyGeneratorRoute = (routeValue: string) => {
    const { taskKey, subtype } = parseGeneratorRouteValue(routeValue);
    const normalized = normalizeVideoGeneratorRoute(taskKey, subtype);
    patchClips({
      mxmVideoTaskKey: normalized.taskKey,
      mxmVideoSubtype: normalized.subtype ?? undefined,
    });
  };

  const applyGraphGeneratorRoute = (routeValue: string) => {
    if (!canPickGraphBusiness) return;
    const { taskKey, subtype } = parseGeneratorRouteValue(routeValue);
    patchClips({
      mxmGraphTaskKey: taskKey,
      mxmGraphSubtype: subtype ?? undefined,
    });
  };

  const displayGraphRoute =
    canPickGraphBusiness && isMulti && !isAlbumGraphRoute(meta.mxmGraphTaskKey, meta.mxmGraphSubtype)
      ? albumRouteValue
      : currentGraphGeneratorRoute;

  return (
    <div className="video-timeline-review__inspector">
      <header className="video-timeline-review__inspector-header">
        <h4 className="video-timeline-review__inspector-title">
          {isMulti ? t('video.batchAi.selected', { count: multiIds.length }) : t('video.inspector.currentClip')}
        </h4>
        <span className="video-timeline-review__inspector-meta">
          {isMulti
            ? t('video.batchAi.multiSelectHint')
            : `${clip.startTime.toFixed(1)}s · ${clip.duration.toFixed(1)}s`}
        </span>
      </header>

      <div className="video-timeline-review__inspector-body">
        {showSegmentVoiceover && onUpdateSegmentVoiceover && !isMulti ? (
          <section className="video-timeline-review__inspector-subtitle-block">
            <header className="video-timeline-review__inspector-subtitle-head">
              <span>{t('video.inspector.segmentVoiceover')}</span>
              <PageHint
                title={t('video.inspector.segmentVoiceover')}
                description={INSPECTOR_TIPS.segmentSubtitles}
                placement="left"
              />
            </header>
            <Input.TextArea
              rows={3}
              placeholder={t('video.inspector.segmentVoiceoverPlaceholder')}
              value={segmentVoiceoverText}
              onChange={(e) => onUpdateSegmentVoiceover(clip.id, e.target.value)}
            />
          </section>
        ) : null}

        {!isRenderedReview && (
          <>
        <InspectorField
          label={t('video.inspector.visualType')}
          tip={{ title: t('video.inspector.visualType'), description: INSPECTOR_TIPS.visualMode }}
        >
          <Select
            value={mode}
            onChange={(v: MxmRenderMode) =>
              patchClips({
                mxmRenderMode: v,
                ...(v === 'static-image'
                  ? {
                      mxmAutoStockImage: meta.mxmAutoStockImage ?? DEFAULT_AUTO_STOCK_IMAGE,
                      mxmAutoStockVideo: meta.mxmAutoStockVideo ?? DEFAULT_AUTO_STOCK_VIDEO,
                    }
                  : {}),
              })
            }
            options={ACTIVE_RENDER_MODES.map((k) => ({
              value: k,
              label: t(RENDER_MODE_LABEL_KEY[k]),
            }))}
          />
        </InspectorField>

        {!isMulti && (
        <InspectorField
          label={t('video.inspector.durationSec')}
          tip={{ title: t('video.inspector.durationTip'), description: INSPECTOR_TIPS.duration }}
        >
          <InputNumber
            min={0.5}
            max={120}
            step={0.5}
            style={{ width: '100%' }}
            value={clip.duration}
            onChange={(v) => v != null && onUpdate(clip.id, { duration: v })}
          />
        </InspectorField>
        )}

        {mode === 'ai-video-gen' && (
          <>
            <InspectorField
              label={t('video.inspector.aiOutputKind')}
              tip={{
                title: t('video.inspector.aiOutputVideoOrImage'),
                description: t('video.inspector.aiOutputVideoOrImageDesc'),
              }}
            >
              <Select
                value={aiOutputKind}
                onChange={(v: 'video' | 'image') => {
                  const albumPatch =
                    v === 'image' && isMulti
                      ? {
                          mxmGraphTaskKey: albumRoute.taskKey,
                          mxmGraphSubtype: albumRoute.subtype ?? undefined,
                        }
                      : {};
                  patchClips({
                    mxmAiOutputKind: v,
                    ...(v === 'image'
                      ? {
                          mxmImageMotionEnabled: meta.mxmImageMotionEnabled ?? true,
                          mxmImageMotion:
                            meta.mxmImageMotion && meta.mxmImageMotion !== 'none'
                              ? meta.mxmImageMotion
                              : 'zoom-in',
                          ...albumPatch,
                        }
                      : {}),
                  });
                }}
                options={[
                  { value: 'video', label: t('video.inspector.aiVideoSeedance') },
                  { value: 'image', label: t('video.inspector.aiImageMotion') },
                ]}
              />
            </InspectorField>
            {isMulti && aiOutputKind === 'video' ? (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                {t('video.batchAi.needAiImageFirst')}
              </Typography.Text>
            ) : null}
            {!isMulti && (
            <InspectorField
              label={t('video.inspector.referenceMedia')}
              tip={{
                title: t('video.inspector.seedanceRefTitle'),
                description: t('video.inspector.seedanceRefDesc'),
              }}
            >
              <ClipReferenceMediaField
                taskId={taskId}
                assets={normalizeClipReferenceAssets(meta)}
                onChange={(next) => {
                  onUpdate(clip.id, {
                    ...syncLegacyReferenceFields(next),
                    mxmUserEdited: true,
                  });
                }}
              />
            </InspectorField>
            )}
            {aiOutputKind === 'video' ? (
              !isMulti ? (
              <>
            <InspectorField
              label={t('video.inspector.generatorBusiness')}
              tip={{
                title: t('video.inspector.generatorBusinessTitle'),
                description: t('video.inspector.generatorBusinessDesc'),
              }}
            >
              <Select
                value={currentGeneratorRoute}
                onChange={applyGeneratorRoute}
                options={generatorSelectOptions}
                optionLabelProp="label"
                labelRender={() => currentGeneratorLabel}
              />
            </InspectorField>
            <InspectorField label={t('video.inspector.videoGenMode')}>
              <Select
                value={videoMode}
                onChange={(v: MxmVideoMode) => patchClips({ mxmVideoMode: v })}
                options={(Object.keys(VIDEO_MODE_LABEL_KEY) as MxmVideoMode[]).map((k) => ({
                  value: k,
                  label: t(VIDEO_MODE_LABEL_KEY[k]),
                }))}
              />
            </InspectorField>
            <InspectorField
              label={t('video.inspector.videoPrompt')}
              tip={{ title: t('video.inspector.videoPromptTitle'), description: t('video.inspector.videoPromptDesc') }}
            >
              <Input.TextArea
                rows={4}
                value={meta.mxmVideoPrompt ?? meta.mxmPrompt ?? ''}
                onChange={(e) =>
                  patchClips({ mxmVideoPrompt: e.target.value, mxmPrompt: undefined })
                }
                placeholder={t('video.inspector.videoPromptPlaceholder')}
              />
            </InspectorField>
              </>
              ) : null
            ) : (
              <>
                <InspectorField
                  label={t('video.inspector.graphBusiness')}
                  tip={{
                    title: t('video.inspector.graphBusinessTitle'),
                    description: isMulti
                      ? t('video.batchAi.graphBusinessMultiDesc')
                      : t('video.inspector.graphBusinessDesc'),
                  }}
                >
                  <Select
                    value={displayGraphRoute}
                    onChange={applyGraphGeneratorRoute}
                    options={graphGeneratorSelectOptions}
                    optionLabelProp="label"
                    labelRender={() =>
                      resolveGeneratorLabel(displayGraphRoute, graphGeneratorOptions)
                    }
                    disabled={!canPickGraphBusiness}
                    placeholder={t('video.batchAi.needAiImageFirst')}
                  />
                </InspectorField>
                {isMulti && canPickGraphBusiness ? (
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4 }}>
                    {t('video.batchAi.hintPlan')}
                  </Typography.Paragraph>
                ) : null}
                {isMulti && canPickGraphBusiness && isRenderedReview && onBatchRetryRender ? (
                  <Button
                    type="primary"
                    block
                    loading={batchBusy}
                    style={{ marginBottom: 12 }}
                    onClick={() => onBatchRetryRender(multiIds)}
                  >
                    {t('video.batchAi.generate')}
                  </Button>
                ) : null}
                {!isMulti && (
                <InspectorField
                  label={t('video.inspector.graphPrompt')}
                  tip={{
                    title: t('video.inspector.graphPromptTitle'),
                    description: t('video.inspector.graphPromptDesc'),
                  }}
                >
                  <Input.TextArea
                    rows={4}
                    value={meta.mxmImagePrompt ?? meta.mxmPrompt ?? ''}
                    onChange={(e) =>
                      patchClips({ mxmImagePrompt: e.target.value, mxmPrompt: undefined })
                    }
                    placeholder={t('video.inspector.graphPromptPlaceholder')}
                  />
                </InspectorField>
                )}
                <InspectorField label={t('video.inspector.imageFit')}>
                  <Select
                    value={meta.mxmImageFit ?? DEFAULT_IMAGE_FIT}
                    onChange={(v: MxmImageFit) => patchClips({ mxmImageFit: v })}
                    options={(Object.keys(IMAGE_FIT_LABEL_KEY) as MxmImageFit[]).map((k) => ({
                      value: k,
                      label: t(IMAGE_FIT_LABEL_KEY[k]),
                    }))}
                  />
                </InspectorField>
                <div className="video-timeline-review__switch-row">
                  <span className="video-timeline-review__switch-label">{t('video.inspector.imageMotion')}</span>
                  <Switch
                    checked={isImageMotionEnabled(meta)}
                    onChange={(checked) => {
                      if (checked) {
                        patchClips({
                          mxmImageMotionEnabled: true,
                          mxmImageMotion:
                            meta.mxmImageMotion && meta.mxmImageMotion !== 'none'
                              ? meta.mxmImageMotion
                              : 'zoom-in',
                        });
                      } else {
                        patchClips({
                          mxmImageMotionEnabled: false,
                          mxmImageMotion: 'none',
                        });
                      }
                    }}
                  />
                </div>
                {isImageMotionEnabled(meta) ? (
                  <InspectorField label={t('video.inspector.motionType')}>
                    <Select
                      value={resolveClipImageMotion(meta)}
                      onChange={(v: MxmImageMotion) => patchClips({ mxmImageMotion: v })}
                      options={IMAGE_MOTION_OPTIONS.map((k) => ({
                        value: k,
                        label: t(IMAGE_MOTION_LABEL_KEY[k]),
                      }))}
                    />
                  </InspectorField>
                ) : null}
              </>
            )}
          </>
        )}

        {mode === 'static-image' && !isMulti && (
          <>
            <InspectorField
              label={t('video.inspector.mediaSource')}
              tip={{ title: t('video.inspector.manualMediaPick'), description: INSPECTOR_TIPS.stockManualPick }}
            >
              <ClipStaticMediaSourceField
                imageUrl={meta.mxmSourceImageUrl}
                videoUrl={meta.mxmSourceVideoUrl}
                assetId={meta.mxmSourceAssetId}
                stockSearchDefault={stockSearchDefault}
                onChange={(patch) => onUpdate(clip.id, patch)}
              />
              {hasManualMedia ? (
                <p className="video-timeline-review__inspector-hint">
                  {t('video.inspector.manualMediaSelected')}
                </p>
              ) : (
                <p className="video-timeline-review__inspector-hint">
                  {t('video.inspector.autoMatchWhenEmpty')}
                </p>
              )}
            </InspectorField>

            <InspectorField
              label={t('video.inspector.stockQuery')}
              tip={{ title: t('video.inspector.stockQueryTitle'), description: INSPECTOR_TIPS.stockQuery }}
            >
              <Input.TextArea
                rows={2}
                placeholder={stockSearchDefault}
                value={meta.mxmStockSearchQuery ?? ''}
                onChange={(e) => onUpdate(clip.id, { mxmStockSearchQuery: e.target.value })}
              />
            </InspectorField>

            <div className="video-timeline-review__switch-row">
              <span className="video-timeline-review__switch-label">
                {t('video.inspector.autoStockImage')}
                <PageHint
                  title={t('video.inspector.autoStockImage')}
                  description={INSPECTOR_TIPS.autoStockImage}
                  placement="left"
                />
              </span>
              <Switch
                checked={isAutoStockImageEnabled(meta)}
                onChange={(checked) => onUpdate(clip.id, { mxmAutoStockImage: checked })}
              />
            </div>

            <div className="video-timeline-review__switch-row">
              <span className="video-timeline-review__switch-label">
                {t('video.inspector.autoStockVideo')}
                <PageHint
                  title={t('video.inspector.autoStockVideo')}
                  description={INSPECTOR_TIPS.autoStockVideo}
                  placement="left"
                />
              </span>
              <Switch
                checked={isAutoStockVideoEnabled(meta)}
                onChange={(checked) => onUpdate(clip.id, { mxmAutoStockVideo: checked })}
              />
            </div>

            <InspectorField
              label={t('video.inspector.imageFit')}
              tip={{ title: t('video.inspector.imageFit'), description: INSPECTOR_TIPS.imageFit }}
            >
              <Select
                value={meta.mxmImageFit ?? DEFAULT_IMAGE_FIT}
                onChange={(v: MxmImageFit) => onUpdate(clip.id, { mxmImageFit: v })}
                options={(Object.keys(IMAGE_FIT_LABEL_KEY) as MxmImageFit[]).map((k) => ({
                  value: k,
                  label: t(IMAGE_FIT_LABEL_KEY[k]),
                }))}
              />
            </InspectorField>

            {!hasManualMedia && !isAutoStockVideoEnabled(meta) ? (
              <>
                <div className="video-timeline-review__switch-row">
                  <span className="video-timeline-review__switch-label">
                    {t('video.inspector.imageMotion')}
                    <PageHint
                      title={t('video.inspector.imageMotion')}
                      description={INSPECTOR_TIPS.imageMotion}
                      placement="left"
                    />
                  </span>
                  <Switch
                    checked={isImageMotionEnabled(meta)}
                    onChange={(checked) => {
                      if (checked) {
                        onUpdate(clip.id, {
                          mxmImageMotionEnabled: true,
                          mxmImageMotion:
                            meta.mxmImageMotion && meta.mxmImageMotion !== 'none'
                              ? meta.mxmImageMotion
                              : 'zoom-in',
                        });
                      } else {
                        onUpdate(clip.id, {
                          mxmImageMotionEnabled: false,
                          mxmImageMotion: 'none',
                        });
                      }
                    }}
                  />
                </div>
                {isImageMotionEnabled(meta) ? (
                  <InspectorField label={t('video.inspector.motionType')}>
                    <Select
                      value={resolveClipImageMotion(meta)}
                      onChange={(v: MxmImageMotion) => onUpdate(clip.id, { mxmImageMotion: v })}
                      options={IMAGE_MOTION_OPTIONS.map((k) => ({
                        value: k,
                        label: t(IMAGE_MOTION_LABEL_KEY[k]),
                      }))}
                    />
                  </InspectorField>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {mode === 'gsap-html-animation' && (
          <div className="video-timeline-review__inspector-legacy-note" style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
              {t('video.inspector.gsapLegacyNote')}
            </p>
            <Button size="small" onClick={() => onUpdate(clip.id, { mxmRenderMode: 'static-image' })}>
              {t('video.inspector.switchToStaticImage')}
            </Button>
          </div>
        )}
          </>
        )}

        {isRenderedReview && isMulti ? (
          <>
            <InspectorField
              label={t('video.inspector.visualType')}
              tip={{ title: t('video.inspector.visualType'), description: INSPECTOR_TIPS.visualMode }}
            >
              <Select
                value={mode}
                onChange={(v: MxmRenderMode) => patchClips({ mxmRenderMode: v })}
                options={ACTIVE_RENDER_MODES.map((k) => ({
                  value: k,
                  label: t(RENDER_MODE_LABEL_KEY[k]),
                }))}
              />
            </InspectorField>
            {mode === 'ai-video-gen' ? (
              <>
                <InspectorField label={t('video.inspector.aiOutputKind')}>
                  <Select
                    value={aiOutputKind}
                    onChange={(v: 'video' | 'image') => {
                      patchClips({
                        mxmAiOutputKind: v,
                        ...(v === 'image'
                          ? {
                              mxmImageMotionEnabled: true,
                              mxmImageMotion: 'zoom-in',
                              mxmGraphTaskKey: albumRoute.taskKey,
                              mxmGraphSubtype: albumRoute.subtype ?? undefined,
                              mxmAutoStockImage: false,
                            }
                          : {}),
                      });
                    }}
                    options={[
                      { value: 'video', label: t('video.inspector.aiVideoSeedance') },
                      { value: 'image', label: t('video.inspector.aiImageMotion') },
                    ]}
                  />
                </InspectorField>
                {aiOutputKind !== 'image' ? (
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                    {t('video.batchAi.needAiImageFirst')}
                  </Typography.Text>
                ) : (
                  <InspectorField label={t('video.inspector.graphBusiness')}>
                    <Select
                      value={displayGraphRoute}
                      onChange={applyGraphGeneratorRoute}
                      options={graphGeneratorSelectOptions}
                      optionLabelProp="label"
                      labelRender={() =>
                        resolveGeneratorLabel(displayGraphRoute, graphGeneratorOptions)
                      }
                    />
                  </InspectorField>
                )}
                {canPickGraphBusiness && onBatchRetryRender ? (
                  <Button
                    type="primary"
                    block
                    loading={batchBusy}
                    style={{ marginBottom: 12 }}
                    onClick={() => onBatchRetryRender(multiIds)}
                  >
                    {t('video.batchAi.generate')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {isRenderedReview && !isMulti && meta.mxmRenderStatus && (
          <div
            className={`video-timeline-review__status-pill video-timeline-review__status-pill--${meta.mxmRenderStatus}`}
          >
            {t(RENDER_STATUS_LABEL_KEY[meta.mxmRenderStatus])}
            {meta.mxmRenderError ? `：${meta.mxmRenderError}` : ''}
          </div>
        )}

        {isRenderedReview && !isMulti && meta.mxmRenderStatus === 'failed' && onRetryClipRender ? (
          <Button
            type="primary"
            block
            loading={retryingClipId === clip.id}
            disabled={Boolean(retryingClipId && retryingClipId !== clip.id)}
            onClick={() => onRetryClipRender(clip.id)}
          >
            {t('video.inspector.retryClip')}
          </Button>
        ) : null}

        {isRenderedReview && (
          <PageHint
            title={t('video.inspector.refineTitle')}
            description={INSPECTOR_TIPS.renderedDelta}
            label={t('video.inspector.refineLabel')}
            placement="left"
          />
        )}

        {isRenderedReview && nextVisualClipId && onUpdateTransition ? (
          <section className="video-timeline-review__inspector-overlay-block">
            <header className="video-timeline-review__inspector-subsection-title">
              {t('video.inspector.transitionToNext')}
              <PageHint
                title={t('video.inspector.transition')}
                description={INSPECTOR_TIPS.refineTransition}
                placement="left"
              />
            </header>
            <InspectorField label={t('video.inspector.effect')}>
              <Select
                value={transitionToNext?.type ?? 'crossfade'}
                onChange={(v: string) =>
                  onUpdateTransition(clip.id, nextVisualClipId, { type: v })
                }
                options={TRANSITION_TYPE_OPTIONS.map((k) => ({
                  value: k,
                  label: t(TRANSITION_TYPE_LABEL_KEY[k] ?? k),
                }))}
              />
            </InspectorField>
            <InspectorField label={t('video.inspector.durationSec')}>
              <InputNumber
                min={0.1}
                max={3}
                step={0.1}
                style={{ width: '100%' }}
                value={transitionToNext?.duration ?? 0.5}
                onChange={(v) =>
                  v != null &&
                  onUpdateTransition(clip.id, nextVisualClipId, { duration: v })
                }
              />
            </InspectorField>
          </section>
        ) : null}

        {isRenderedReview && clipTextOverlays.length > 0 ? (
          <section className="video-timeline-review__inspector-overlay-block">
            <header className="video-timeline-review__inspector-subsection-title">
              {t('video.inspector.textOverlay')}
              <PageHint
                title={t('video.inspector.textOverlay')}
                description={t('video.inspector.overlayListDesc')}
                placement="left"
              />
            </header>
            {clipTextOverlays.map((ov) => (
              <button
                key={ov.id}
                type="button"
                className="video-timeline-review__inspector-overlay-link"
                onClick={() => onSelectOverlay?.(ov.id)}
              >
                <span className="video-timeline-review__inspector-overlay-link-text">
                  {ov.text.slice(0, 24) || t('video.inspector.emptyOverlayText')}
                </span>
                <span className="video-timeline-review__inspector-overlay-link-meta">
                  {ov.style.fontSize}px · {ov.startTime.toFixed(1)}s
                </span>
              </button>
            ))}
          </section>
        ) : null}

        {overlappingSubtitles.length > 1 && (
          <section className="video-timeline-review__inspector-subtitle-block">
            <header className="video-timeline-review__inspector-subtitle-head">
              <span>{t('video.inspector.perSentenceEdit')}</span>
              <PageHint
                title={t('video.inspector.perSentenceEditTitle')}
                description={t('video.inspector.perSentenceEditDesc')}
                placement="left"
              />
            </header>
            {overlappingSubtitles.map((sub) => (
              <div key={sub.id} className="video-timeline-review__inspector-subtitle-item">
                <label>
                  {sub.startTime.toFixed(1)}s – {sub.endTime.toFixed(1)}s
                </label>
                <Input.TextArea
                  rows={2}
                  value={sub.text}
                  onChange={(e) => onUpdateSubtitle(sub.id, { text: e.target.value })}
                />
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
