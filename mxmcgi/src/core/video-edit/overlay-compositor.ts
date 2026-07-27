/**
 * 将 OpenReel textClips 烧录进基底 mp4（ffmpeg drawtext，无需 headless 浏览器）
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TextClip } from '@mxmai/mxm-editor-core/text/types';
import type { VideoEditScript } from './types';
import { runFfmpeg } from './ffmpeg-runner';
import { fetchMediaBuffer } from './media-fetch';
import { persistLocalFileToStorage } from './storage-upload';
import { resolveOverlayFontFile } from './overlay-font';
import { subtitlesToTextClips } from './subtitle-overlay';

export { resolveOverlayFontFile } from './overlay-font';

export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function hexToFfmpegColor(hex: string, fallbackAlpha = 1): string {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `white@${fallbackAlpha}`;
  const h = m[1]!;
  return `0x${h}@${fallbackAlpha}`;
}

function rgbaToFfmpegBox(color?: string): { box: string; boxcolor: string } | null {
  if (!color?.trim()) return null;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { box: '1', boxcolor: 'black@0.45' };
  const r = Number(m[1]).toString(16).padStart(2, '0');
  const g = Number(m[2]).toString(16).padStart(2, '0');
  const b = Number(m[3]).toString(16).padStart(2, '0');
  const a = m[4] != null ? Number(m[4]) : 0.55;
  return { box: '1', boxcolor: `0x${r}${g}${b}@${a}` };
}

/** 构建单条 textClip 的 drawtext 滤镜（相对 clip 局部时间 t） */
export function buildDrawtextFilter(
  clip: TextClip,
  clipStartSec: number,
  fontFile: string
): string {
  const localStart = Math.max(0, clip.startTime - clipStartSec);
  const duration = Math.max(0.2, clip.duration);
  const localEnd = localStart + duration;
  const preset = clip.animation?.preset ?? 'fade';
  const inDur = clip.animation?.inDuration ?? 0.55;
  const outDur = clip.animation?.outDuration ?? 0.35;
  const fontsize = Math.max(28, Math.round(Number(clip.style.fontSize) || 56));
  const fontcolor = hexToFfmpegColor(clip.style.color ?? '#ffffff');
  const text = escapeDrawtext(clip.text);
  const nx = clip.transform.position.x;
  const ny = clip.transform.position.y;

  const enable = `between(t\\,${localStart}\\,${localEnd})`;
  const alpha = `if(lt(t\\,${localStart + inDur})\\,(t-${localStart})/${inDur}\\,if(gt(t\\,${localEnd - outDur})\\,(${localEnd}-t)/${outDur}\\,1))`;

  let xExpr = `(w-text_w)*${nx}`;
  let yExpr = `(h-text_h)*${ny}`;
  if (preset === 'slide-up') {
    yExpr = `if(lt(t\\,${localStart + inDur})\\,(h-text_h)*${ny}+48*(1-(t-${localStart})/${inDur})\\,(h-text_h)*${ny})`;
  } else if (preset === 'slide-down') {
    yExpr = `if(lt(t\\,${localStart + inDur})\\,(h-text_h)*${ny}-48*(1-(t-${localStart})/${inDur})\\,(h-text_h)*${ny})`;
  } else if (preset === 'slide-left') {
    xExpr = `if(lt(t\\,${localStart + inDur})\\,(w-text_w)*${nx}+64*(1-(t-${localStart})/${inDur})\\,(w-text_w)*${nx})`;
  } else if (preset === 'slide-right') {
    xExpr = `if(lt(t\\,${localStart + inDur})\\,(w-text_w)*${nx}-64*(1-(t-${localStart})/${inDur})\\,(w-text_w)*${nx})`;
  }

  const strokeW = Math.max(0, Math.round(clip.style.strokeWidth ?? 0));
  const strokeColor = clip.style.strokeColor
    ? hexToFfmpegColor(clip.style.strokeColor)
    : 'black@1';
  const shadowX = Math.round(clip.style.shadowOffsetX ?? 0);
  const shadowY = Math.round(clip.style.shadowOffsetY ?? 0);
  const hasShadow = shadowX !== 0 || shadowY !== 0 || (clip.style.shadowBlur ?? 0) > 0;

  const appendStyleExtras = (parts: string[]) => {
    if (strokeW > 0) {
      parts.push(`borderw=${strokeW}`, `bordercolor=${strokeColor}`);
    }
    if (hasShadow) {
      parts.push(
        `shadowx=${shadowX}`,
        `shadowy=${shadowY}`,
        `shadowcolor=${hexToFfmpegColor(clip.style.shadowColor ?? '#000000', 0.85)}`
      );
    }
    const box = rgbaToFfmpegBox(clip.style.backgroundColor);
    if (box) parts.push(`box=${box.box}`, `boxcolor=${box.boxcolor}`, 'boxborderw=10');
  };

  if (preset === 'pop') {
    const fs = `if(lt(t\\,${localStart + inDur})\\,${fontsize}*(0.7+0.3*(t-${localStart})/${inDur})\\,${fontsize})`;
    const parts = [
      `fontfile='${fontFile.replace(/'/g, "'\\''")}'`,
      `text='${text}'`,
      `fontsize=${fs}`,
      `fontcolor=${fontcolor}`,
      `x=${xExpr}`,
      `y=${yExpr}`,
      `enable='${enable}'`,
      `alpha='${alpha}'`,
    ];
    appendStyleExtras(parts);
    return `drawtext=${parts.join(':')}`;
  }

  const parts = [
    `fontfile='${fontFile.replace(/'/g, "'\\''")}'`,
    `text='${text}'`,
    `fontsize=${fontsize}`,
    `fontcolor=${fontcolor}`,
    `x=${xExpr}`,
    `y=${yExpr}`,
    `enable='${enable}'`,
  ];
  if (
    preset === 'fade' ||
    preset === 'typewriter' ||
    preset === 'none' ||
    preset === 'bounce' ||
    preset === 'slide-left' ||
    preset === 'slide-right' ||
    preset === 'slide-up' ||
    preset === 'slide-down'
  ) {
    parts.push(`alpha='${alpha}'`);
  }
  appendStyleExtras(parts);
  return `drawtext=${parts.join(':')}`;
}

