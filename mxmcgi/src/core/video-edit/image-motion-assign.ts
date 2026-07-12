/**
 * 静图 / AI 配图 Ken Burns 动效：默认开启，按时间轴顺序交替分配
 */
import type { MxmClipMetadata, VideoEditScript } from './types';

const PAN_MOTIONS = ['pan-left', 'pan-right'] as const;
const ZOOM_MOTIONS = ['zoom-in', 'zoom-out'] as const;

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
  // 开场白 / 结尾语用轻微 zoom-in，避免横向平移的「B-roll 感」，更像标题卡
  if (meta.mxmBeatRole === 'opening' || meta.mxmBeatRole === 'closing') {
    return 'zoom-in';
  }
  if (preset === 'zoom-alternate') {
    return ZOOM_MOTIONS[index % ZOOM_MOTIONS.length]!;
  }
  if (preset === 'pan-alternate') {
    return PAN_MOTIONS[index % PAN_MOTIONS.length]!;
  }
  // auto：静图 pan 交替，AI 配图 zoom 交替
  if (meta.mxmRenderMode === 'ai-video-gen' && meta.mxmAiOutputKind === 'image') {
    return ZOOM_MOTIONS[index % ZOOM_MOTIONS.length]!;
  }
  return PAN_MOTIONS[index % PAN_MOTIONS.length]!;
}

/**
 * 按时间轴顺序为静图段分配交替 Ken Burns（pan-left↔pan-right 或 zoom-in↔zoom-out）
 * - 默认开启（mxmImageMotionEnabled=true）
 * - 用户已显式关闭或指定动效时保留（respectExisting=true）
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
