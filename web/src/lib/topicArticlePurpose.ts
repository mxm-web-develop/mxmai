/**
 * 话题写作：用途由类别方向推导；篇幅/结构按 purpose 过滤（与 mxmcgi topic-article-purpose 对齐）
 */
import purposeJson from './topicArticlePurpose.json';

type I18nText = { zh?: string; 'zh-TW'?: string; en?: string; ja?: string };

function pickI18n(obj: I18nText | undefined, lang?: string): string {
  if (!obj) return '';
  const l = String(lang || 'zh').trim();
  if (l === 'zh-TW') return obj['zh-TW'] || obj.zh || obj.en || '';
  if (l === 'en') return obj.en || obj.zh || '';
  if (l === 'ja') return obj.ja || obj.en || obj.zh || '';
  return obj.zh || obj.en || '';
}

export function purposeForVoiceCategory(voiceCategory: string): string {
  switch (String(voiceCategory || '').trim()) {
    case 'talk_brief':
      return 'talk_show_brief';
    case 'voiceover_brief':
      return 'voiceover_brief';
    case 'course_tutorial':
      return 'course_tutorial';
    case 'finance_narrative':
    case 'political_report':
      return 'investigative';
    case 'fanqie_web':
      return 'fiction_short';
    case 'hongguo_drama':
      return 'drama_beat';
    default:
      return 'publish_article';
  }
}

type PurposeDef = {
  id: string;
  lengths: Array<{ id: string; label: I18nText }>;
  structures: Array<{ id: string; title: I18nText; beats?: string[] }>;
};

const purposes = (purposeJson as { purposes: PurposeDef[] }).purposes || [];

function getPurpose(id: string): PurposeDef | undefined {
  return purposes.find((p) => p.id === id);
}

/** 篇幅选项：随类别推导的 purpose 过滤 */
export function lengthsForVoiceCategory(
  voiceCategory: string,
  lang?: string
): { enum: string[]; labels: string[] } {
  const purpose = purposeForVoiceCategory(voiceCategory);
  const p = getPurpose(purpose) || getPurpose('publish_article');
  const rows = p?.lengths?.length ? p.lengths : [{ id: 'standard', label: { zh: '标准档' } }];
  return {
    enum: rows.map((r) => r.id),
    labels: rows.map((r) => pickI18n(r.label, lang) || r.id),
  };
}

/** 结构选项：随类别推导的 purpose 过滤（避免网文点到谈话结构） */
export function structuresForVoiceCategory(
  voiceCategory: string,
  lang?: string
): { enum: string[]; labels: string[] } {
  const purpose = purposeForVoiceCategory(voiceCategory);
  const p = getPurpose(purpose) || getPurpose('publish_article');
  const rows = p?.structures || [];
  return {
    enum: rows.map((r) => r.id),
    labels: rows.map((r) => pickI18n(r.title, lang) || r.id),
  };
}
