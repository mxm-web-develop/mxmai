/**
 * Task V2 audio scope：将表单字段整理为 Maxplan / t2a_v2 可消费的 parameters
 */

/** 播报风格 → 默认语速（可被 params.speed 显式覆盖） */
export const BROADCAST_STYLE_SPEED: Record<string, number> = {
  fast_talk: 1.4,
  news: 1.3,
  chat_show: 1.2,
  late_night: 1.0,
};

export function resolveSpeedFromBroadcastStyle(params: Record<string, unknown>): number {
  const speedRaw = params.speed ?? (params.voice_setting as { speed?: number } | undefined)?.speed;
  if (typeof speedRaw === 'number' && Number.isFinite(speedRaw)) {
    return Math.min(2, Math.max(0.5, speedRaw));
  }
  const style = typeof params.broadcast_style === 'string' ? params.broadcast_style.trim() : '';
  const mapped = style ? BROADCAST_STYLE_SPEED[style] : undefined;
  if (typeof mapped === 'number') return mapped;
  return 1;
}

export function resolveVoiceIdFromParams(params: Record<string, unknown>): string {
  const voice = params.voice;
  if (voice && typeof voice === 'object' && !Array.isArray(voice)) {
    const vid = (voice as { voice_id?: string }).voice_id;
    if (typeof vid === 'string' && vid.trim()) return vid.trim();
  }
  return (
    (typeof params.voice_id === 'string' && params.voice_id.trim()) ||
    (params.voice_setting as { voice_id?: string } | undefined)?.voice_id ||
    'female-shaonv'
  );
}

/** 将 minimaxVoice 对象扁平化为 voice_id，供管线模板使用 */
export function normalizeAudioVoiceParams(params: Record<string, unknown>): Record<string, unknown> {
  const voiceId = resolveVoiceIdFromParams(params);
  const speed = resolveSpeedFromBroadcastStyle(params);
  return { ...params, voice_id: voiceId, speed };
}

export function resolveAudioPhysicalModel(
  routedModel: string,
  _params: Record<string, unknown>,
): string {
  return routedModel;
}

/** 口播成片默认首尾留白（秒），避免起止过陡 */
export const TTS_EDGE_PAUSE_SECONDS = 0.8;

