/**
 * 管线步骤：resolveDialogueTimeline
 * 将 lines 的相对 cue + 实测 duration_ms 展开为绝对 start_ms
 */
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import {
  resolveDialogueTimeline,
  mergeDialogueSubtitles,
} from '../core/audio/resolve-dialogue-timeline';
import type { DialogueTimelineLine } from '../core/audio/dialogue-timeline-types';

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function writeByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.').filter(Boolean);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    if (!cur[seg] || typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function runResolveDialogueTimelineStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const linesFrom = String(params.linesFrom ?? 'contract.business.lines').trim();
  const contract = ctx.state.contract as Record<string, unknown> | undefined;
  if (!contract) throw new ConfigurationError('resolveDialogueTimeline：缺少 state.contract');

  const raw = linesFrom.startsWith('contract.')
    ? readByPath(contract, linesFrom.slice('contract.'.length))
    : linesFrom.startsWith('state.')
      ? readByPath(ctx.state, linesFrom.slice('state.'.length))
      : readByPath(contract, linesFrom);

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ConfigurationError(`resolveDialogueTimeline：${linesFrom} 为空`);
  }

  const resolved = resolveDialogueTimeline(raw as DialogueTimelineLine[]);
  const subtitles = mergeDialogueSubtitles(resolved.lines);

  const nextContract = cloneJson(contract);
  if (linesFrom.startsWith('contract.')) {
    writeByPath(nextContract, linesFrom.slice('contract.'.length), resolved.lines);
  }

  const timelineJson = {
    totalDurationMs: resolved.totalDurationMs,
    totalDurationSeconds: Math.round((resolved.totalDurationMs / 1000) * 100) / 100,
    lines: resolved.lines.map((l) => ({
      id: l.id,
      speakerId: l.speakerId,
      start_ms: l.start_ms,
      duration_ms: l.duration_ms,
      kind: l.kind,
      audio_url: l.audio_url,
    })),
    subtitles,
  };

  writeByPath(nextContract, 'business.timeline_json', timelineJson);

  return {
    ...ctx,
    params: {
      ...ctx.params,
      dialogue_total_duration_seconds: timelineJson.totalDurationSeconds,
      total_duration_seconds: timelineJson.totalDurationSeconds,
      audio_duration_seconds: timelineJson.totalDurationSeconds,
    },
    state: {
      ...ctx.state,
      contract: nextContract,
      dialogueTimeline: timelineJson,
    },
  };
}
