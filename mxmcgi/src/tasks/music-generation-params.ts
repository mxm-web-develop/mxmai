/**
 * Task V2 music scope：将表单字段整理为 Maxplan / music_generation 可消费的 parameters
 */

/** 提交前字段归一化（make_instrumental → is_instrumental 等） */
export function normalizeMusicFormParams(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  if (next.make_instrumental === true && next.is_instrumental === undefined) {
    next.is_instrumental = true;
  }
  return next;
}

/** 物理模型由 audio_scope_config 路由决定，表单不可覆盖 */
export function resolveMusicPhysicalModel(
  routedModel: string,
  _params: Record<string, unknown>,
): string {
  return routedModel;
}

export function buildMusicGenerationParameters(
  params: Record<string, unknown>,
  finalPrompt: string,
): Record<string, unknown> {
  const lyricsRaw = params.lyrics;
  const lyrics = typeof lyricsRaw === 'string' && lyricsRaw.trim() ? lyricsRaw.trim() : '';

  const isInstrumental = Boolean(
    params.is_instrumental ?? params.make_instrumental ?? false,
  );

  let prompt = String(finalPrompt ?? '').trim();
  if (!prompt) {
    prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  }

  // prompt 承载曲风/情绪等音乐描述；若为空则从表单字段拼装（无论是否已有 lyrics）
  if (!prompt) {
    const parts: string[] = [];
    const title = typeof params.title === 'string' ? params.title.trim() : '';
    if (title) parts.push(`标题：${title}`);
    const tags = params.tags;
    if (typeof tags === 'string' && tags.trim()) {
      parts.push(`风格标签：${tags.trim()}`);
    } else if (Array.isArray(tags) && tags.length > 0) {
      parts.push(`风格标签：${tags.map(String).join(', ')}`);
    }
    const style = typeof params.music_style === 'string' ? params.music_style.trim() : '';
    if (style) parts.push(`音乐风格：${style}`);
    const supplement = typeof params.supplement === 'string' ? params.supplement.trim() : '';
    if (supplement) parts.push(`补充：${supplement}`);
    prompt = parts.join('\n').trim();
  }

  const audioSetting =
    (params.audio_setting as Record<string, unknown> | undefined) ?? {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    };

  const out: Record<string, unknown> = {
    is_instrumental: isInstrumental,
    audio_setting: audioSetting,
    output_format: 'url',
  };
  if (prompt) out.prompt = prompt;
  if (lyrics) out.lyrics = lyrics;
  return out;
}
