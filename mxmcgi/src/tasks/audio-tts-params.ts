/**
 * Task V2 audio scope：将表单字段整理为 Maxplan / t2a_v2 可消费的 parameters
 */

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
  return { ...params, voice_id: voiceId };
}

export function resolveAudioPhysicalModel(
  routedModel: string,
  _params: Record<string, unknown>,
): string {
  return routedModel;
}

/** TTS 正文：顶层 prompt / parameters.text 优先于 params 内嵌字段（列表 summary 会截断嵌套 prompt） */
export function resolveTtsInputText(params: Record<string, unknown>): string {
  const nested = params.params as Record<string, unknown> | undefined;
  const parameters = params.parameters as Record<string, unknown> | undefined;
  const candidates = [params.prompt, parameters?.text, nested?.prompt, nested?.text];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

export function buildAudioTtsParameters(
  params: Record<string, unknown>,
  ttsText: string,
): Record<string, unknown> {
  const voiceId = resolveVoiceIdFromParams(params);

  const speedRaw = params.speed ?? (params.voice_setting as { speed?: number } | undefined)?.speed;
  let speed = typeof speedRaw === 'number' && Number.isFinite(speedRaw) ? speedRaw : 1;
  speed = Math.min(2, Math.max(0.5, speed));

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

  const subtitleEnable = params.subtitle_enable !== false;

  return {
    text: ttsText,
    voice_setting: voiceSetting,
    audio_setting: audioSetting,
    subtitle_enable: subtitleEnable,
    subtitle_type:
      typeof params.subtitle_type === 'string' && params.subtitle_type.trim()
        ? params.subtitle_type.trim()
        : 'sentence',
    language_boost:
      typeof params.language_boost === 'string' && params.language_boost.trim()
        ? params.language_boost.trim()
        : 'Chinese',
    output_format: 'hex',
    stream: false,
  };
}
