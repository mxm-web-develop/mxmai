/**
 * 业务估价「中间档」用量启发式（纯函数，无 DB）。
 * TTS 等需再结合 provider_pricing.charge_mode 选用本文件规则。
 */

export type UsageEstimate = {
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedImageCount?: number;
  estimatedAudioSeconds?: number;
  estimatedVideoSeconds?: number;
  estimatedRequestCount?: number;
};

/** 中文约 4 字/秒 — 中间档语速 */
export const CHARS_PER_SECOND_MID = 4;

function collectTextCorpus(params: Record<string, unknown>): string {
  const keys = [
    'prompt',
    'script',
    'ttsText',
    'text',
    'content',
    'source_material',
    'product_description',
    'brand_name',
    'supplement',
    'topic',
  ];
  const parts: string[] = [];
  for (const k of keys) {
    const v = params[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  if (parts.length === 0) {
    for (const v of Object.values(params)) {
      if (typeof v === 'string' && v.length > 40) parts.push(v);
    }
  }
  return parts.join('\n');
}

/** 中间档文本量：有用户稿则用稿长；否则默认中位字数 */
export function midTextChars(params: Record<string, unknown>, fallback = 800): number {
  const corpus = collectTextCorpus(params);
  if (corpus.length >= 20) return corpus.length;
  const hint = Number(params.total_textcount || params.maxTokens || 0);
  if (hint > 0) return Math.round(hint * 0.75);
  return fallback;
}

export function midDurationSeconds(params: Record<string, unknown>, fallback = 45): number {
  const durRaw =
    params.audio_duration_seconds ??
    params.total_duration_seconds ??
    params.duration ??
    params.duration_sec ??
    params.seconds;
  const n = Math.max(0, Number(durRaw ?? 0) || 0);
  if (n > 0) return n;
  const chars = midTextChars(params, 0);
  if (chars > 0) return Math.max(8, Math.round(chars / CHARS_PER_SECOND_MID));
  return fallback;
}

/**
 * 按物理模型 charge_mode 生成「中间档」用量。
 * TTS：token_based→字符；per_second_audio→秒；per_request→次。
 */
export function buildUsageEstimateForChargeMode(
  scope: string,
  chargeMode: string | null | undefined,
  params: Record<string, unknown>,
): UsageEstimate {
  const mode = String(chargeMode || '').toLowerCase();
  const parallel = Math.max(1, Math.min(99, Number(params.parallel_count ?? params.n ?? 1) || 1));

  if (scope === 'audio') {
    if (mode === 'token_based') {
      const chars = midTextChars(params, 600);
      return {
        estimatedInputTokens: chars,
        estimatedOutputTokens: 0,
        estimatedTotalTokens: chars,
        estimatedRequestCount: parallel,
      };
    }
    if (mode === 'per_request') {
      return { estimatedRequestCount: parallel };
    }
    return {
      estimatedAudioSeconds: midDurationSeconds(params, 45),
      estimatedRequestCount: parallel,
    };
  }

  if (scope === 'music') {
    if (mode === 'token_based') {
      const chars = midTextChars(params, 200);
      return { estimatedInputTokens: chars, estimatedOutputTokens: 0, estimatedRequestCount: 1 };
    }
    if (mode === 'per_second_audio') {
      return { estimatedAudioSeconds: midDurationSeconds(params, 120), estimatedRequestCount: 1 };
    }
    return { estimatedRequestCount: 1 };
  }

  if (scope === 'writing' || scope === 'outline' || scope === 'text') {
    const outHint = Number(params.total_textcount || 0);
    const outMid = outHint > 0 ? Math.round(outHint * 1.2) : Math.round(midTextChars(params, 900) * 1.1);
    const inMid = Math.max(400, Math.min(2500, Math.round(midTextChars(params, 600) * 0.5) + 400));
    return {
      estimatedInputTokens: inMid,
      estimatedOutputTokens: outMid,
      estimatedRequestCount: 1,
    };
  }

  if (scope === 'graph') {
    // 单次生图张数；勿把「图集 max_items / 生成份数 parallel_count」混进 image_count
    // parallel_count 由前端对总价的期望：若调用方传入，用 requestCount 放大（batch）
    const images = Math.max(
      1,
      Math.min(
        48,
        Number(params.image_count ?? params.n ?? 1) || 1,
      ),
    );
    return { estimatedImageCount: images * parallel, estimatedRequestCount: 1 };
  }

  if (scope === 'video') {
    return {
      estimatedVideoSeconds: midDurationSeconds(params, 30),
      estimatedRequestCount: 1,
    };
  }

  return { estimatedRequestCount: 1 };
}

/** 无 chargeMode 时的 scope 默认（兼容旧调用） */
export function buildUsageEstimate(
  scope: string,
  params: Record<string, unknown>,
): UsageEstimate {
  const defaultMode =
    scope === 'audio' || scope === 'music'
      ? 'per_second_audio'
      : scope === 'graph'
        ? 'per_image'
        : scope === 'video'
          ? 'per_second_video'
          : 'token_based';
  return buildUsageEstimateForChargeMode(scope, defaultMode, params);
}
