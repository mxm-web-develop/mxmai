import type { TimelineSubtitle, VideoEditScript, VoiceoverSubtitleSegment } from './types';
import { normalizeUploadedMediaUrl } from '../../api/client';
import { ensureBgmTrack, normalizeVoiceTrackLabels } from './audioTrackUtils';

export type VoiceoverEnrichInput = {
  audioUrl?: string;
  durationSeconds?: number;
  subtitles?: VoiceoverSubtitleSegment[];
};

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parseSubtitleBundle(raw: unknown): VoiceoverSubtitleSegment[] | undefined {
  if (!raw) return undefined;
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!data || typeof data !== 'object') return undefined;
  const segments = (data as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return undefined;
  const out: VoiceoverSubtitleSegment[] = [];
  for (const item of segments) {
    if (!item || typeof item !== 'object') continue;
    const text = pickString((item as { text?: unknown }).text);
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out.length ? out : undefined;
}

/** 从任务 / 审核草稿 metadata 提取口播补全信息 */
export function resolveVoiceoverEnrichInput(
  task?: { requestParams?: Record<string, unknown>; metadata?: Record<string, unknown> } | null,
  draft?: { metadata?: Record<string, unknown>; json?: unknown } | null
): VoiceoverEnrichInput {
  const params = task?.requestParams ?? {};
  const taskMeta = task?.metadata ?? {};
  const draftMeta = draft?.metadata ?? {};

  const nestedParams =
    params.params && typeof params.params === 'object'
      ? (params.params as Record<string, unknown>)
      : params;

  const audioUrl =
    rewriteInternalStorageMediaUrl(
      pickString(nestedParams.voiceover_audio_url) ??
        pickString(params.voiceover_audio_url) ??
        pickString(draftMeta.voiceoverAudioUrl) ??
        pickString(taskMeta.voiceover_audio_url) ??
        ''
    ) || undefined;

  const durationRaw =
    nestedParams.audio_duration_seconds ??
    params.audio_duration_seconds ??
    draftMeta.audioDurationSeconds;
  const durationSeconds =
    typeof durationRaw === 'number' && durationRaw > 0 ? durationRaw : undefined;

  const subtitles =
    parseSubtitleBundle(nestedParams.voiceover_subtitles_json) ??
    parseSubtitleBundle(params.voiceover_subtitles_json) ??
    parseSubtitleBundle(draftMeta.voiceoverSubtitles) ??
    parseSubtitleBundle(taskMeta.voiceoverSubtitles);

  return { audioUrl, durationSeconds, subtitles };
}

const INTERNAL_STORAGE_HOSTS = new Set(['127.0.0.1', 'localhost', 'minio']);

function isLikelyMinioHost(hostname: string, port: string): boolean {
  const host = hostname.toLowerCase();
  if (INTERNAL_STORAGE_HOSTS.has(host)) return true;
  if (host.includes('minio')) return true;
  if (port === '9000') return true;
  return false;
}

/** 解析 MinIO 直链：http://{host}:9000/{bucket}/{key...} */
export function parseMinioDirectObjectUrl(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url.trim());
    if (!isLikelyMinioHost(u.hostname, u.port)) return null;
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { bucket: parts[0], key: parts.slice(1).join('/') };
  } catch {
    return null;
  }
}

