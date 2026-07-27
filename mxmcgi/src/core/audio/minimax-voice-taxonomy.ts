import type { MinimaxVoiceItem } from './maxplan-voice-service';

export type VoiceGender = 'male' | 'female' | 'other';
export type VoiceLanguage = 'zh' | 'en' | 'other';

export type EnrichedMinimaxVoiceItem = MinimaxVoiceItem & {
  gender: VoiceGender;
  language: VoiceLanguage;
};

const ENGLISH_STANDALONE_IDS = new Set([
  'santa_claus',
  'grinch',
  'rudolph',
  'arnold',
  'charming_santa',
  'charming_lady',
  'sweet_girl',
  'cute_elf',
  'attractive_girl',
  'serene_woman',
  'arrogant_miss',
  'robot_armor',
]);

const ZH_PINYIN_SLUGS = new Set([
  'clever_boy',
  'cute_boy',
  'lovely_girl',
  'cartoon_pig',
  'bingjiao_didi',
  'junlang_nanyou',
  'chunzhen_xuedi',
  'lengdan_xiongzhang',
  'badao_shaoye',
  'tianxin_xiaoling',
  'qiaopi_mengmei',
  'wumei_yujie',
  'diadia_xuemei',
  'danya_xuejie',
  'presenter_male',
  'presenter_female',
  'audiobook_male_1',
  'audiobook_male_2',
  'audiobook_female_1',
  'audiobook_female_2',
]);

const OTHER_LANGUAGE_PREFIXES = [
  'japanese_',
  'korean_',
  'spanish_',
  'french_',
  'german_',
  'italian_',
  'portuguese_',
  'arabic_',
  'russian_',
  'hindi_',
  'thai_',
  'vietnamese_',
  'indonesian_',
  'turkish_',
  'polish_',
  'dutch_',
  'swedish_',
  'norwegian_',
  'danish_',
  'finnish_',
  'czech_',
  'romanian_',
  'hungarian_',
  'hebrew_',
  'ukrainian_',
  'malay_',
  'filipino_',
  'bengali_',
  'tamil_',
  'telugu_',
  'marathi_',
  'gujarati_',
  'kannada_',
  'malayalam_',
  'punjabi_',
  'urdu_',
];

/** 产品目录隐藏的小语种（韩语/西语/葡语等），other 仅保留日语 */
const HIDDEN_CATALOG_LANGUAGE_PREFIXES = OTHER_LANGUAGE_PREFIXES.filter((p) => p !== 'japanese_');

const OTHER_GENDER_IDS = new Set(['cartoon_pig', 'robot_armor', 'grinch', 'rudolph']);

function haystack(voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>): string {
  return [voice.voice_id, voice.voice_name, ...voice.description].join(' ').toLowerCase();
}

export function classifyVoiceLanguage(
  voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>,
): VoiceLanguage {
  const id = voice.voice_id.trim();
  const idLower = id.toLowerCase();
  const text = haystack(voice);

  if (
    id.startsWith('Chinese (Mandarin)_') ||
    id.startsWith('Cantonese_') ||
    idLower.startsWith('male-') ||
    idLower.startsWith('female-') ||
    ZH_PINYIN_SLUGS.has(idLower)
  ) {
    return 'zh';
  }

  if (id.startsWith('English_') || ENGLISH_STANDALONE_IDS.has(idLower)) {
    return 'en';
  }

  if (OTHER_LANGUAGE_PREFIXES.some((prefix) => idLower.startsWith(prefix))) {
    return 'other';
  }

  if (/[\u4e00-\u9fff]/.test(voice.voice_name)) {
    return 'zh';
  }

  if (/^[a-z0-9_ ()-]+$/i.test(id) && /[a-z]/i.test(id) && !id.includes('(')) {
    const asciiName = voice.voice_name.replace(/[^\x00-\x7F]/g, '').trim();
    if (asciiName.length >= 3 && !/[\u4e00-\u9fff]/.test(voice.voice_name)) {
      return 'en';
    }
  }

  if (/\benglish\b/i.test(text)) return 'en';
  if (/\bchinese\b|\bmandarin\b|\bcantonese\b|中文|普通话|粤语/i.test(text)) return 'zh';

  return 'other';
}

