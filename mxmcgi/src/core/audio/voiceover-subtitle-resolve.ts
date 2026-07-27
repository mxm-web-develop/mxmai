import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  fetchSubtitleJsonFromUrl,
  hasPersistedSubtitle,
  loadPersistedSubtitlePayload,
  pickSubtitleFileUrl,
} from '../../task/tts-subtitle-persist';
import { parseReferenceImageLocator } from '../../task/reference-image';
import type { Task } from '../../task/types';
import {
  buildSubtitleBundle,
  normalizeFunAsrJson,
  normalizeMinimaxTtsSubtitlePayload,
  segmentsToFullText,
} from './voiceover-subtitle-normalize';
import type { VoiceoverSubtitleBundle, VoiceoverSubtitleSegment } from './voiceover-subtitle-types';

const MEDIA_TASK_ID_RE = /\/media\/(?:audio|music)\/([a-zA-Z0-9_-]+)/;

export function extractTaskIdFromMediaUrl(audioUrl: string): string | null {
  const trimmed = audioUrl.trim();
  if (!trimmed) return null;
  try {
    const path = trimmed.includes('://') ? new URL(trimmed).pathname : trimmed;
    const m = path.match(MEDIA_TASK_ID_RE);
    return m?.[1] ?? null;
  } catch {
    const m = trimmed.match(MEDIA_TASK_ID_RE);
    return m?.[1] ?? null;
  }
}

export function extractObjectIdFromMediaUrl(audioUrl: string): string | null {
  const trimmed = audioUrl.trim();
  if (!trimmed) return null;
  const loc = parseReferenceImageLocator(trimmed);
  if (loc?.kind === 'media-object') return loc.objectId;
  const m = trimmed.match(/\/media\/(?:public\/)?object\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** 统一 /api/v1/media/audio/x 与 /media/audio/x，便于与 task.result.mediaUrls 比对 */
export function canonicalVoiceoverMediaPath(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.replace(/^\/api\/v1(?=\/media\/)/, '');
}

/** 归一化网关 / MinIO / 相对路径，便于与 task.result.mediaUrls 比对 */
export function normalizeVoiceoverMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('/')) {
      const base = (process.env.PUBLIC_GATEWAY_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
      return canonicalVoiceoverMediaPath(new URL(trimmed, `${base}/`).pathname);
    }
    const u = new URL(trimmed);
    return canonicalVoiceoverMediaPath(u.pathname);
  } catch {
    return canonicalVoiceoverMediaPath(trimmed.split('?')[0]);
  }
}

