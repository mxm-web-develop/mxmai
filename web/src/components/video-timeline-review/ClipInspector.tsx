import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, InputNumber, Select, Switch } from 'antd';
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
};

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
}: ClipInspectorProps) {
  const { t } = useTranslation();
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

  const applyGeneratorRoute = (routeValue: string) => {
    const { taskKey, subtype } = parseGeneratorRouteValue(routeValue);
    const normalized = normalizeVideoGeneratorRoute(taskKey, subtype);
    onUpdate(clip.id, {
      mxmVideoTaskKey: normalized.taskKey,
      mxmVideoSubtype: normalized.subtype ?? undefined,
    });
  };

  const applyGraphGeneratorRoute = (routeValue: string) => {
    const { taskKey, subtype } = parseGeneratorRouteValue(routeValue);
    onUpdate(clip.id, {
      mxmGraphTaskKey: taskKey,
      mxmGraphSubtype: subtype ?? undefined,
    });
  };

  const aiOutputKind = meta.mxmAiOutputKind ?? 'video';

  return (
    <div className="video-timeline-review__inspector">
      <header className="video-timeline-review__inspector-header">
        <h4 className="video-timeline-review__inspector-title">{t('video.inspector.currentClip')}</h4>
        <span className="video-timeline-review__inspector-meta">
          {clip.startTime.toFixed(1)}s · {clip.duration.toFixed(1)}s
        </span>
      </header>

      <div className="video-timeline-review__inspector-body">
        {showSegmentVoiceover && onUpdateSegmentVoiceover ? (
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
              onUpdate(clip.id, {
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
                onChange={(v: 'video' | 'image') =>
                  onUpdate(clip.id, {
                    mxmAiOutputKind: v,
                    ...(v === 'image'
                      ? {
                          mxmImageMotionEnabled: meta.mxmImageMotionEnabled ?? true,
                          mxmImageMotion:
                            meta.mxmImageMotion && meta.mxmImageMotion !== 'none'
                              ? meta.mxmImageMotion
                              : 'zoom-in',
                        }
                      : {}),
                  })
                }
                options={[
                  { value: 'video', label: t('video.inspector.aiVideoSeedance') },
                  { value: 'image', label: t('video.inspector.aiImageMotion') },
                ]}
              />
            </InspectorField>
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
            {aiOutputKind === 'video' ? (
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
                onChange={(v: MxmVideoMode) => onUpdate(clip.id, { mxmVideoMode: v })}
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
                value={meta.mxmPrompt ?? ''}
                onChange={(e) => onUpdate(clip.id, { mxmPrompt: e.target.value })}
                placeholder={t('video.inspector.videoPromptPlaceholder')}
              />
            </InspectorField>
              </>
            ) : (
              <>
                <InspectorField
                  label={t('video.inspector.graphBusiness')}
                  tip={{
                    title: t('video.inspector.graphBusinessTitle'),
                    description: t('video.inspector.graphBusinessDesc'),
                  }}
                >
                  <Select
                    value={currentGraphGeneratorRoute}
                    onChange={applyGraphGeneratorRoute}
                    options={graphGeneratorSelectOptions}
                    optionLabelProp="label"
                    labelRender={() => currentGraphGeneratorLabel}
                  />
                </InspectorField>
                <InspectorField
                  label={t('video.inspector.graphPrompt')}
                  tip={{
                    title: t('video.inspector.graphPromptTitle'),
                    description: t('video.inspector.graphPromptDesc'),
                  }}
                >
                  <Input.TextArea
                    rows={4}
                    value={meta.mxmPrompt ?? ''}
                    onChange={(e) => onUpdate(clip.id, { mxmPrompt: e.target.value })}
                    placeholder={t('video.inspector.graphPromptPlaceholder')}
                  />
                </InspectorField>
                <InspectorField label={t('video.inspector.imageFit')}>
                  <Select
                    value={meta.mxmImageFit ?? DEFAULT_IMAGE_FIT}
                    onChange={(v: MxmImageFit) => onUpdate(clip.id, { mxmImageFit: v })}
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
            )}
          </>
        )}

        {mode === 'static-image' && (
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

        {isRenderedReview && meta.mxmRenderStatus && (
          <div
            className={`video-timeline-review__status-pill video-timeline-review__status-pill--${meta.mxmRenderStatus}`}
          >
            {t(RENDER_STATUS_LABEL_KEY[meta.mxmRenderStatus])}
            {meta.mxmRenderError ? `：${meta.mxmRenderError}` : ''}
          </div>
        )}

        {isRenderedReview && meta.mxmRenderStatus === 'failed' && onRetryClipRender ? (
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
