/**
 * 管线步骤：renderAudioTimeline
 * 按绝对 start_ms 多轨混音，上传成片，写入 params / state
 */
import { randomUUID } from 'node:crypto';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import { renderAudioTimelineMix } from '../core/audio/dialogue-timeline-render';
import type { ResolvedDialogueLine } from '../core/audio/dialogue-timeline-types';
import { normalizeClientAccessibleMediaUrl } from '../core/audio/voiceover-audio-source';

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export async function runRenderAudioTimelineStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) throw new ConfigurationError('renderAudioTimeline：缺少 userId');

  const params = (step.params ?? {}) as Record<string, unknown>;
  const linesFrom = String(params.linesFrom ?? 'contract.business.lines').trim();
  const contract = ctx.state.contract as Record<string, unknown> | undefined;
  if (!contract) throw new ConfigurationError('renderAudioTimeline：缺少 state.contract');

  const raw = linesFrom.startsWith('contract.')
    ? readByPath(contract, linesFrom.slice('contract.'.length))
    : linesFrom.startsWith('state.')
      ? readByPath(ctx.state, linesFrom.slice('state.'.length))
      : readByPath(contract, linesFrom);

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ConfigurationError(`renderAudioTimeline：${linesFrom} 为空`);
  }

  const lines = raw as ResolvedDialogueLine[];
  for (const l of lines) {
    if (typeof l.start_ms !== 'number') {
      throw new ConfigurationError(
        'renderAudioTimeline：lines 缺少 start_ms，请先跑 resolveDialogueTimeline'
      );
    }
  }

  const timeline = ctx.state.dialogueTimeline as { totalDurationMs?: number } | undefined;
  const mixed = await renderAudioTimelineMix({
    lines,
    totalDurationMs: timeline?.totalDurationMs,
    userId,
    format: params.format === 'wav' ? 'wav' : 'mp3',
  });

  const storage = RepositoryFactory.getStorageService();
  const taskId = ctx.taskId || randomUUID();
  const stored = await storage.upload({
    domain: 'generated',
    purpose: 'audio_mix',
    buffer: mixed.buffer,
    contentType: mixed.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    userId,
    pathVars: {
      scope: 'audio',
      userId,
      taskId,
      index: 'mix',
      ext: mixed.format,
    },
  });

  const audioUrl = normalizeClientAccessibleMediaUrl(stored.url || '') || stored.url;
  const durationSeconds = Math.round((mixed.totalDurationMs / 1000) * 100) / 100;

  return {
    ...ctx,
    params: {
      ...ctx.params,
      dialogue_mix_audio_url: audioUrl,
      audio_url: audioUrl,
      total_duration_seconds: durationSeconds,
      audio_duration_seconds: durationSeconds,
    },
    state: {
      ...ctx.state,
      dialogueMix: {
        audioUrl,
        bucket: stored.bucket,
        key: stored.key,
        totalDurationMs: mixed.totalDurationMs,
        lineCount: mixed.lineCount,
        format: mixed.format,
      },
      finalArtifact: {
        kind: 'audio',
        text: '',
        metadata: {
          mxmWarp: true,
          dialogueMix: true,
          audioUrl,
          durationSeconds,
          lineCount: mixed.lineCount,
          storage_bucket: stored.bucket,
          storage_key: stored.key,
        },
      },
    },
  };
}