function parseSubtitleSegmentsFromParams(raw: unknown): VoiceoverSubtitleSegment[] | null {
  if (raw == null || raw === '') return null;
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;

  const minimax = normalizeMinimaxTtsSubtitlePayload(root);
  if (minimax.length > 0) return minimax;

  const segments = root.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    const normalized = normalizeFunAsrJson({ segments });
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

function pickSourceTaskIdFromObjectMetadata(meta: Record<string, unknown>): string | null {
  for (const key of [
    'source_task_id',
    'sourceTaskId',
    'cgi_task_id',
    'task_id',
    'tts_task_id',
    'ref_task_id',
    'tempForTaskId',
  ]) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function loadSubtitlePayloadFromTask(task: Task): Promise<unknown | null> {
  const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const inline = await loadPersistedSubtitlePayload(meta);
  if (inline != null) return inline;

  const upstream = pickSubtitleFileUrl(meta);
  if (!upstream) return null;

  try {
    return await fetchSubtitleJsonFromUrl(upstream);
  } catch {
    return null;
  }
}

export function taskHasTtsSubtitles(task: Task | null | undefined): boolean {
  if (!task || (task.type !== 'audio' && task.type !== 'music')) return false;
  const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  if (hasPersistedSubtitle(meta)) return true;
  return Boolean(pickSubtitleFileUrl(meta));
}

export async function resolveTtsSubtitlesFromTask(task: Task): Promise<VoiceoverSubtitleBundle | null> {
  if (!taskHasTtsSubtitles(task)) return null;

  let payload = await loadSubtitlePayloadFromTask(task);

  // 仅有 MiniMax 短期 subtitle_file / upstream 且尚未落库时，lazy 拉取并持久化
  if (payload == null && task.result) {
    const upstream = pickSubtitleFileUrl((task.result.metadata ?? {}) as Record<string, unknown>);
    if (upstream) {
      try {
        const { persistTtsSubtitleInResult } = await import('../../task/tts-subtitle-persist');
        const nextResult = await persistTtsSubtitleInResult(task, task.result);
        payload = await loadPersistedSubtitlePayload(
          (nextResult.metadata ?? {}) as Record<string, unknown>
        );
        if (payload == null) {
          payload = await loadSubtitlePayloadFromTask({ ...task, result: nextResult });
        }
        if (payload != null && nextResult.metadata !== task.result.metadata) {
          const { taskExecutor } = await import('../../task/task-executor');
          void taskExecutor
            .getTaskManager()
            .update(task.id, { result: nextResult })
            .catch((err) => {
              console.warn('[voiceover-subtitle-resolve] lazy TTS subtitle persist writeback failed', {
                taskId: task.id,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }
      } catch (err) {
        console.warn('[voiceover-subtitle-resolve] lazy TTS subtitle fetch failed', {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (payload == null) return null;

  const segments = normalizeMinimaxTtsSubtitlePayload(payload);
  if (segments.length === 0) return null;

  return buildSubtitleBundle('tts', segments, {
    skippedAsrReason: 'tts_subtitles',
    fullText: segmentsToFullText(segments),
  });
}

export async function resolveTtsSubtitlesByTaskId(
  getTask: (taskId: string) => Promise<{ task: Task | null } | null | undefined>,
  taskId: string
): Promise<VoiceoverSubtitleBundle | null> {
  const id = taskId.trim();
  if (!id) return null;
  const snap = await getTask(id);
  const task = snap?.task ?? null;
  if (!task) return null;
  return resolveTtsSubtitlesFromTask(task);
}

async function resolveSubtitlesFromStorageObject(
  objectId: string,
  userId?: string
): Promise<{ bundle: VoiceoverSubtitleBundle | null; sourceTaskId?: string }> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const record = userId ? await repo.findByIdForUser(objectId, userId) : await repo.findById(objectId);
  if (!record) return { bundle: null };

  const meta = (record.metadata ?? {}) as Record<string, unknown>;
  const sourceTaskId = pickSourceTaskIdFromObjectMetadata(meta);

  const inlineSegments = parseSubtitleSegmentsFromParams(meta.subtitle_data ?? meta.subtitles);
  if (inlineSegments) {
    return {
      bundle: buildSubtitleBundle('tts', inlineSegments, {
        skippedAsrReason: 'stored_subtitles',
        fullText: segmentsToFullText(inlineSegments),
      }),
      sourceTaskId: sourceTaskId ?? undefined,
    };
  }

  const subtitleKey =
    (typeof meta.subtitle_storage_key === 'string' && meta.subtitle_storage_key.trim()) ||
    (typeof meta.subtitle_key === 'string' && meta.subtitle_key.trim()) ||
    '';
  const subtitleBucket =
    (typeof meta.subtitle_storage_bucket === 'string' && meta.subtitle_storage_bucket.trim()) ||
    record.bucket;

  if (subtitleKey) {
    try {
      const storageRepo = RepositoryFactory.createStorageRepository('generated');
      const buf = await storageRepo.downloadFile(subtitleBucket, subtitleKey);
      const payload = JSON.parse(buf.toString('utf8')) as unknown;
      const segments = normalizeMinimaxTtsSubtitlePayload(payload);
      if (segments.length > 0) {
        return {
          bundle: buildSubtitleBundle('tts', segments, {
            skippedAsrReason: 'stored_subtitles',
            fullText: segmentsToFullText(segments),
          }),
          sourceTaskId: sourceTaskId ?? undefined,
        };
      }
    } catch {
      /* fall through */
    }
  }

  return { bundle: null, sourceTaskId: sourceTaskId ?? undefined };
}

async function findAudioTaskIdByMediaUrl(userId: string, audioUrl: string): Promise<string | null> {
  const target = normalizeVoiceoverMediaUrl(audioUrl);
  if (!target) return null;

  try {
    const repo = RepositoryFactory.createCGITaskRepository();
    const { tasks } = await repo.findByUserId(userId, {
      task_type: 'audio',
      status: 'completed',
      limit: 60,
      summary: true,
    });
    for (const row of tasks) {
      const full = await repo.findById(row.id, true);
      if (!full?.result) continue;
      const urls = full.result.mediaUrls ?? [];
      for (const u of urls) {
        if (typeof u === 'string' && normalizeVoiceoverMediaUrl(u) === target) {
          return full.id;
        }
      }
      const storageInfo = full.result.storageInfo as { bucket?: string; keys?: string[] } | undefined;
      const loc = parseReferenceImageLocator(audioUrl);
      if (
        loc?.kind === 'media-asset' &&
        storageInfo?.bucket === loc.bucket &&
        storageInfo.keys?.[0] === loc.key
      ) {
        return full.id;
      }
    }
  } catch (err) {
    console.warn('[voiceover-subtitle-resolve] findAudioTaskIdByMediaUrl failed', {
      userId,
      audioUrl: audioUrl.slice(0, 120),
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

export type ResolveStoredSubtitlesInput = {
  audioUrl: string;
  userId?: string;
  params?: Record<string, unknown>;
  getTask: (taskId: string) => Promise<{ task: Task | null } | null | undefined>;
};

/** 已有字幕 / TTS 任务字幕：跳过 FunASR（无需用户粘贴口播稿） */
export async function resolveStoredSubtitlesForAudio(
  input: ResolveStoredSubtitlesInput
): Promise<VoiceoverSubtitleBundle | null> {
  const { audioUrl, userId, params = {}, getTask } = input;
  const trimmedUrl = audioUrl.trim();
  if (!trimmedUrl) return null;

  const fromParams = parseSubtitleSegmentsFromParams(params.voiceover_subtitles_json);
  if (fromParams) {
    return buildSubtitleBundle('manual', fromParams, {
      skippedAsrReason: 'stored_subtitles',
      fullText: segmentsToFullText(fromParams),
    });
  }

  const explicitTaskId =
    (typeof params.voiceover_source_task_id === 'string' && params.voiceover_source_task_id.trim()) ||
    (typeof params.source_task_id === 'string' && params.source_task_id.trim()) ||
    '';

  const taskIdCandidates = new Set<string>();
  if (explicitTaskId) taskIdCandidates.add(explicitTaskId);

  const fromUrl = extractTaskIdFromMediaUrl(trimmedUrl);
  if (fromUrl) taskIdCandidates.add(fromUrl);

  const objectId = extractObjectIdFromMediaUrl(trimmedUrl);
  if (objectId) {
    const { bundle, sourceTaskId } = await resolveSubtitlesFromStorageObject(objectId, userId);
    if (bundle) return bundle;
    if (sourceTaskId) taskIdCandidates.add(sourceTaskId);
  }

  if (userId && taskIdCandidates.size === 0) {
    const matched = await findAudioTaskIdByMediaUrl(userId, trimmedUrl);
    if (matched) taskIdCandidates.add(matched);
  }

  for (const taskId of taskIdCandidates) {
    const bundle = await resolveTtsSubtitlesByTaskId(getTask, taskId);
    if (bundle) return bundle;
  }

  return null;
}
