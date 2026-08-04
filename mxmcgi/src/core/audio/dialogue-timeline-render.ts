/**
 * 按绝对 start_ms 多轨混音成片（支持重叠）：ffmpeg adelay + amix
 */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFfmpeg } from '../video-edit/ffmpeg-runner';
import { downloadVoiceoverAudioBuffer } from './voiceover-audio-source';
import type { ResolvedDialogueLine } from './dialogue-timeline-types';

export interface RenderAudioTimelineInput {
  lines: ResolvedDialogueLine[];
  /** 总时长兜底（ms）；缺省取 max(start+duration) */
  totalDurationMs?: number;
  userId?: string;
  /** 输出格式 */
  format?: 'mp3' | 'wav';
}

export interface RenderAudioTimelineResult {
  buffer: Buffer;
  totalDurationMs: number;
  format: 'mp3' | 'wav';
  lineCount: number;
}

/** 构建 filter_complex（单测用） */
export function buildAdelayAmixFilter(startsMs: number[]): string {
  if (startsMs.length === 0) throw new Error('buildAdelayAmixFilter: empty');
  if (startsMs.length === 1) {
    const d = Math.max(0, Math.round(startsMs[0]!));
    // 单轨也走 adelay，便于统一；再 aformat 保证声道
    return `[0:a]adelay=${d}|${d},aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`;
  }
  const delayed: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < startsMs.length; i++) {
    const d = Math.max(0, Math.round(startsMs[i]!));
    const lab = `d${i}`;
    delayed.push(`[${i}:a]adelay=${d}|${d},aformat=sample_fmts=fltp:channel_layouts=stereo[${lab}]`);
    labels.push(`[${lab}]`);
  }
  return `${delayed.join(';')};${labels.join('')}amix=inputs=${startsMs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`;
}

/**
 * 下载各句音频，按 start_ms 定位混音，返回成片 buffer
 */
export async function renderAudioTimelineMix(
  input: RenderAudioTimelineInput
): Promise<RenderAudioTimelineResult> {
  const lines = (input.lines ?? []).filter(
    (l) => l && typeof l.audio_url === 'string' && l.audio_url.trim() && (l.duration_ms ?? 0) >= 0
  );
  if (lines.length === 0) {
    throw new Error('renderAudioTimelineMix：无有效 audio_url 行');
  }

  let totalDurationMs =
    typeof input.totalDurationMs === 'number' && input.totalDurationMs > 0
      ? Math.round(input.totalDurationMs)
      : 0;
  for (const l of lines) {
    totalDurationMs = Math.max(totalDurationMs, Math.round(l.start_ms + l.duration_ms));
  }
  if (totalDurationMs <= 0) {
    throw new Error('renderAudioTimelineMix：总时长无效');
  }

  const format = input.format === 'wav' ? 'wav' : 'mp3';
  const dir = await mkdtemp(join(tmpdir(), 'mxm-dialogue-mix-'));
  try {
    const localPaths: string[] = [];
    const starts: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const { buffer, filename } = await downloadVoiceoverAudioBuffer(line.audio_url!.trim(), {
        userId: input.userId,
      });
      const safe = (filename || `line-${i}.mp3`).replace(/[^\w.-]+/g, '_');
      const p = join(dir, `${i}-${safe}`);
      await writeFile(p, buffer);
      localPaths.push(p);
      starts.push(Math.max(0, Math.round(line.start_ms)));
    }

    const outPath = join(dir, `mix.${format}`);
    const filter = buildAdelayAmixFilter(starts);
    const args = ['-y'];
    for (const p of localPaths) {
      args.push('-i', p);
    }
    args.push('-filter_complex', filter, '-map', '[aout]');
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', '192k');
    } else {
      args.push('-c:a', 'pcm_s16le');
    }
    // 裁到总时长（含尾留白）
    const durSec = (totalDurationMs / 1000).toFixed(3);
    args.push('-t', durSec, outPath);

    await runFfmpeg(args);
    const buffer = await readFile(outPath);
    return {
      buffer,
      totalDurationMs,
      format,
      lineCount: lines.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