const LEADING_PAUSE_RE = /^(<#(\d+(?:\.\d+)?)#>)(\s*)/;
const TRAILING_PAUSE_RE = /(\s*)(<#(\d+(?:\.\d+)?)#>)$/;

function formatPauseSeconds(seconds: number): string {
  const n = Math.round(seconds * 100) / 100;
  return Number.isInteger(n) ? String(n) : String(n);
}

/** 读取 TTS 文本首尾 `<#秒#>` 停顿（毫秒）；无则 0 */
export function extractTtsEdgePauseMs(text: string): { leadMs: number; trailMs: number } {
  const t = String(text ?? '').trim();
  if (!t) return { leadMs: 0, trailMs: 0 };
  const lead = t.match(LEADING_PAUSE_RE);
  const trail = t.match(TRAILING_PAUSE_RE);
  const leadSec = lead ? Number(lead[2]) : NaN;
  const trailSec = trail ? Number(trail[3]) : NaN;
  return {
    leadMs: Number.isFinite(leadSec) ? Math.max(0, Math.round(leadSec * 1000)) : 0,
    trailMs: Number.isFinite(trailSec) ? Math.max(0, Math.round(trailSec * 1000)) : 0,
  };
}

/**
 * 保证合成文本首尾各有至少 `seconds` 秒停顿标签（默认 0.8）。
 * 已有更长首/尾停顿则保留；更短则抬到目标值；幂等、不叠两个相邻停顿标签。
 */
export function ensureTtsEdgePauses(
  text: string,
  seconds: number = TTS_EDGE_PAUSE_SECONDS,
): string {
  let t = text.trim();
  if (!t) return t;
  const tag = `<#${formatPauseSeconds(seconds)}#>`;

  const lead = t.match(LEADING_PAUSE_RE);
  if (lead) {
    const existing = Number(lead[2]);
    if (Number.isFinite(existing) && existing + 1e-9 >= seconds) {
      // 已够长，只规范化紧跟空白
      t = `${lead[1]}${t.slice(lead[0].length)}`;
    } else {
      t = `${tag}${t.slice(lead[0].length)}`;
    }
  } else {
    t = `${tag}${t}`;
  }

  const trail = t.match(TRAILING_PAUSE_RE);
  if (trail) {
    const existing = Number(trail[3]);
    if (Number.isFinite(existing) && existing + 1e-9 >= seconds) {
      t = `${t.slice(0, t.length - trail[0].length)}${trail[2]}`;
    } else {
      t = `${t.slice(0, t.length - trail[0].length)}${tag}`;
    }
  } else {
    t = `${t}${tag}`;
  }

  return t;
}

/** TTS 正文：顶层 prompt / parameters.text 优先于 params 内嵌字段（列表 summary 会截断嵌套 prompt） */
export function resolveTtsInputText(params: Record<string, unknown>): string {
  const nested = params.params as Record<string, unknown> | undefined;
  const parameters = params.parameters as Record<string, unknown> | undefined;
  const candidates = [params.prompt, parameters?.text, nested?.prompt, nested?.text];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return ensureTtsEdgePauses(c.trim());
  }
  return '';
}

export function buildAudioTtsParameters(
  params: Record<string, unknown>,
  ttsText: string,
): Record<string, unknown> {
  const voiceId = resolveVoiceIdFromParams(params);
  const speed = resolveSpeedFromBroadcastStyle(params);
  const text = ensureTtsEdgePauses(ttsText);

  const emotionRaw =
    typeof params.emotion === 'string' && params.emotion.trim() ? params.emotion.trim() : undefined;
  // MiniMax 2.8 默认 auto（由文本推断）；口播管线统一不传 emotion，避免与 markup 标签冲突
  const emotion =
    emotionRaw && emotionRaw !== 'auto' && emotionRaw !== 'neutral' ? emotionRaw : undefined;

  const voiceSetting: Record<string, unknown> = {
    voice_id: voiceId,
    speed,
    vol: 1,
    pitch: 0,
    ...(emotion ? { emotion } : {}),
  };

  const audioSetting =
    (params.audio_setting as Record<string, unknown> | undefined) ?? {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    };

  const model = String(
    params.model ?? params.logicalModel ?? params.tts_model ?? ''
  ).trim();
  const subtitle = resolveTtsSubtitleApiParams(model, params);

  return {
    text,
    voice_setting: voiceSetting,
    audio_setting: audioSetting,
    ...subtitle,
    language_boost:
      typeof params.language_boost === 'string' && params.language_boost.trim()
        ? params.language_boost.trim()
        : 'Chinese',
    output_format: 'hex',
    stream: false,
  };
}

/**
 * MiniMax t2a_v2 字幕：官方文档明确 speech-2.8-hd/turbo（及 2.6/02/01）均支持
 * `subtitle_enable` + `subtitle_type`（sentence | word | word_streaming）。
 * 历史误判「speech-2.8 拒收 sentence」已撤销；仅当调用方显式 subtitle_enable=false 时关闭。
 */
export function modelSupportsSentenceSubtitles(_model: string): boolean {
  return true;
}

export function resolveTtsSubtitleApiParams(
  model: string,
  params: Record<string, unknown> = {}
): { subtitle_enable: boolean; subtitle_type?: string } {
  const want = params.subtitle_enable !== false;
  if (!want) {
    return { subtitle_enable: false };
  }
  const type =
    typeof params.subtitle_type === 'string' && params.subtitle_type.trim()
      ? params.subtitle_type.trim()
      : 'sentence';
  return { subtitle_enable: true, subtitle_type: type };
}
