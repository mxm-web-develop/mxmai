import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MxmClipMetadata,
  MxmRenderMode,
  TextClip,
  TimelineClip,
  TimelineSubtitle,
  VideoEditScript,
} from './types';
import {
  ensureBgmTrack,
  findAudioTrack,
  getClipAudioSettings,
  normalizeVoiceTrackLabels,
  resolveAudioRole,
  type AudioRole,
} from './audioTrackUtils';
import {
  enrichVoiceoverTimeline,
  normalizeScriptMediaUrls,
  resolveMediaUrl,
  rewriteInternalStorageMediaUrl,
  type VoiceoverEnrichInput,
} from './voiceoverTimelineEnrich';
import { stripSubtitlePunctuation } from '../../lib/subtitleDisplayText';
import { distributeTextToSubtitles } from './segmentVoiceoverUtils';
import { resizeClipBoundaryInScript, collectVisualClipRefs } from './timelineClipResize';
import {
  canDeleteVisualClip,
  canMergeVisualClipWithNext,
  canSplitVisualClip,
  deleteVisualClipInScript,
  mergeVisualClipWithNextInScript,
  splitVisualClipInScript,
  type TimelineEditResult,
} from './timelineEditActions';
import { useTimelineEditHistory } from './useTimelineEditHistory';
import { parseVideoEditScript } from './parseVideoEditScript';

export type VisualClipItem = TimelineClip & { trackType: string; trackName: string };

function parseScript(raw: unknown): VideoEditScript | null {
  return parseVideoEditScript(raw);
}

export type AudioClipItem = TimelineClip & {
  trackType: 'audio';
  trackName: string;
  audioRole: AudioRole;
  mediaUrl?: string;
};

function finalizeScript(script: VideoEditScript, enrichInput?: VoiceoverEnrichInput): VideoEditScript {
  const normalized = normalizeScriptMediaUrls(script);
  if (enrichInput?.audioUrl || enrichInput?.subtitles?.length) {
    return enrichVoiceoverTimeline(normalized, enrichInput);
  }
  return ensureBgmTrack(normalizeVoiceTrackLabels(normalized));
}

function applyEnrich(raw: unknown, enrichInput?: VoiceoverEnrichInput): VideoEditScript | null {
  const parsed = parseScript(raw);
  if (!parsed) return null;
  return finalizeScript(parsed, enrichInput);
}

function enrichInputKey(input?: VoiceoverEnrichInput): string {
  if (!input) return '';
  return JSON.stringify({
    audioUrl: input.audioUrl ?? '',
    durationSeconds: input.durationSeconds ?? 0,
    subtitleCount: input.subtitles?.length ?? 0,
  });
}

function scriptHasUserEdits(script: VideoEditScript | null): boolean {
  if (!script) return false;
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.metadata?.mxmUserEdited) return true;
    }
  }
  return false;
}

function normalizeTimelineSubtitle(raw: unknown, index: number): TimelineSubtitle | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = stripSubtitlePunctuation(typeof o.text === 'string' ? o.text : '');
  const startTime = Number(o.startTime ?? o.start ?? o.startSeconds);
  const endTime = Number(o.endTime ?? o.end ?? o.endSeconds);
  if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `sub-${index + 1}`;
  return { id, text, startTime, endTime };
}

const RENDER_INVALIDATING_KEYS = new Set([
  'mxmRenderMode',
  'mxmPrompt',
  'mxmSourceImageUrl',
  'mxmSourceAssetId',
  'mxmImageFit',
  'mxmImageMotionEnabled',
  'mxmImageMotion',
  'mxmAutoStockImage',
  'mxmAutoStockVideo',
  'mxmStockSearchQuery',
  'mxmHtmlContent',
  'mxmGsapTimeline',
  'mxmGsapSceneBrief',
  'mxmGsapStyleId',
  'mxmGsapSceneType',
  'mxmGsapSceneData',
  'mxmVideoMode',
  'mxmReferenceImages',
  'mxmReferenceAssets',
  'duration',
]);