export function textClipsForVisualClip(
  script: VideoEditScript,
  clipStart: number,
  clipDuration: number
): TextClip[] {
  const clipEnd = clipStart + clipDuration;
  return (script.project.textClips ?? []).filter(
    (tc) => tc.startTime < clipEnd && tc.startTime + tc.duration > clipStart
  );
}

export function subtitleTextClipsForVisualClip(
  script: VideoEditScript,
  clipStart: number,
  clipDuration: number
): TextClip[] {
  const clipEnd = clipStart + clipDuration;
  return subtitlesToTextClips(script).filter(
    (tc) => tc.startTime < clipEnd && tc.startTime + tc.duration > clipStart
  );
}

export async function compositeTextClipsOnVideoFile(input: {
  inputVideoPath: string;
  outputVideoPath: string;
  textClips: TextClip[];
  clipStartSec: number;
  fontFile?: string;
}): Promise<void> {
  if (input.textClips.length === 0) {
    const { copyFileSync } = await import('node:fs');
    copyFileSync(input.inputVideoPath, input.outputVideoPath);
    return;
  }
  const fontFile = input.fontFile ?? resolveOverlayFontFile();
  const filters = input.textClips.map((tc) =>
    buildDrawtextFilter(tc, input.clipStartSec, fontFile)
  );
  await runFfmpeg([
    '-y',
    '-i',
    input.inputVideoPath,
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:a',
    'copy',
    input.outputVideoPath,
  ]);
}

export async function burnSubtitleOverlaysForClip(input: {
  script: VideoEditScript;
  clipId: string;
  clipStart: number;
  clipDuration: number;
  sourceVideoUrl: string;
  userId: string;
  parentTaskId?: string;
}): Promise<string> {
  const overlays = subtitleTextClipsForVisualClip(input.script, input.clipStart, input.clipDuration);
  if (overlays.length === 0) return input.sourceVideoUrl;

  const workDir = mkdtempSync(join(tmpdir(), 'mxm-subtitle-'));
  const inPath = join(workDir, 'in.mp4');
  const outPath = join(workDir, 'out.mp4');

  const buf = await fetchMediaBuffer(input.sourceVideoUrl);
  writeFileSync(inPath, buf);

  await compositeTextClipsOnVideoFile({
    inputVideoPath: inPath,
    outputVideoPath: outPath,
    textClips: overlays,
    clipStartSec: input.clipStart,
  });

  return (
    await persistLocalFileToStorage({
      localPath: outPath,
      userId: input.userId,
      parentTaskId: input.parentTaskId,
      clipId: input.clipId,
      ext: 'mp4',
      contentType: 'video/mp4',
    })
  ).url;
}

