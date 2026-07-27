/**
 * 视频任务参数：不再按 Sora 模式归一化时长，由业务 formSchema / 请求体传入，Provider 自行校验。
 */

export type VideoOrientation = 'landscape' | 'portrait';

/** 与分镜 StoryboardChunkSeconds 对齐的通用默认可选时长（无 DB 模板时的 fallback） */
export const DEFAULT_VIDEO_DURATION_OPTIONS = [4, 5, 8, 10, 12, 15] as const;

export function coerceVideoDuration(
  value: number | string | undefined,
  fallback = 8,
): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

export function getBestSize(
  orientation: VideoOrientation | undefined,
  explicitSize?: string,
): string {
  if (explicitSize && String(explicitSize).trim()) return String(explicitSize).trim();
  return orientation === 'portrait' ? '720x1280' : '1280x720';
}

export function buildVideoChunkTaskParams(opts: {
  prompt: string;
  chunk_seconds?: number | string;
  seconds?: number | string;
  duration?: number | string;
  orientation?: VideoOrientation;
  size?: string;
  resolution?: string;
  ratio?: string;
  input_reference?: string;
  reference_image_url?: string;
  reference_images?: string[];
  generate_audio?: boolean;
  parameters?: Record<string, unknown>;
  label?: string;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const sec = coerceVideoDuration(
    opts.chunk_seconds ?? opts.seconds ?? opts.duration,
    8,
  );
  const size = getBestSize(opts.orientation, opts.size);
  const inputRef = opts.input_reference ?? opts.reference_image_url;
  const refImages =
    Array.isArray(opts.reference_images) && opts.reference_images.length > 0
      ? opts.reference_images.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : inputRef
        ? [inputRef]
        : undefined;

  const params: Record<string, unknown> = {
    prompt: opts.prompt,
    seconds: String(sec),
    duration: sec,
    total_duration_seconds: sec,
    size,
    ...(opts.resolution ? { resolution: opts.resolution } : {}),
    ...(opts.ratio ? { ratio: opts.ratio } : {}),
    ...(inputRef ? { input_reference: inputRef } : {}),
    ...(refImages ? { reference_images: refImages } : {}),
    ...(opts.generate_audio != null ? { generate_audio: opts.generate_audio } : {}),
    ...(opts.parameters && typeof opts.parameters === 'object' ? { parameters: opts.parameters } : {}),
    ...(opts.label ? { label: opts.label } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  return params;
}

export function extractDurationOptionsFromFormSchema(
  formSchema: Record<string, unknown> | undefined,
): number[] | null {
  if (!formSchema || typeof formSchema !== 'object') return null;
  const props = formSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || typeof props !== 'object') return null;

  for (const key of ['seconds', 'chunk_seconds', 'duration', 'total_duration_seconds']) {
    const field = props[key];
    if (!field || typeof field !== 'object') continue;

    if (Array.isArray(field.enum)) {
      const nums = field.enum
        .map((v) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length > 0) return [...new Set(nums)].sort((a, b) => a - b);
    }

    const min = typeof field.minimum === 'number' ? field.minimum : undefined;
    const max = typeof field.maximum === 'number' ? field.maximum : undefined;
    if (min != null && max != null && max <= 60) {
      const candidates = [4, 5, 8, 10, 12, 15, 20, 25, 30];
      const inRange = candidates.filter((n) => n >= min && n <= max);
      if (inRange.length > 0) return inRange;
    }
  }

  return null;
}
