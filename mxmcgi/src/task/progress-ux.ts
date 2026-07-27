/**
 * 进度人话字段落在 metadata.progressUx（cgi_tasks 无独立列）。
 * 读写 Task 时 hydrate 到 progress.message / phase*。
 */

import type { TaskProgress } from './types';

export type ProgressUxFields = {
  message?: string;
  phase?: string;
  phaseIndex?: number;
  phaseTotal?: number;
};

export function pickProgressUx(progress: Partial<TaskProgress> | undefined): ProgressUxFields | null {
  if (!progress) return null;
  const out: ProgressUxFields = {};
  if (typeof progress.message === 'string' && progress.message.trim()) {
    out.message = progress.message.trim();
  }
  if (typeof progress.phase === 'string' && progress.phase.trim()) {
    out.phase = progress.phase.trim();
  }
  if (typeof progress.phaseIndex === 'number' && Number.isFinite(progress.phaseIndex)) {
    out.phaseIndex = progress.phaseIndex;
  }
  if (typeof progress.phaseTotal === 'number' && Number.isFinite(progress.phaseTotal)) {
    out.phaseTotal = progress.phaseTotal;
  }
  return Object.keys(out).length ? out : null;
}

export function readProgressUxFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): ProgressUxFields | null {
  const raw = metadata?.progressUx;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return pickProgressUx(raw as Partial<TaskProgress>);
}

/** 把 metadata.progressUx 合并进 progress（DB 读出后） */
export function hydrateProgressFromMetadata(
  progress: TaskProgress,
  metadata: Record<string, unknown> | null | undefined
): TaskProgress {
  const ux = readProgressUxFromMetadata(metadata);
  if (!ux) return progress;
  return { ...progress, ...ux };
}

/** 合并写入 metadata.progressUx；无 UX 字段时返回原 metadata */
export function mergeMetadataWithProgressUx(
  metadata: Record<string, unknown> | null | undefined,
  progress: Partial<TaskProgress> | undefined
): Record<string, unknown> | undefined {
  const ux = pickProgressUx(progress);
  if (!ux) return metadata ?? undefined;
  const base = { ...(metadata ?? {}) };
  const prev =
    base.progressUx && typeof base.progressUx === 'object' && !Array.isArray(base.progressUx)
      ? (base.progressUx as Record<string, unknown>)
      : {};
  base.progressUx = { ...prev, ...ux };
  return base;
}
