/**
 * 视频拼接引擎 — ffmpeg concat + 口播音轨混流
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClipDispatchResult, MxmClipMetadata, MxmRenderMode, VideoEditScript } from "./types";
import { concatMp4Files, concatMp4WithXfade, muxAudioOntoMp4 } from "./ffmpeg-runner";
import { fetchMediaBuffer } from "./media-fetch";
import { persistLocalFileToStorage } from "./storage-upload";

/** 按时间轴顺序收集各 clip 的渲染结果（含已渲染 URL） */
export function orderedClipResultsFromScript(script: VideoEditScript): ClipDispatchResult[] {
  const rows: { startTime: number; result: ClipDispatchResult }[] = [];
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata as MxmClipMetadata | undefined;
      if (!mx?.mxmRenderMode) continue;
      rows.push({
        startTime: clip.startTime,
        result: {
          clipId: clip.id,
          renderMode: mx.mxmRenderMode as MxmRenderMode,
          videoUrl: mx.mxmRenderedVideoUrl,
          error: mx.mxmRenderStatus === "failed" ? mx.mxmRenderError ?? "渲染失败" : undefined,
        },
      });
    }
  }
  rows.sort((a, b) => a.startTime - b.startTime);
  return rows.map((r) => r.result);
}

/** 从脚本音轨解析可混流的音频 URL（剥离 tts: 前缀；跳过静音轨与空 mediaId） */
export function resolveScriptAudioMixInputs(script: VideoEditScript): Array<{
  url: string;
  volume: number;
}> {
  const out: Array<{ url: string; volume: number }> = [];
  for (const track of script.project.timeline.tracks) {
    if (track.type !== "audio" || track.muted) continue;
    for (const clip of track.clips) {
      let mid = String(clip.mediaId ?? "").trim();
      if (!mid) continue;
      if (mid.startsWith("tts:")) mid = mid.slice(4).trim();
      if (!mid) continue;
      const meta = (clip as { metadata?: Record<string, unknown>; volume?: unknown }).metadata;
      const volumeRaw =
        typeof (clip as { volume?: unknown }).volume === "number"
          ? (clip as { volume: number }).volume
          : typeof meta?.volume === "number"
            ? (meta.volume as number)
            : 1;
      const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(2, volumeRaw)) : 1;
      out.push({ url: mid, volume });
    }
  }
  return out;
}

interface ConcatInput {
  clips: ClipDispatchResult[];
  totalDuration: number;
  userId: string;
  parentTaskId?: string;
  script?: VideoEditScript;
  applyTransitions?: boolean;
}

function readVisualTransitions(script: VideoEditScript): Array<{
  clipAId: string;
  clipBId: string;
  type: string;
  durationSeconds: number;
}> {
  const out: Array<{
    clipAId: string;
    clipBId: string;
    type: string;
    durationSeconds: number;
  }> = [];
  for (const track of script.project.timeline.tracks) {
    if (track.type !== "video") continue;
    for (const tr of track.transitions ?? []) {
      out.push({
        clipAId: tr.clipAId,
        clipBId: tr.clipBId,
        type: String(tr.type ?? "crossfade"),
        durationSeconds: Number(tr.duration ?? 0.5),
      });
    }
  }
  return out;
}

async function downloadToWorkFile(
  url: string,
  workDir: string,
  filename: string
): Promise<string> {
  const buf = await fetchMediaBuffer(url);
  const path = join(workDir, filename);
  writeFileSync(path, buf);
  return path;
}