export function useVideoEditScript(initial: unknown, enrichInput?: VoiceoverEnrichInput) {
  const enrichInputRef = useRef(enrichInput);
  enrichInputRef.current = enrichInput;
  const enrichKey = enrichInputKey(enrichInput);
  const editHistory = useTimelineEditHistory();

  const [script, setScriptState] = useState<VideoEditScript | null>(() =>
    applyEnrich(initial, enrichInput)
  );

  // 草稿 JSON 到达时同步；已有用户编辑时不覆盖（避免 approve 前被 draft 刷新冲掉）
  useEffect(() => {
    if (initial == null) {
      setScriptState(null);
      editHistory.reset();
      return;
    }
    setScriptState((prev) => {
      if (prev && scriptHasUserEdits(prev)) return prev;
      editHistory.reset();
      return applyEnrich(initial, enrichInputRef.current);
    });
  }, [initial]);

  useEffect(() => {
    if (initial == null) return;
    setScriptState((prev) => {
      if (!prev) return applyEnrich(initial, enrichInputRef.current);
      return applyEnrich(prev, enrichInputRef.current);
    });
  }, [enrichKey, initial]);

  const setScript = useCallback(
    (raw: unknown) => {
      setScriptState(applyEnrich(raw, enrichInput));
    },
    [enrichInput]
  );

  const visualClips = useMemo(() => {
    if (!script) return [] as VisualClipItem[];
    const out: VisualClipItem[] = [];
    for (const track of script.project.timeline.tracks) {
      for (const clip of track.clips) {
        if (!clip.metadata?.mxmRenderMode) continue;
        out.push({
          ...clip,
          trackType: track.type,
          trackName: track.name ?? track.type,
        });
      }
    }
    return out.sort((a, b) => a.startTime - b.startTime);
  }, [script]);

  const collectAudioClips = useCallback(
    (role?: AudioRole) => {
      if (!script) return [] as AudioClipItem[];
      const out: AudioClipItem[] = [];
      for (const track of script.project.timeline.tracks) {
        if (track.type !== 'audio') continue;
        const trackRole = resolveAudioRole(track);
        if (!trackRole) continue;
        if (role && trackRole !== role) continue;
        for (const clip of track.clips) {
          out.push({
            ...clip,
            trackType: 'audio',
            trackName: track.name ?? (trackRole === 'bgm' ? '背景音乐' : '语音'),
            audioRole: trackRole,
            mediaUrl: resolveMediaUrl(clip.mediaId),
          });
        }
      }
      return out.sort((a, b) => a.startTime - b.startTime);
    },
    [script]
  );

  const voiceClips = useMemo(() => collectAudioClips('voice'), [collectAudioClips]);
  const bgmClips = useMemo(() => collectAudioClips('bgm'), [collectAudioClips]);
  const audioClips = useMemo(() => collectAudioClips(), [collectAudioClips]);

  const subtitles = useMemo(() => {
    if (!script) return [] as TimelineSubtitle[];
    const raw = script.project.timeline.subtitles ?? [];
    return [...raw]
      .map((s, index) => normalizeTimelineSubtitle(s, index))
      .filter((s): s is TimelineSubtitle => s != null)
      .sort((a, b) => a.startTime - b.startTime);
  }, [script]);

  const textClips = useMemo(() => script?.project.textClips ?? [], [script]);

  const voicePreviewUrl = useMemo(() => {
    const fromTrack = voiceClips.find((c) => c.mediaUrl)?.mediaUrl;
    if (fromTrack) return fromTrack;
    if (enrichInput?.audioUrl) {
      return resolveMediaUrl(
        enrichInput.audioUrl.startsWith('tts:')
          ? enrichInput.audioUrl
          : `tts:${enrichInput.audioUrl}`
      );
    }
    return undefined;
  }, [voiceClips, enrichInput?.audioUrl]);

  const bgmPreviewUrl = useMemo(() => {
    return bgmClips.find((c) => c.mediaUrl)?.mediaUrl;
  }, [bgmClips]);

  /** @deprecated 使用 voicePreviewUrl */
  const audioPreviewUrl = voicePreviewUrl;

  const audioMix = useMemo(() => {
    const voiceTrack = findAudioTrack(script, 'voice');
    const bgmTrack = findAudioTrack(script, 'bgm');
    const voiceClip = voiceClips[0];
    const bgmClip = bgmClips[0];
    const voiceSettings = getClipAudioSettings(voiceClip, voiceTrack, 'voice');
    const bgmSettings = getClipAudioSettings(bgmClip, bgmTrack, 'bgm');
    return {
      voiceUrl: voicePreviewUrl,
      voiceVolume: voiceSettings.volume,
      voiceMuted: voiceSettings.muted,
      bgmUrl: bgmPreviewUrl,
      bgmVolume: bgmSettings.volume,
      bgmMuted: bgmSettings.muted,
    };
  }, [script, voiceClips, bgmClips, voicePreviewUrl, bgmPreviewUrl]);

  const updateAudioClip = useCallback(
    (
      clipId: string,
      patch: {
        volume?: number;
        muted?: boolean;
        fadeIn?: number;
        fadeOut?: number;
        mediaId?: string;
      }
    ) => {
      setScriptState((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const track of next.project.timeline.tracks) {
          for (const clip of track.clips) {
            if (clip.id !== clipId) continue;
            if (patch.volume != null) clip.volume = patch.volume;
            if (patch.mediaId != null) clip.mediaId = patch.mediaId;
            if (patch.fadeIn != null || patch.fadeOut != null) {
              clip.fade = {
                fadeIn: patch.fadeIn ?? clip.fade?.fadeIn ?? 0,
                fadeOut: patch.fadeOut ?? clip.fade?.fadeOut ?? 0,
              };
            }
            if (patch.muted != null) track.muted = patch.muted;
            clip.metadata = { ...(clip.metadata ?? {}), mxmUserEdited: true };
          }
        }
        return next;
      });
    },
    []
  );

  const setBgmMedia = useCallback((url: string, assetId?: string) => {
    const normalized = rewriteInternalStorageMediaUrl(url);
    const mediaId = normalized.startsWith('tts:') ? normalized : `tts:${normalized}`;
    setScriptState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const duration = Math.max(next.project.timeline.duration, 0.01);
      let bgmTrack = findAudioTrack(next, 'bgm');
      if (!bgmTrack) {
        bgmTrack = {
          id: 'track-audio-bgm',
          type: 'audio',
          name: '背景音乐',
          clips: [],
        };
        next.project.timeline.tracks.push(bgmTrack);
      }
      let clip = bgmTrack.clips[0];
      if (!clip) {
        clip = {
          id: 'clip-audio-bgm',
          trackId: bgmTrack.id,
          startTime: 0,
          duration,
          type: 'audio',
          volume: 0.35,
          fade: { fadeIn: 1, fadeOut: 2 },
        };
        bgmTrack.clips.push(clip);
      }
      clip.mediaId = mediaId;
      clip.duration = duration;
      clip.metadata = {
        ...(clip.metadata ?? {}),
        mxmUserEdited: true,
        ...(assetId ? { mxmSourceAssetId: assetId } : {}),
      };
      return next;
    });
  }, []);

  const clearBgmMedia = useCallback(() => {
    setScriptState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const bgmTrack = findAudioTrack(next, 'bgm');
      if (!bgmTrack?.clips[0]) return prev;
      delete bgmTrack.clips[0].mediaId;
      bgmTrack.clips[0].metadata = {
        ...(bgmTrack.clips[0].metadata ?? {}),
        mxmUserEdited: true,
      };
      return next;
    });
  }, []);

  const totalDuration = script?.project.timeline.duration ?? 0;

  const updateClip = useCallback((clipId: string, patch: Partial<MxmClipMetadata> & { duration?: number }) => {
    setScriptState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      for (const track of next.project.timeline.tracks) {
        for (const clip of track.clips) {
          if (clip.id !== clipId) continue;
          if (patch.duration != null) clip.duration = patch.duration;
          const { duration: _d, ...metaPatch } = patch;
          const invalidatesRender =
            patch.duration != null ||
            Object.keys(metaPatch).some((k) => RENDER_INVALIDATING_KEYS.has(k));
          clip.metadata = {
            ...(clip.metadata ?? {}),
            ...metaPatch,
            mxmUserEdited: true,
            ...(invalidatesRender
              ? {
                  mxmRenderStatus: 'pending' as const,
                  mxmRenderedVideoUrl: undefined,
                  mxmRenderError: undefined,
                }
              : {}),
          };
        }
      }
      return next;
    });
  }, []);

  const setRenderMode = useCallback(
    (clipId: string, mode: MxmRenderMode) => {
      updateClip(clipId, { mxmRenderMode: mode });
    },
    [updateClip]
  );

  const updateSubtitle = useCallback((subtitleId: string, patch: { text?: string }) => {
    setScriptState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const list = next.project.timeline.subtitles ?? [];
      const item = list.find((s) => s.id === subtitleId);
      if (!item) return prev;
      if (patch.text != null) item.text = patch.text;
      next.project.timeline.subtitles = list;
      return next;
    });
  }, []);

  const updateSegmentVoiceover = useCallback((clipId: string, text: string) => {
    setScriptState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      let targetClip: { startTime: number; duration: number; metadata?: Record<string, unknown> } | null =
        null;
      for (const track of next.project.timeline.tracks) {
        for (const clip of track.clips) {
          if (clip.id === clipId) {
            targetClip = clip;
            break;
          }
        }
      }
      if (!targetClip) return prev;

      const normalized = stripSubtitlePunctuation(text.replace(/\n+/g, ' '));
      targetClip.metadata = {
        ...(targetClip.metadata ?? {}),
        mxmVoiceoverText: normalized || undefined,
      };

      const list = [...(next.project.timeline.subtitles ?? [])];
      const overlapping = list.filter((s) => {
        const clipEnd = targetClip!.startTime + targetClip!.duration;
        return s.startTime < clipEnd && s.endTime > targetClip!.startTime;
      });

      if (overlapping.length === 0) {
        if (normalized) {
          list.push({
            id: `sub-${clipId}`,
            text: normalized,
            startTime: targetClip.startTime,
            endTime: targetClip.startTime + targetClip.duration,
          });
        }
      } else if (overlapping.length === 1) {
        overlapping[0]!.text = normalized;
      } else {
        const distributed = distributeTextToSubtitles(normalized, overlapping);
        for (const sub of overlapping) {
          const part = distributed.get(sub.id);
          if (part != null) sub.text = part;
        }
      }

      next.project.timeline.subtitles = list;
      return next;
    });
  }, []);

  const updateTextClip = useCallback(
    (
      textClipId: string,
      patch: Partial<
        Pick<TextClip, 'text' | 'animation' | 'style' | 'transform' | 'startTime' | 'duration'>
      >
    ) => {
      setScriptState((prev) => {
        if (!prev) return prev;
        const list = prev.project.textClips ?? [];
        const idx = list.findIndex((c) => c.id === textClipId);
        if (idx < 0) return prev;
        const next = structuredClone(prev);
        const clips = [...(next.project.textClips ?? [])];
        const current = clips[idx]!;
        clips[idx] = {
          ...current,
          ...patch,
          style: patch.style ? { ...current.style, ...patch.style } : current.style,
          transform: patch.transform
            ? {
                ...current.transform,
                ...patch.transform,
                position: patch.transform.position
                  ? { ...current.transform.position, ...patch.transform.position }
                  : current.transform.position,
                scale: patch.transform.scale
                  ? { ...current.transform.scale, ...patch.transform.scale }
                  : current.transform.scale,
                anchor: patch.transform.anchor
                  ? { ...current.transform.anchor, ...patch.transform.anchor }
                  : current.transform.anchor,
              }
            : current.transform,
        };
        next.project.textClips = clips;
        return next;
      });
    },
    []
  );

  const updateTransition = useCallback(
    (clipAId: string, clipBId: string, patch: { type?: string; duration?: number }) => {
      setScriptState((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const track of next.project.timeline.tracks) {
          if (track.type !== 'video') continue;
          const list = [...(track.transitions ?? [])];
          const idx = list.findIndex((t) => t.clipAId === clipAId && t.clipBId === clipBId);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx]!,
              ...(patch.type != null ? { type: patch.type } : {}),
              ...(patch.duration != null ? { duration: patch.duration } : {}),
            };
          } else {
            list.push({
              id: `tr-${clipAId}-${clipBId}`,
              clipAId,
              clipBId,
              type: patch.type ?? 'crossfade',
              duration: patch.duration ?? 0.5,
            });
          }
          track.transitions = list;
          return next;
        }
        return prev;
      });
    },
    []
  );

  const applyTimelineEdit = useCallback(
    (mutator: (current: VideoEditScript) => TimelineEditResult): TimelineEditResult => {
      const prev = script;
      if (!prev) return { script: prev!, error: '脚本未加载' };
      const result = mutator(prev);
      if (result.error) return result;
      editHistory.pushSnapshot(prev);
      setScriptState(result.script);
      return result;
    },
    [editHistory, script]
  );

  const splitVisualClipAt = useCallback(
    (clipId: string, splitTime: number) =>
      applyTimelineEdit((current) => splitVisualClipInScript(current, clipId, splitTime)),
    [applyTimelineEdit]
  );

  const deleteVisualClip = useCallback(
    (clipId: string) => applyTimelineEdit((current) => deleteVisualClipInScript(current, clipId)),
    [applyTimelineEdit]
  );

  const mergeVisualWithNext = useCallback(
    (clipId: string) =>
      applyTimelineEdit((current) => mergeVisualClipWithNextInScript(current, clipId)),
    [applyTimelineEdit]
  );

  const undoTimelineEdit = useCallback(() => {
    setScriptState((prev) => editHistory.undo(prev));
  }, [editHistory]);

  const redoTimelineEdit = useCallback(() => {
    setScriptState((prev) => editHistory.redo(prev));
  }, [editHistory]);

  const visualClipRefs = useMemo(
    () => (script ? collectVisualClipRefs(script) : []),
    [script]
  );

  const timelineEditState = useMemo(() => {
    return {
      canDelete: canDeleteVisualClip(visualClipRefs),
      canUndo: editHistory.canUndo,
      canRedo: editHistory.canRedo,
    };
  }, [visualClipRefs, editHistory.canUndo, editHistory.canRedo]);

  const canSplitAt = useCallback(
    (clipId: string, splitTime: number) => canSplitVisualClip(visualClipRefs, clipId, splitTime),
    [visualClipRefs]
  );

  const canMergeAt = useCallback(
    (clipId: string) => canMergeVisualClipWithNext(visualClipRefs, clipId),
    [visualClipRefs]
  );

  const resizeClipBoundary = useCallback(
    (clipId: string, edge: 'start' | 'end', newSec: number) => {
      setScriptState((prev) => {
        if (!prev) return prev;
        editHistory.pushSnapshot(prev);
        const dur = prev.project.timeline.duration;
        return resizeClipBoundaryInScript(prev, clipId, edge, newSec, dur);
      });
    },
    [editHistory]
  );

  const scriptParseFailed = useMemo(() => {
    if (initial == null) return false;
    return parseVideoEditScript(initial) === null;
  }, [initial]);

  return {
    script,
    setScript,
    clips: visualClips,
    visualClips,
    audioClips,
    voiceClips,
    bgmClips,
    subtitles,
    textClips,
    audioPreviewUrl,
    voicePreviewUrl,
    bgmPreviewUrl,
    audioMix,
    totalDuration,
    updateClip,
    updateAudioClip,
    setBgmMedia,
    clearBgmMedia,
    setRenderMode,
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
    scriptParseFailed,
    exportJson: () => script,
  };
}
