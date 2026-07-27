/**
 * 前置管线：解析口播音频 URL + ffprobe 时长，并一并引入已持久化的 TTS 字幕
 */
import type { PipelineStep, TaskContext } from './types';
import { interpolatePipelineTemplate } from './business-pipeline';
import { probeVoiceoverAudioDurationSeconds } from '../core/video-edit/audio-probe';
import { normalizeClientAccessibleMediaUrl } from '../core/audio/voiceover-audio-source';
import { resolveStoredSubtitlesForAudio } from '../core/audio/voiceover-subtitle-resolve';

function readParamPath(ctx: TaskContext, path: string): string {
  const tmpl = path.includes('${') ? path : `\${${path}}`;
  return interpolatePipelineTemplate(tmpl, ctx).trim();
}

function hasUsableSubtitleJson(raw: unknown): boolean {
  if (raw == null || raw === '') return false;
  if (typeof raw === 'string') return raw.trim().length > 2;
  if (typeof raw === 'object') return true;
  return false;
}

/**
 * 引入口播音频时：若来源是 MiniMax TTS（或对象上已挂字幕），写入 params/state，供后续跳过听译。
 */
async function attachPersistedVoiceoverSubtitles(
  ctx: TaskContext,
  audioUrl: string,
  params: Record<string, unknown>
): Promise<{ params: Record<string, unknown>; statePatch: Record<string, unknown> }> {
  if (hasUsableSubtitleJson(params.voiceover_subtitles_json)) {
    return { params, statePatch: {} };
  }

  const sourceTaskIdFrom =
    (typeof params.voiceover_source_task_id === 'string' && params.voiceover_source_task_id.trim()) ||
    (typeof params.source_task_id === 'string' && params.source_task_id.trim()) ||
    '';

  try {
    const { taskExecutor } = await import('../task/task-executor');
    const getTask = (id: string) => taskExecutor.getTaskManager().getTask(id);
    const stored = await resolveStoredSubtitlesForAudio({
      audioUrl,
      userId: typeof ctx.userId === 'string' ? ctx.userId : undefined,
      params: {
        ...params,
        ...(sourceTaskIdFrom ? { voiceover_source_task_id: sourceTaskIdFrom } : {}),
      },
      getTask,
    });
    if (!stored || stored.segments.length === 0) {
      return { params, statePatch: {} };
    }

    const nextParams: Record<string, unknown> = {
      ...params,
      voiceover_subtitles_json: JSON.stringify(stored),
    };
    const existingScript = typeof params.script === 'string' ? params.script.trim() : '';
    if (!existingScript && stored.fullText) {
      nextParams.script = stored.fullText;
    }

    console.info('[resolveVoiceoverAudio] 已引入持久化口播字幕', {
      source: stored.source,
      reason: stored.skippedAsrReason ?? null,
      segmentCount: stored.segments.length,
      voiceover_source_task_id: nextParams.voiceover_source_task_id ?? null,
    });

    return {
      params: nextParams,
      statePatch: {
        voiceoverSubtitles: stored,
        voiceoverAsrMeta: {
          skipped: true,
          reason: stored.skippedAsrReason ?? 'stored_subtitles',
          source: stored.source,
          segmentCount: stored.segments.length,
          attachedAt: 'resolveVoiceoverAudio',
        },
      },
    };
  } catch (err) {
    console.warn('[resolveVoiceoverAudio] 引入 TTS 字幕失败，后续或回退听译', {
      audioUrl: audioUrl.slice(0, 120),
      error: err instanceof Error ? err.message : String(err),
    });
    return { params, statePatch: {} };
  }
}

export async function runResolveVoiceoverAudioStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const audioUrlFrom =
    (typeof step.params?.audioUrlFrom === 'string' && step.params.audioUrlFrom.trim()) ||
    '${params.voiceover_audio_url}';
  const durationField =
    (typeof step.params?.durationField === 'string' && step.params.durationField.trim()) ||
    'audio_duration_seconds';

  const rawAudioUrl = readParamPath(ctx, audioUrlFrom);
  if (!rawAudioUrl) {
    throw new Error('resolveVoiceoverAudio: 缺少口播音频 URL（voiceover_audio_url）');
  }
  const audioUrl = normalizeClientAccessibleMediaUrl(rawAudioUrl);

  let durationSec: number;
  const manual = ctx.params[durationField];
  if (typeof manual === 'number' && manual > 0) {
    durationSec = manual;
  } else if (typeof manual === 'string' && manual.trim() && Number(manual) > 0) {
    durationSec = Number(manual);
  } else {
    durationSec = await probeVoiceoverAudioDurationSeconds(audioUrl, {
      userId: typeof ctx.userId === 'string' ? ctx.userId : undefined,
    });
  }

  const voiceoverAudio = {
    url: audioUrl,
    durationSeconds: durationSec,
    probedAt: Date.now(),
  };

  let params: Record<string, unknown> = {
    ...ctx.params,
    voiceover_audio_url: audioUrl,
    [durationField]: durationSec,
  };

  const sourceTaskIdFromStep =
    typeof step.params?.sourceTaskIdFrom === 'string' && step.params.sourceTaskIdFrom.trim()
      ? readParamPath(ctx, step.params.sourceTaskIdFrom)
      : '';
  if (sourceTaskIdFromStep && !params.voiceover_source_task_id) {
    params.voiceover_source_task_id = sourceTaskIdFromStep;
  }

  const attached = await attachPersistedVoiceoverSubtitles(ctx, audioUrl, params);
  params = attached.params;

  return {
    ...ctx,
    params,
    state: {
      ...ctx.state,
      voiceoverAudio,
      ...attached.statePatch,
    },
  };
}