export function classifyVoiceGender(
  voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>,
): VoiceGender {
  const idLower = voice.voice_id.trim().toLowerCase();
  const text = haystack(voice);

  if (OTHER_GENDER_IDS.has(idLower)) return 'other';

  if (idLower.startsWith('male-') || idLower.startsWith('male_')) return 'male';
  if (idLower.startsWith('female-') || idLower.startsWith('female_')) return 'female';

  const maleSlugs = [
    'presenter_male',
    'audiobook_male_1',
    'audiobook_male_2',
    'clever_boy',
    'cute_boy',
    'bingjiao_didi',
    'junlang_nanyou',
    'chunzhen_xuedi',
    'lengdan_xiongzhang',
    'badao_shaoye',
  ];
  if (maleSlugs.includes(idLower)) return 'male';

  const femaleSlugs = [
    'presenter_female',
    'audiobook_female_1',
    'audiobook_female_2',
    'lovely_girl',
    'tianxin_xiaoling',
    'qiaopi_mengmei',
    'wumei_yujie',
    'diadia_xuemei',
    'danya_xuejie',
  ];
  if (femaleSlugs.includes(idLower)) return 'female';

  const malePatterns =
    /\b(male|man|boy|gentleman|executive|announcer|host\b|bloke|knight|butler|youth|senior|elder|warrior|soldier|mentor|comedian|debator|narrator|scholar|manager|leader|partner|husband|father|son|brother|uncle|grandpa|santa claus|arnold|grinch|rudolph)\b|_man\b|_boy\b|_male\b|_executive\b|_gentleman\b|_youth\b|_announcer\b|_host\b/i;
  const femalePatterns =
    /\b(female|woman|lady|girl|miss|antie|aunt|bestie|princess|queen|maiden|sister|wife|girlfriend|hostess|mother|daughter|grandma|elf\b|sprite)\b|_woman\b|_lady\b|_girl\b|_female\b|_miss\b|_antie\b|_bestie\b|_princess\b|_queen\b|_maiden\b|_sister\b|_wife\b|_hostess\b/i;

  const maleHit = malePatterns.test(text);
  const femaleHit = femalePatterns.test(text);
  if (maleHit && !femaleHit) return 'male';
  if (femaleHit && !maleHit) return 'female';

  if (/\(m\)|（m）/i.test(voice.voice_id)) return 'male';
  if (/\(f\)|（f）/i.test(voice.voice_id)) return 'female';

  return 'other';
}

export function isJapaneseVoice(
  voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>,
): boolean {
  return voice.voice_id.trim().toLowerCase().startsWith('japanese_');
}

function isHiddenCatalogLanguage(
  voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>,
): boolean {
  const idLower = voice.voice_id.trim().toLowerCase();
  return HIDDEN_CATALOG_LANGUAGE_PREFIXES.some((prefix) => idLower.startsWith(prefix));
}

/** 中英文 + 日语（other）对外展示；韩语/西语/葡语等小语种隐藏 */
export function isCatalogVisibleVoice(
  voice: Pick<MinimaxVoiceItem, 'voice_id' | 'voice_name' | 'description'>,
): boolean {
  if (isHiddenCatalogLanguage(voice)) return false;
  const language = classifyVoiceLanguage(voice);
  if (language === 'zh' || language === 'en') return true;
  if (language === 'other') return isJapaneseVoice(voice);
  return false;
}

export function enrichMinimaxVoice(voice: MinimaxVoiceItem): EnrichedMinimaxVoiceItem {
  return {
    voice_id: voice.voice_id,
    voice_name: voice.voice_name,
    source: voice.source,
    gender: classifyVoiceGender(voice),
    language: classifyVoiceLanguage(voice),
  };
}
