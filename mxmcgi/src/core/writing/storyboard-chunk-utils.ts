/**
 * 分镜脚本 chunk 拼接工具
 * 将 StoryboardChunk 转为可直接用于视频生成模型的 prompt 字符串
 * 单镜头 chunk 使用扁平字段；多镜头 chunk 使用 shots 数组，按 " | " 分隔各镜头 prompt
 */

import type { StoryboardChunk, StoryboardShot } from './type';

/** 相邻 chunk 之间拼接时的分隔符（整片多段） */
const DEFAULT_CHUNK_SEPARATOR = ' | ';

/** 同一 chunk 内多镜头之间的分隔符（sora-2 storyboard 结构） */
const SHOT_SEPARATOR = ' | ';

/** 多镜头 chunk 的 prompt 中，各镜头之间用换行+空格分隔（便于阅读与下游解析） */
const SHOT_LINE_SEPARATOR = '\n ';

/** 将秒数格式化为 MM:SS，如 6 → "00:06"，65 → "01:05" */
function secondsToMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * 按镜头数均分 chunk 时长，得到每个镜头的起止时间线
 * 如 chunkSeconds=15, shotCount=3 → ["00:00-00:05", "00:05-00:10", "00:10-00:15"]
 */
function getEqualShotTimeline(chunkSeconds: number, shotCount: number): string[] {
  if (shotCount <= 0) return [];
  if (shotCount === 1) return [`00:00-${secondsToMMSS(chunkSeconds)}`];
  const step = chunkSeconds / shotCount;
  const segs: string[] = [];
  for (let i = 0; i < shotCount; i++) {
    const start = i * step;
    const end = (i + 1) * step;
    segs.push(`${secondsToMMSS(start)}-${secondsToMMSS(end)}`);
  }
  return segs;
}

/** 按「镜头n：」或「场景n：」拆分 video_description，返回各镜头内容（顺序与 shot_timeline 一一对应） */
function extractShotContents(videoDescription: string): string[] {
  const t = videoDescription.trim();
  if (!t) return [];

  const shotRegex = /(?:镜头|场景)\s*\d+\s*[：:]\s*/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(shotRegex.source, 'g');
  while ((m = re.exec(t)) !== null) {
    if (m.index > lastIndex) {
      const before = t.slice(lastIndex, m.index).trim();
      if (before) parts.push(before);
    }
    lastIndex = re.lastIndex;
  }
  const tail = t.slice(lastIndex).trim();
  if (tail) parts.push(tail);

  const trimmed = parts.map((p) => p.trim()).filter(Boolean);
  if (trimmed.length <= 1 && t) {
    // 单镜头：去掉可能存在的「镜头1：」前缀，只保留内容
    const single = trimmed[0] ?? t.replace(/^(?:镜头|场景)\s*\d+\s*[：:]\s*/, '').trim();
    return single ? [single] : [];
  }
  return trimmed;
}

/**
 * 将单个镜头（StoryboardShot 或扁平 chunk 的字段）拼接为一段 prompt 字符串
 */
export function shotToPromptString(shot: StoryboardShot): string {
  const parts: string[] = [];
  if (shot.video_description?.trim()) {
    parts.push(shot.video_description.trim());
  }
  if (shot.camera_movement?.trim()) {
    parts.push(`镜头：${shot.camera_movement.trim()}`);
  }
  if (shot.dialogue?.trim()) {
    parts.push(shot.dialogue.trim());
  }
  if (shot.sound_effects?.trim()) {
    parts.push(`音效：${shot.sound_effects.trim()}`);
  }
  if (shot.transition?.trim()) {
    parts.push(`转场：${shot.transition.trim()}`);
  }
  return parts.join(' ');
}

/**
 * 将单个 chunk 的字段拼接为一段可直接用于视频模型的 prompt 字符串
 * - 多镜头 chunk（有 shots 数组）：按 shot 顺序拼接，每个镜头前加 [起止时间]（如 [00:00-00:04]），镜头间用换行+空格分隔
 * - 单镜头 chunk（扁平）：与原先逻辑一致，支持 video_description 内「镜头1：… 镜头2：…」及 shot_timeline
 */