async function muxScriptAudioIfPresent(opts: {
  videoPath: string;
  script?: VideoEditScript;
  workDir: string;
  userId?: string;
}): Promise<string> {
  const { videoPath, script, workDir } = opts;
  if (!script) return videoPath;

  const mixInputs = resolveScriptAudioMixInputs(script);
  if (mixInputs.length === 0) return videoPath;

  const audioPaths: string[] = [];
  const volumes: number[] = [];
  for (let i = 0; i < mixInputs.length; i++) {
    const item = mixInputs[i]!;
    try {
      // 口播相对路径需走 MinIO/Gateway 解析，优先专用下载（含 media-asset）
      const { downloadVoiceoverAudioBuffer } = await import("../audio/voiceover-audio-source");
      const { buffer } = await downloadVoiceoverAudioBuffer(item.url, {
        userId: opts.userId,
      });
      const path = join(workDir, `audio-${String(i).padStart(2, "0")}.bin`);
      writeFileSync(path, buffer);
      audioPaths.push(path);
      volumes.push(item.volume);
    } catch (err) {
      console.warn(
        `[concat-engine] 跳过音轨 ${item.url.slice(0, 80)}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (audioPaths.length === 0) {
    console.warn("[concat-engine] 脚本含音轨但全部拉取失败，成片将无声");
    return videoPath;
  }

  const mixedPath = join(workDir, "final-with-audio.mp4");
  await muxAudioOntoMp4({
    videoPath,
    audioPaths,
    outPath: mixedPath,
    volumes,
  });
  return mixedPath;
}

export async function concatClipsToFinal(input: ConcatInput): Promise<string | undefined> {
  const { clips, userId, parentTaskId, script, applyTransitions } = input;
  const successful = clips.filter((c) => c.videoUrl);
  if (successful.length === 0) return undefined;

  const workDir = mkdtempSync(join(tmpdir(), "mxm-concat-"));

  // 单段也要混口播，不能直接返回无声音频片段 URL
  if (successful.length === 1 && !script) {
    return successful[0]!.videoUrl;
  }

  const localClips: { path: string; duration: number; clipId: string }[] = [];

  for (let i = 0; i < successful.length; i++) {
    const item = successful[i]!;
    const url = item.videoUrl!;
    const path = await downloadToWorkFile(
      url,
      workDir,
      `clip-${String(i).padStart(3, "0")}.mp4`
    );

    let duration = 5;
    if (script) {
      for (const track of script.project.timeline.tracks) {
        const clip = track.clips.find((c) => c.id === item.clipId);
        if (clip) {
          duration = clip.duration;
          break;
        }
      }
    }
    localClips.push({ path, duration, clipId: item.clipId });
  }

  const videoOutPath = join(workDir, "final-video.mp4");

  if (localClips.length === 1) {
    const { copyFileSync } = await import("node:fs");
    copyFileSync(localClips[0]!.path, videoOutPath);
  } else {
    const useXfade =
      applyTransitions === true &&
      script &&
      (readVisualTransitions(script).length > 0 || localClips.length > 1);

    if (useXfade && script) {
      const transitionMap = new Map<string, { type: string; durationSeconds: number }>();
      for (const tr of readVisualTransitions(script)) {
        transitionMap.set(`${tr.clipAId}->${tr.clipBId}`, tr);
      }
      const transitions = localClips.slice(0, -1).map((c, idx) => {
        const next = localClips[idx + 1]!;
        const key = `${c.clipId}->${next.clipId}`;
        return (
          transitionMap.get(key) ?? {
            type: "crossfade",
            durationSeconds: 0.5,
          }
        );
      });
      await concatMp4WithXfade(
        localClips.map((c) => ({ path: c.path, duration: c.duration })),
        transitions,
        videoOutPath
      );
    } else {
      await concatMp4Files(
        localClips.map((c) => c.path),
        videoOutPath
      );
    }
  }

  const finalPath = await muxScriptAudioIfPresent({
    videoPath: videoOutPath,
    script,
    workDir,
    userId,
  });

  const uploaded = await persistLocalFileToStorage({
    localPath: finalPath,
    userId,
    parentTaskId,
    clipId: "final",
    ext: "mp4",
    contentType: "video/mp4",
  });

  return uploaded.url;
}

export function buildConcatListFile(clips: { filePath: string; duration: number }[]): string {
  return clips
    .map((c) => `file '${c.filePath}'\nduration ${c.duration.toFixed(3)}`)
    .join("\n");
}
