/**
 * 静图 / AI 配图 Ken Burns 动效：默认开启，按时间轴分配有节奏的呼吸序列
 */
import type { MxmClipMetadata, VideoEditScript } from './types';

const PAN_MOTIONS = ['pan-left', 'pan-right'] as const;
const ZOOM_MOTIONS = ['zoom-in', 'zoom-out'] as const;

/**
 * 设计向默认序列：推近 / 横移 / 拉远 / 反向横移 / 微仰 / 微俯，
 * 避免全片同一方向横移带来的「传送带」感。
 */
const BREATH_SEQUENCE = [
  'zoom-in',
  'pan-right',
  'zoom-out',
  'pan-left',
  'pan-up',
  'zoom-in',
  'pan-down',
  'pan-right',
] as const;

export type ImageMotionPreset = 'pan-alternate' | 'zoom-alternate' | 'auto';

function clipUsesImageMotion(meta: MxmClipMetadata): boolean {
  if (meta.mxmRenderMode === 'ai-video-gen') {
    return meta.mxmAiOutputKind === 'image';
  }
  if (meta.mxmRenderMode !== 'static-image') return false;
  if (meta.mxmSourceVideoUrl?.trim()) return false;
  if (meta.mxmAutoStockVideo === true) return false;
  return true;
}

function defaultMotionForClip(
  meta: MxmClipMetadata,
  index: number,
  preset: ImageMotionPreset
): NonNullable<MxmClipMetadata['mxmImageMotion']> {
  // 开场白 / 结尾语用轻微 zoom-in，更像标题卡留白
  if (meta.mxmBeatRole === 'opening' || meta.mxmBeatRole === 'closing') {
    return 'zoom-in';
  }
  if (preset === 'zoom-alternate') {
    return ZOOM_MOTIONS[index % ZOOM_MOTIONS.length]!;
  }
  if (preset === 'pan-alternate') {
    return PAN_MOTIONS[index % PAN_MOTIONS.length]!;
  }
  // auto：呼吸序列（zoom ↔ pan 混搭）
  return BREATH_SEQUENCE[index % BREATH_SEQUENCE.length]!;
}

/**
 * 按时间轴顺序为静图段分配 Ken Burns
 * - 默认开启（mxmImageMotionEnabled=true）
 * - respectExisting=true 时：用户已关闭或显式指定动效则保留
 * - 初建时间轴应传 respectExisting=false，覆盖解析阶段误写的统一 pan-left
 */
export function assignAlternatingImageMotion(
  script: VideoEditScript,
  opts?: { preset?: ImageMotionPreset; respectExisting?: boolean }
): VideoEditScript {
  const preset = opts?.preset ?? 'auto';
  const respectExisting = opts?.respectExisting !== false;

  const rows: { clip: (typeof script.project.timeline.tracks)[0]['clips'][0]; meta: MxmClipMetadata }[] =
    [];
  for (const track of script.project.timeline.tracks) {
    if (track.type !== 'video') continue;
    for (const clip of track.clips) {
      const meta = (clip.metadata ?? {}) as MxmClipMetadata;
      if (!clipUsesImageMotion(meta)) continue;
      rows.push({ clip, meta });
    }
  }
  rows.sort((a, b) => a.clip.startTime - b.clip.startTime);

  for (let i = 0; i < rows.length; i++) {
    const { clip, meta } = rows[i]!;
    if (respectExisting && meta.mxmImageMotionEnabled === false) continue;
    if (
      respectExisting &&
      meta.mxmImageMotionEnabled === true &&
      meta.mxmImageMotion &&
      meta.mxmImageMotion !== 'none'
    ) {
      continue;
    }

    if (!clip.metadata) clip.metadata = {} as MxmClipMetadata;
    clip.metadata.mxmImageMotionEnabled = true;
    clip.metadata.mxmImageMotion = defaultMotionForClip(meta, i, preset);
  }

  return script;
}