export function chunkToPromptString(chunk: StoryboardChunk): string {
  if (chunk.shots?.length) {
    let accSec = 0;
    const parts = chunk.shots.map((s) => {
      const seg = (Array.isArray(s.shot_timeline) && s.shot_timeline[0])
        ? s.shot_timeline[0]
        : (() => {
            const start = accSec;
            accSec += s.chunk_seconds ?? 4;
            return `${secondsToMMSS(start)}-${secondsToMMSS(accSec)}`;
          })();
      if (Array.isArray(s.shot_timeline) && s.shot_timeline[0]) accSec += s.chunk_seconds ?? 4;
      const prompt = s.prompt?.trim() || shotToPromptString(s);
      return `[${seg}] ${prompt}`;
    });
    return parts.join(SHOT_LINE_SEPARATOR);
  }

  const parts: string[] = [];
  const videoDescription = chunk.video_description?.trim() ?? '';

  if (videoDescription) {
    const shotContents = extractShotContents(videoDescription);
    if (shotContents.length === 0) {
      parts.push(videoDescription);
    } else if (shotContents.length === 1) {
      parts.push(shotContents[0]);
    } else {
      const timeline =
        chunk.shot_timeline?.length === shotContents.length
          ? chunk.shot_timeline
          : getEqualShotTimeline(chunk.chunk_seconds, shotContents.length);
      const labeled = shotContents.map((content, i) => {
        const seg = timeline[i] ?? getEqualShotTimeline(chunk.chunk_seconds, shotContents.length)[i];
        return seg ? `[${seg}] ${content}` : content;
      });
      parts.push(labeled.join(SHOT_SEPARATOR));
    }
  }

  if (chunk.camera_movement?.trim()) {
    parts.push(`镜头：${chunk.camera_movement.trim()}`);
  }
  if (chunk.dialogue?.trim()) {
    parts.push(chunk.dialogue.trim());
  }
  if (chunk.sound_effects?.trim()) {
    parts.push(`音效：${chunk.sound_effects.trim()}`);
  }
  if (chunk.transition?.trim()) {
    parts.push(`转场：${chunk.transition.trim()}`);
  }
  return parts.join(' ');
}

/**
 * 将 chunk 数组拼接成一行字符串，便于整片作为视频生成模型输入
 * @param chunks 分镜 chunk 数组
 * @param options.separator 相邻 chunk 之间的分隔符，默认 " | "
 * @param options.useChunkPrompt 若为 true，直接使用每个 chunk 的 prompt 字段拼接；否则现场用 chunkToPromptString 生成
 */
export function chunksToSingleLineString(
  chunks: StoryboardChunk[],
  options?: { separator?: string; useChunkPrompt?: boolean }
): string {
  const separator = options?.separator ?? DEFAULT_CHUNK_SEPARATOR;
  const useChunkPrompt = options?.useChunkPrompt !== false;

  if (!chunks.length) {
    return '';
  }

  const parts = chunks.map((chunk) => {
    if (useChunkPrompt && chunk.prompt?.trim()) {
      return chunk.prompt.trim();
    }
    return chunkToPromptString(chunk);
  });

  return parts.filter(Boolean).join(separator);
}

/**
 * 为 chunk 数组填充每个 chunk 的 prompt 字段（就地修改）
 * - 多镜头 chunk：填充每个 shot.prompt，并填充 chunk.prompt 为整段拼接结果
 * - 单镜头 chunk：填充 chunk.prompt
 */
export function fillChunkPrompts(chunks: StoryboardChunk[]): void {
  for (const chunk of chunks) {
    if (chunk.shots?.length) {
      for (const shot of chunk.shots) {
        (shot as StoryboardShot).prompt = shotToPromptString(shot);
      }
      (chunk as StoryboardChunk).prompt = chunkToPromptString(chunk);
    } else {
      (chunk as StoryboardChunk).prompt = chunkToPromptString(chunk);
    }
  }
}
