/**
 * 口播主播人设：角色卡本地拼装；系统音色走 LLM（previewVoicePersonaSketch）。
 * 不暴露内部字段名；产出为人话短文（性格 / 语气词 / 口头语）。
 */

function asPlainString(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    const v = (raw as { value?: unknown }).value;
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 从角色卡 character 摘要拼主播人设；无可用信息则空串 */
export function personaFromCharacterSummary(
  character: Record<string, unknown> | null | undefined
): string {
  if (!character) return '';
  const speech = asPlainString(character.speech_style);
  const personality = asPlainString(character.personality);
  const background = asPlainString(character.background);
  const brief =
    asPlainString(character.character_brief) || asPlainString(character.description);
  const name =
    asPlainString(character.display_name) || asPlainString(character.name);

  const parts: string[] = [];
  if (name) parts.push(`主播：${name}`);
  if (personality) parts.push(`性格：${clip(personality, 160)}`);
  else if (brief) parts.push(`性格：${clip(brief, 160)}`);
  if (speech) parts.push(`说话风格：${clip(speech, 160)}`);
  if (background && !brief) parts.push(`背景：${clip(background, 80)}`);
  else if (background && brief && !personality) {
    parts.push(`背景：${clip(background, 80)}`);
  }

  if (speech && /(语气|口头|口头禅|常说|习惯说)/.test(speech) === false) {
    parts.push('常用语气词与口头语：按内容情绪与节奏择位点缀，勿句首硬塞、勿每句都加');
  }

  return parts.join('\n').trim();
}

const VAGUE_LABEL_RE =
  /^(voice|音色|克隆|clone|custom|default|默认|speaker|spk)[\s_-]*\d*$/i;

/** 中英 label 是否足够「有人设」可交给 LLM；过糊则应留空 */
export function isDescriptiveVoiceLabel(label: string, descriptions?: string[]): boolean {
  const name = label.trim();
  if (!name || name.length < 2) return false;
  if (VAGUE_LABEL_RE.test(name)) return false;
  const hay = [name, ...(descriptions ?? [])].join(' ');
  const hasRoleCue =
    /少女|少年|青年|中年|大叔|阿姨|萝莉|御姐|青涩|霸道|温柔|成熟|甜美|沉稳|知性|活泼|冷酷|傲娇|病娇|精英|播音|主持|新闻|电台|女孩|男孩|lady|girl|boy|woman|man|santa|elf|queen|king|sweet|cute|arrogant|serene|charming|robot|男|女|童|老/i.test(
      hay
    );
  const hasZhRoleName = /[\u4e00-\u9fff]{2,}/.test(name) && !/^中文|英文|日语/.test(name);
  // 有官方描述也值得让模型读
  const hasDesc = (descriptions ?? []).some((d) => String(d ?? '').trim().length >= 4);
  return hasRoleCue || hasZhRoleName || hasDesc;
}

export type VoicePersonaSource =
  | { kind: 'character'; character: Record<string, unknown> }
  | { kind: 'system'; label: string; descriptions?: string[]; voiceId?: string }
  | { kind: 'clear' };

/**
 * 同步入口：仅角色卡 / 清空。
 * 系统音色不再本地关键词脑补——请用 `resolveHostPersonaAsync`。
 */
export function resolveHostPersona(source: VoicePersonaSource): string {
  if (source.kind === 'clear') return '';
  if (source.kind === 'character') return personaFromCharacterSummary(source.character);
  return '';
}

/** @deprecated 系统音色请走 LLM；保留空实现以免旧调用崩 */
export function personaSketchFromSystemVoice(
  label: string,
  descriptions?: string[]
): string {
  void label;
  void descriptions;
  return '';
}