export async function burnTextOverlaysForClip(input: {
  script: VideoEditScript;
  clipId: string;
  clipStart: number;
  clipDuration: number;
  sourceVideoUrl: string;
  userId: string;
  parentTaskId?: string;
}): Promise<string> {
  const overlays = textClipsForVisualClip(input.script, input.clipStart, input.clipDuration);
  if (overlays.length === 0) return input.sourceVideoUrl;

  const workDir = mkdtempSync(join(tmpdir(), 'mxm-overlay-'));
  const inPath = join(workDir, 'in.mp4');
  const outPath = join(workDir, 'out.mp4');

  const overlayBuf = await fetchMediaBuffer(input.sourceVideoUrl);
  writeFileSync(inPath, overlayBuf);

  await compositeTextClipsOnVideoFile({
    inputVideoPath: inPath,
    outputVideoPath: outPath,
    textClips: overlays,
    clipStartSec: input.clipStart,
  });

  return (
    await persistLocalFileToStorage({
      localPath: outPath,
      userId: input.userId,
      parentTaskId: input.parentTaskId,
      clipId: input.clipId,
      ext: 'mp4',
      contentType: 'video/mp4',
    })
  ).url;
}

/** 对 script 中所有已渲染 clip 烧录口播字幕（分镜首次渲染默认开启） */
export async function applySubtitleBurnToScript(
  script: VideoEditScript,
  userId: string,
  parentTaskId?: string
): Promise<void> {
  if ((script.project.timeline.subtitles ?? []).length === 0) return;

  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata;
      if (!mx?.mxmRenderMode || !mx.mxmRenderedVideoUrl) continue;
      const overlays = subtitleTextClipsForVisualClip(script, clip.startTime, clip.duration);
      if (overlays.length === 0) continue;

      try {
        const url = await burnSubtitleOverlaysForClip({
          script,
          clipId: clip.id,
          clipStart: clip.startTime,
          clipDuration: clip.duration,
          sourceVideoUrl: mx.mxmRenderedVideoUrl,
          userId,
          parentTaskId,
        });
        mx.mxmRenderedVideoUrl = url;
        mx.mxmRenderStatus = 'ready';
      } catch (e) {
        // 字幕烧录失败不应毁掉已就绪的基底成片（否则审核页会掉进「正在匹配画面素材」）
        console.warn(
          `[subtitle-burn] clip ${clip.id} 烧录失败，保留无字幕底片:`,
          e instanceof Error ? e.message : e
        );
        mx.mxmRenderStatus = 'ready';
        mx.mxmRenderError = e instanceof Error ? e.message : '字幕烧录失败';
      }
    }
  }
}

/** 对 script 中所有已渲染 clip 烧录 textClips overlay */
export async function applyTextOverlaysToScript(
  script: VideoEditScript,
  userId: string,
  parentTaskId?: string
): Promise<void> {
  const textClips = script.project.textClips ?? [];
  if (textClips.length === 0) return;

  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata;
      if (!mx?.mxmRenderMode || !mx.mxmRenderedVideoUrl) continue;
      const overlays = textClipsForVisualClip(script, clip.startTime, clip.duration);
      if (overlays.length === 0) continue;

      try {
        const url = await burnTextOverlaysForClip({
          script,
          clipId: clip.id,
          clipStart: clip.startTime,
          clipDuration: clip.duration,
          sourceVideoUrl: mx.mxmRenderedVideoUrl,
          userId,
          parentTaskId,
        });
        mx.mxmRenderedVideoUrl = url;
        mx.mxmRenderStatus = 'ready';
      } catch (e) {
        console.warn(
          `[text-overlay-burn] clip ${clip.id} 烧录失败，保留未叠字底片:`,
          e instanceof Error ? e.message : e
        );
        mx.mxmRenderStatus = 'ready';
        mx.mxmRenderError =
          e instanceof Error ? e.message : '文字叠加烧录失败';
      }
    }
  }
}