function toGatewayMediaAssetPath(bucket: string, key: string): string {
  return `/api/v1/media/asset?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
}

/** 将内网 MinIO / Gateway 绝对地址转为当前页可访问的 /api/v1/media/* */
export function rewriteInternalStorageMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('/api/v1/media/') || trimmed.startsWith('/api/v1/static/')) {
    return normalizeUploadedMediaUrl(trimmed);
  }

  const minio = parseMinioDirectObjectUrl(trimmed);
  if (minio) {
    return toGatewayMediaAssetPath(minio.bucket, minio.key);
  }

  try {
    const u = new URL(trimmed);
    if (u.pathname.startsWith('/api/')) {
      return normalizeUploadedMediaUrl(`${u.pathname}${u.search}`);
    }
  } catch {
    /* relative or non-URL */
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/api/')) {
    return normalizeUploadedMediaUrl(trimmed);
  }

  return trimmed;
}

export function resolveMediaUrl(mediaId?: string): string | undefined {
  if (!mediaId) return undefined;
  const raw = mediaId.startsWith('tts:') ? mediaId.slice(4).trim() : mediaId.trim();
  if (!raw) return undefined;
  return rewriteInternalStorageMediaUrl(raw);
}

const SCRIPT_MEDIA_URL_KEYS = [
  'mxmRenderedVideoUrl',
  'mxmSourceImageUrl',
  'mxmSourceVideoUrl',
  'mxmAiGeneratedImageUrl',
] as const;

/** 加载审核脚本时统一重写 clip 内网媒体 URL，兼容旧任务草稿 */
export function normalizeScriptMediaUrls(script: VideoEditScript): VideoEditScript {
  const next = structuredClone(script) as VideoEditScript;
  for (const track of next.project.timeline.tracks) {
    for (const clip of track.clips) {
      const meta = clip.metadata;
      if (!meta) continue;
      for (const key of SCRIPT_MEDIA_URL_KEYS) {
        const raw = meta[key];
        if (typeof raw === 'string' && raw.trim()) {
          meta[key] = rewriteInternalStorageMediaUrl(raw);
        }
      }
      if (Array.isArray(meta.mxmReferenceImages)) {
        meta.mxmReferenceImages = meta.mxmReferenceImages.map((u) =>
          typeof u === 'string' ? rewriteInternalStorageMediaUrl(u) : u
        );
      }
    }
    for (const clip of track.clips) {
      if (typeof clip.mediaId === 'string' && clip.mediaId.trim()) {
        const resolved = resolveMediaUrl(clip.mediaId);
        if (resolved) clip.mediaId = clip.mediaId.startsWith('tts:') ? `tts:${resolved}` : resolved;
      }
    }
  }
  return next;
}

/** 若 ProjectFile 缺少口播轨 / 字幕轨，用上传音频与 ASR 字幕补全（仅 UI 展示与审核导出） */
export function enrichVoiceoverTimeline(
  script: VideoEditScript,
  input: VoiceoverEnrichInput
): VideoEditScript {
  if (!input.audioUrl && !input.subtitles?.length) {
    return ensureBgmTrack(normalizeVoiceTrackLabels(script));
  }

  const next = structuredClone(script) as VideoEditScript;
  const timeline = next.project.timeline;
  if (!timeline.tracks) timeline.tracks = [];
  if (!timeline.subtitles) timeline.subtitles = [];

  const subtitleEnd = Math.max(0, ...(input.subtitles?.map((s) => s.endSeconds) ?? [0]));
  let duration = timeline.duration;
  if (duration <= 0) {
    duration = input.durationSeconds && input.durationSeconds > 0 ? input.durationSeconds : subtitleEnd;
    if (duration <= 0) duration = 1;
  }

  if (timeline.duration <= 0 && duration > 0) {
    timeline.duration = duration;
  }

  const hasAudio = timeline.tracks.some(
    (t) => t.type === 'audio' && Array.isArray(t.clips) && t.clips.length > 0
  );

  if (!hasAudio && input.audioUrl) {
    const trackId = 'track-audio-voiceover';
    const normalized = rewriteInternalStorageMediaUrl(input.audioUrl);
    const mediaId = normalized.startsWith('tts:') ? normalized : `tts:${normalized}`;
    timeline.tracks.push({
      id: trackId,
      type: 'audio',
      name: '语音',
      clips: [
        {
          id: 'clip-audio-main',
          mediaId,
          trackId,
          startTime: 0,
          duration,
          type: 'audio',
        },
      ],
    });
  }

  const hasSubs = Array.isArray(timeline.subtitles) && timeline.subtitles.length > 0;
  if (!hasSubs && input.subtitles?.length) {
    timeline.subtitles = input.subtitles.map(
      (s, i): TimelineSubtitle => ({
        id: `sub-${i + 1}`,
        text: s.text,
        startTime: s.startSeconds,
        endTime: s.endSeconds,
      })
    );
  }

  return ensureBgmTrack(normalizeVoiceTrackLabels(next));
}
