/**
 * 前置管线：口播 ASR 语音识别（可跳过 MiniMax TTS 已有字幕 / 用户已填文稿）
 */
import type { PipelineStep, TaskContext } from '../../tasks/types';
import { interpolatePipelineTemplate } from '../../tasks/business-pipeline';
import { transcribeAudioFromUrl } from './asr-service';
import {
  buildSubtitleBundle,
  estimateSegmentsFromScript,
} from './voiceover-subtitle-normalize';
import { resolveStoredSubtitlesForAudio } from './voiceover-subtitle-resolve';
import type { VoiceoverSubtitleBundle } from './voiceover-subtitle-types';

function readParamPath(ctx: TaskContext, path: string): string {
  const tmpl = path.includes('${') ? path : `\${${path}}`;
  return interpolatePipelineTemplate(tmpl, ctx).trim();
}

function readBoolParam(step: PipelineStep, key: string, defaultValue: boolean): boolean {
  const raw = step.params?.[key];
  if (raw === false || raw === 'false') return false;
  if (raw === true || raw === 'true') return true;
  return defaultValue;
}

function applySubtitleBundleToContext(
  ctx: TaskContext,
  bundle: VoiceoverSubtitleBundle,
  scriptField: string,
  outputStatePath: string,
  subtitlesJsonField: string
): TaskContext {
  const nextParams: Record<string, unknown> = {
    ...ctx.params,
    [subtitlesJsonField]: JSON.stringify(bundle),
  };

  const existingScript = typeof ctx.params[scriptField] === 'string' ? ctx.params[scriptField].trim() : '';
  if (!existingScript && bundle.fullText) {
    nextParams[scriptField] = bundle.fullText;
  }

  const parts = outputStatePath.split('.').filter(Boolean);
  let state: Record<string, unknown> = { ...ctx.state };
  if (parts.length === 0) {
    state.voiceoverSubtitles = bundle;
  } else {
    let cur: Record<string, unknown> = state;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const branch =
        cur[key] && typeof cur[key] === 'object' && !Array.isArray(cur[key])
          ? { ...(cur[key] as Record<string, unknown>) }
          : {};
      cur[key] = branch;
      cur = branch;
    }
    cur[parts[parts.length - 1]] = bundle;
  }

  state.voiceoverAsrMeta = {
    skipped: Boolean(bundle.skippedAsrReason),
    reason: bundle.skippedAsrReason ?? 'asr',
    source: bundle.source,
    segmentCount: bundle.segments.length,
  };

  return { ...ctx, params: nextParams, state };
}

export async function runTranscribeVoiceoverAudioStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const audioUrlFrom =
    (typeof step.params?.audioUrlFrom === 'string' && step.params.audioUrlFrom.trim()) ||
    '${params.voiceover_audio_url}';
  const sourceTaskIdFrom =
    (typeof step.params?.sourceTaskIdFrom === 'string' && step.params.sourceTaskIdFrom.trim()) || '';
  const scriptField =
    (typeof step.params?.scriptField === 'string' && step.params.scriptField.trim()) || 'script';
  const outputStatePath =
    (typeof step.params?.outputStatePath === 'string' && step.params.outputStatePath.trim()) ||
    'voiceoverSubtitles';
  const subtitlesJsonField =
    (typeof step.params?.subtitlesJsonField === 'string' && step.params.subtitlesJsonField.trim()) ||
    'voiceover_subtitles_json';
  const skipWhenTtsSubtitles = readBoolParam(step, 'skipWhenTtsSubtitles', true);
  const skipWhenScriptPresent = readBoolParam(step, 'skipWhenScriptPresent', true);
  const skipWhenStoredSubtitles = readBoolParam(step, 'skipWhenStoredSubtitles', true);

  const audioUrl = readParamPath(ctx, audioUrlFrom);
  if (!audioUrl) {
    throw new Error('transcribeVoiceoverAudio: 缺少口播音频 URL');
  }

  const existingScript =
    typeof ctx.params[scriptField] === 'string' ? String(ctx.params[scriptField]).trim() : '';

  const { taskExecutor } = await import('../../task/task-executor');
  const getTask = (id: string) => taskExecutor.getTaskManager().getTask(id);

  // 0) 表单已带字幕 / TTS 任务 / storage object / URL 反查 → 跳过 ASR
  if (skipWhenStoredSubtitles || skipWhenTtsSubtitles) {
    const stored = await resolveStoredSubtitlesForAudio({
      audioUrl,
      userId: typeof ctx.userId === 'string' ? ctx.userId : undefined,
      params: {
        ...ctx.params,
        voiceover_source_task_id:
          (sourceTaskIdFrom ? readParamPath(ctx, sourceTaskIdFrom) : undefined) ??
          ctx.params.voiceover_source_task_id,
      },
      getTask,
    });
    if (stored) {
      return applySubtitleBundleToContext(
        ctx,
        stored,
        scriptField,
        outputStatePath,
        subtitlesJsonField
      );
    }
  }

  // 2) 用户已粘贴文稿 → 跳过 ASR（按时长估算句级时间轴）
  // 注意：估算时间轴精度远低于 TTS/ASR，仅作无字幕时可退路径；勿优先于 MiniMax 字幕。
  if (skipWhenScriptPresent && existingScript) {
    console.warn('[transcribeVoiceoverAudio] TTS/已存字幕未命中，使用文稿估算时间轴（精度较差）', {
      audioUrl: audioUrl.slice(0, 120),
      voiceover_source_task_id: ctx.params.voiceover_source_task_id ?? null,
      scriptChars: existingScript.length,
    });
    const durationRaw = ctx.params.audio_duration_seconds ?? ctx.state.voiceoverAudio;
    let durationSeconds = 0;
    if (typeof durationRaw === 'number' && durationRaw > 0) {
      durationSeconds = durationRaw;
    } else if (
      durationRaw &&
      typeof durationRaw === 'object' &&
      typeof (durationRaw as { durationSeconds?: number }).durationSeconds === 'number'
    ) {
      durationSeconds = (durationRaw as { durationSeconds: number }).durationSeconds;
    }

    const segments =
      durationSeconds > 0
        ? estimateSegmentsFromScript(existingScript, durationSeconds)
        : [];

    const bundle = buildSubtitleBundle('script_only', segments, {
      skippedAsrReason: 'user_script',
      fullText: existingScript,
    });
    return applySubtitleBundleToContext(
      ctx,
      bundle,
      scriptField,
      outputStatePath,
      subtitlesJsonField
    );
  }

  // 3) 调用 ASR（仅上传/外链/字幕缺失时）
  console.info('[transcribeVoiceoverAudio] 未命中已存字幕，回退 FunASR', {
    audioUrl: audioUrl.slice(0, 120),
    voiceover_source_task_id: ctx.params.voiceover_source_task_id ?? null,
  });

  const language =
    (typeof step.params?.language === 'string' && step.params.language.trim()) ||
    process.env.ASR_LANGUAGE?.trim() ||
    'zh';
  const model = typeof step.params?.model === 'string' ? step.params.model.trim() : undefined;

  const asrBundle = await transcribeAudioFromUrl(audioUrl, {
    language,
    model,
    userId: typeof ctx.userId === 'string' ? ctx.userId : undefined,
  });
  return applySubtitleBundleToContext(ctx, asrBundle, scriptField, outputStatePath, subtitlesJsonField);
}
