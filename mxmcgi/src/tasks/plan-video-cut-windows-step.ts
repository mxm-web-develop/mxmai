/**
 * 前置管线步骤：planVideoCutWindows（确定性 A0，不调用 LLM）
 */
import type { PipelineStep, TaskContext } from './types';
import { interpolatePipelineTemplate } from './business-pipeline';
import { planRhythmWindows } from '../core/video-edit/plan-cut-windows';

function readTemplate(ctx: TaskContext, tmpl: string | undefined): string {
  if (!tmpl?.trim()) return '';
  return interpolatePipelineTemplate(tmpl, ctx).trim();
}

function readNumber(ctx: TaskContext, tmpl: string | undefined, fallbackField?: string): number {
  const fromTmpl = tmpl ? readTemplate(ctx, tmpl) : '';
  if (fromTmpl && Number(fromTmpl) > 0) return Number(fromTmpl);
  if (fallbackField) {
    const raw = ctx.params[fallbackField];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string' && raw.trim() && Number(raw) > 0) return Number(raw);
  }
  const voiceoverAudio = ctx.state.voiceoverAudio as { durationSeconds?: number } | undefined;
  if (typeof voiceoverAudio?.durationSeconds === 'number' && voiceoverAudio.durationSeconds > 0) {
    return voiceoverAudio.durationSeconds;
  }
  return 0;
}

function readRawFromContext(ctx: TaskContext, tmpl: string | undefined, statePath?: string): unknown {
  if (tmpl?.trim()) {
    const interpolated = interpolatePipelineTemplate(tmpl, ctx);
    if (interpolated.trim().startsWith('[') || interpolated.trim().startsWith('{')) {
      try {
        return JSON.parse(interpolated) as unknown;
      } catch {
        return interpolated;
      }
    }
    if (interpolated.trim()) return interpolated;
  }
  if (statePath?.trim()) {
    const parts = statePath.split('.').filter(Boolean);
    let cur: unknown = ctx.state;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }
  return undefined;
}

export async function runPlanVideoCutWindowsStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const fieldMapping = (step.fieldMapping ?? step.params?.fieldMapping ?? {}) as Record<
    string,
    string
  >;

  const durationSeconds = readNumber(
    ctx,
    fieldMapping.duration ?? (step.params?.durationFrom as string | undefined),
    typeof step.params?.durationField === 'string' ? step.params.durationField : 'audio_duration_seconds'
  );

  if (durationSeconds <= 0) {
    throw new Error(
      'planVideoCutWindows: 缺少有效总时长（请先 resolveVoiceoverAudio 或绑定 fieldMapping.duration）'
    );
  }

  const segmentsRaw = readRawFromContext(
    ctx,
    fieldMapping.segments ?? (step.params?.segmentsFrom as string | undefined),
    typeof step.params?.segmentsStatePath === 'string' ? step.params.segmentsStatePath : undefined
  );

  const cutRhythm =
    readTemplate(ctx, fieldMapping.cutRhythm ?? (step.params?.cutRhythmFrom as string | undefined)) ||
    (typeof step.params?.defaultCutRhythm === 'string' ? step.params.defaultCutRhythm : undefined);

  const plan = planRhythmWindows({
    voiceoverSegmentsRaw: segmentsRaw ?? ctx.params.voiceover_subtitles_json,
    totalDurationSeconds: durationSeconds,
    cutRhythm: cutRhythm || undefined,
    minCutSeconds:
      typeof step.params?.minCutSeconds === 'number'
        ? step.params.minCutSeconds
        : Number(step.params?.minCutSeconds) || undefined,
    maxCutSeconds:
      typeof step.params?.maxCutSeconds === 'number'
        ? step.params.maxCutSeconds
        : Number(step.params?.maxCutSeconds) || undefined,
  });

  const outputStatePath =
    typeof step.params?.outputStatePath === 'string' && step.params.outputStatePath.trim()
      ? step.params.outputStatePath.trim()
      : 'rhythmWindows';

  return {
    ...ctx,
    state: {
      ...ctx.state,
      [outputStatePath]: plan,
    },
  };
}
