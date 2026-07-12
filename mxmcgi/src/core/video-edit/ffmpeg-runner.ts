/**
 * ffmpeg 命令行封装（video-edit 模块专用）
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

export type ImageFit = "cover" | "contain" | "fill" | "none";

/** 静态图 Ken Burns 动效（仅图片，视频素材不适用） */
export type ImageMotion =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down";

/**
 * 按适配模式构建 ffmpeg 滤镜，将图片规整到 targetW×targetH 画布：
 * - cover：等比放大铺满后裁剪（默认）
 * - contain：等比缩小完整显示，四周补黑边
 * - fill：非等比拉伸铺满（可能变形）
 * - none：原始像素居中，超出裁剪、不足补黑
 */
export function buildImageFitFilter(fit: ImageFit, w: number, h: number): string {
  const W = Math.max(2, Math.floor(w / 2) * 2);
  const H = Math.max(2, Math.floor(h / 2) * 2);
  switch (fit) {
    case "fill":
      return `scale=${W}:${H},setsar=1`;
    case "contain":
      return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    case "none":
      return `crop='min(iw,${W})':'min(ih,${H})',pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    case "cover":
    default:
      return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
  }
}

/**
 * 静态图 Ken Burns：先放大裁切留出运镜空间，再 zoompan 输出固定画幅
 */
export function buildImageMotionFilter(
  motion: ImageMotion,
  w: number,
  h: number,
  durationSec: number,
  fps: number,
  fit: ImageFit = "cover"
): string {
  if (motion === "none") {
    return buildImageFitFilter(fit, w, h);
  }
  const W = Math.max(2, Math.floor(w / 2) * 2);
  const H = Math.max(2, Math.floor(h / 2) * 2);
  const d = Math.max(1, Math.ceil(durationSec * fps));
  /** zoompan 的 on 为 0..d-1，用 d-1 作分母使末帧刚好走完动效 */
  const steps = Math.max(1, d - 1);
  const prep = buildImageFitFilter(fit, W, H);
  const panZoom = 1.22;
  let zp: string;
  let xp: string;
  let yp: string;
  switch (motion) {
    case "zoom-in":
      zp = `'1+0.2*on/${steps}'`;
      xp = `'iw/2-(iw/zoom/2)'`;
      yp = `'ih/2-(ih/zoom/2)'`;
      break;
    case "zoom-out":
      zp = `'1.2-0.2*on/${steps}'`;
      xp = `'iw/2-(iw/zoom/2)'`;
      yp = `'ih/2-(ih/zoom/2)'`;
      break;
    case "pan-left":
      zp = `'${panZoom}'`;
      xp = `'max(0,(iw-iw/zoom)*(1-on/${steps}))'`;
      yp = `'ih/2-(ih/zoom/2)'`;
      break;
    case "pan-right":
      zp = `'${panZoom}'`;
      xp = `'min(iw-iw/zoom,(iw-iw/zoom)*on/${steps})'`;
      yp = `'ih/2-(ih/zoom/2)'`;
      break;
    case "pan-up":
      zp = `'${panZoom}'`;
      xp = `'iw/2-(iw/zoom/2)'`;
      yp = `'max(0,(ih-ih/zoom)*(1-on/${steps}))'`;
      break;
    case "pan-down":
      zp = `'${panZoom}'`;
      xp = `'iw/2-(iw/zoom/2)'`;
      yp = `'min(ih-ih/zoom,(ih-ih/zoom)*on/${steps})'`;
      break;
    default:
      return prep;
  }
  return `${prep},zoompan=z=${zp}:x=${xp}:y=${yp}:d=${d}:s=${W}x${H}:fps=${fps}`;
}

/** 静态图 hold 为 mp4；传入 target 尺寸时按 fit 规整画面 */
export async function imageToHoldMp4(input: {
  imagePath: string;
  outputPath: string;
  durationSec: number;
  fps?: number;
  targetWidth?: number;
  targetHeight?: number;
  fit?: ImageFit;
  motion?: ImageMotion;
}): Promise<void> {
  const fps = input.fps ?? 30;
  const durationSec = Math.max(0.5, input.durationSec);
  const frameCount = Math.max(1, Math.ceil(durationSec * fps));
  mkdirSync(dirname(input.outputPath), { recursive: true });
  const args = ["-y", "-loop", "1", "-i", input.imagePath];
  const motion = input.motion ?? "none";
  if (input.targetWidth && input.targetHeight) {
    const vf =
      motion === "none"
        ? buildImageFitFilter(input.fit ?? "cover", input.targetWidth, input.targetHeight)
        : buildImageMotionFilter(
            motion,
            input.targetWidth,
            input.targetHeight,
            durationSec,
            fps,
            input.fit ?? "cover"
          );
    args.push("-vf", vf);
  }
  args.push(
    "-c:v",
    "libx264",
    "-t",
    String(durationSec),
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps)
  );
  if (motion !== "none") {
    /** 限制输出帧数，避免 -loop 1 输入导致 zoompan 在同一片段内重复播放 */
    args.push("-frames:v", String(frameCount));
  }
  args.push("-movflags", "+faststart", input.outputPath);
  await runFfmpeg(args);
}

/** 素材库视频裁剪/适配到片段时长与画幅（去掉原声轨，口播由独立轨提供） */
export async function trimStockVideoToClip(input: {
  videoPath: string;
  outputPath: string;
  durationSec: number;
  targetWidth?: number;
  targetHeight?: number;
  fit?: ImageFit;
  fps?: number;
}): Promise<void> {
  const fps = input.fps ?? 30;
  const duration = Math.max(0.5, input.durationSec);
  mkdirSync(dirname(input.outputPath), { recursive: true });
  const args = ["-y", "-i", input.videoPath, "-t", String(duration), "-an"];
  if (input.targetWidth && input.targetHeight) {
    args.push("-vf", buildImageFitFilter(input.fit ?? "cover", input.targetWidth, input.targetHeight));
  }
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    input.outputPath
  );
  await runFfmpeg(args);
}

/** PNG 序列 → mp4 */
export async function encodeFramesToMp4(
  framesDir: string,
  outPath: string,
  fps: number
): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const inputPattern = join(framesDir, "frame_%05d.png");
  await runFfmpeg([
    "-y",
    "-framerate",
    String(fps),
    "-i",
    inputPattern,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}
export async function concatMp4Files(mp4Paths: string[], outPath: string): Promise<void> {
  if (mp4Paths.length === 0) throw new Error("concatMp4Files: empty");
  if (mp4Paths.length === 1) {
    const { copyFileSync } = await import("node:fs");
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(mp4Paths[0]!, outPath);
    return;
  }
  const listPath = `${outPath}.concat.txt`;
  const listContent = mp4Paths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, listContent);
  mkdirSync(dirname(outPath), { recursive: true });
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
}

export type XfadeTransitionSpec = {
  type: string;
  durationSeconds: number;
};

/** ffmpeg xfade 转场名映射 */
export function mapTransitionToXfade(type: string): string {
  switch (type) {
    case 'dipToBlack':
      return 'fadeblack';
    case 'dipToWhite':
      return 'fadewhite';
    case 'wipe':
      return 'wipeleft';
    case 'slide':
      return 'slideleft';
    case 'zoom':
      return 'zoomin';
    case 'push':
      return 'slideright';
    case 'crossfade':
    default:
      return 'fade';
  }
}

/** 多段 mp4 以 xfade 转场拼接（无音频轨，口播由上层混流） */
export async function concatMp4WithXfade(
  clips: { path: string; duration: number }[],
  transitions: XfadeTransitionSpec[],
  outPath: string
): Promise<void> {
  if (clips.length === 0) throw new Error('concatMp4WithXfade: empty');
  if (clips.length === 1) {
    const { copyFileSync } = await import('node:fs');
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(clips[0]!.path, outPath);
    return;
  }

  const args = ['-y'];
  for (const c of clips) args.push('-i', c.path);

  let accDuration = clips[0]!.duration;
  let prevLabel = '[0:v]';
  const parts: string[] = [];

  for (let i = 0; i < clips.length - 1; i++) {
    const tr = transitions[i] ?? { type: 'crossfade', durationSeconds: 0.5 };
    const dur = Math.max(0.2, Math.min(1.5, tr.durationSeconds));
    const offset = Math.max(0, accDuration - dur);
    const xfade = mapTransitionToXfade(tr.type);
    const outLabel = i === clips.length - 2 ? '[vout]' : `[v${i}]`;
    parts.push(
      `${prevLabel}[${i + 1}:v]xfade=transition=${xfade}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel}`
    );
    prevLabel = outLabel;
    accDuration = accDuration + clips[i + 1]!.duration - dur;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  await runFfmpeg([
    ...args,
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[vout]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outPath,
  ]);
}
