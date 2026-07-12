/**
 * 视频拼接引擎 — ffmpeg concat
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClipDispatchResult, MxmClipMetadata, MxmRenderMode, VideoEditScript } from "./types";
import { concatMp4Files, concatMp4WithXfade } from "./ffmpeg-runner";
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
    if (track.type !== 'video') continue;
    for (const tr of track.transitions ?? []) {
      out.push({
        clipAId: tr.clipAId,
        clipBId: tr.clipBId,
        type: String(tr.type ?? 'crossfade'),
        durationSeconds: Number(tr.duration ?? 0.5),
      });
    }
  }
  return out;
}

export async function concatClipsToFinal(input: ConcatInput): Promise<string | undefined> {
  const { clips, userId, parentTaskId, script, applyTransitions } = input;
  const successful = clips.filter((c) => c.videoUrl);
  if (successful.length === 0) return undefined;
  if (successful.length === 1) return successful[0]!.videoUrl;

  const workDir = mkdtempSync(join(tmpdir(), "mxm-concat-"));
  const localClips: { path: string; duration: number; clipId: string }[] = [];

  for (let i = 0; i < successful.length; i++) {
    const item = successful[i]!;
    const url = item.videoUrl!;
    const buf = await fetchMediaBuffer(url);
    const path = join(workDir, `clip-${String(i).padStart(3, "0")}.mp4`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, buf);

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

  const outPath = join(workDir, "final.mp4");

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
          type: 'crossfade',
          durationSeconds: 0.5,
        }
      );
    });
    await concatMp4WithXfade(
      localClips.map((c) => ({ path: c.path, duration: c.duration })),
      transitions,
      outPath
    );
  } else {
    await concatMp4Files(
      localClips.map((c) => c.path),
      outPath
    );
  }

  const uploaded = await persistLocalFileToStorage({
    localPath: outPath,
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
