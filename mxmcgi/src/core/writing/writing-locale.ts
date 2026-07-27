/**
 * Writing / outline 生成内容的语言指令（与 UI AppLocale 对齐）
 */
import {
  type AppLocale,
  localeOutputInstruction,
  normalizeAppLocale,
} from '@mxmai/mxmdata';

export function normalizeWritingLanguage(raw: string | null | undefined): AppLocale {
  return normalizeAppLocale(raw);
}

/** 前缀到 LLM prompt 的输出语言硬约束 */
export function writingLangInstruction(locale: AppLocale | string): string {
  const lang = normalizeWritingLanguage(typeof locale === 'string' ? locale : locale);
  switch (lang) {
    case 'en':
      return 'Respond entirely in English. Output all content fields in English. Use the same JSON structure when applicable.\n\n';
    case 'zh-TW':
      return '請全部使用繁體中文回覆。所有內容欄位均須為繁體中文。JSON 結構保持不變。\n\n';
    case 'ja':
      return 'すべて日本語で回答してください。すべての内容フィールドは日本語で書いてください。JSON 構造は維持してください。\n\n';
    case 'zh':
    default:
      return '请全部使用简体中文回复。所有内容字段均须为简体中文。JSON 结构保持不变。\n\n';
  }
}

/** 大纲结构等仅有 zh/en 模板时：繁中跟简中模板，日语跟英文模板，再叠加输出语言指令 */
export function writingStructureTemplateLocale(locale: AppLocale): 'zh' | 'en' {
  return locale === 'en' || locale === 'ja' ? 'en' : 'zh';
}

export function writingListJoin(locale: AppLocale): string {
  return locale === 'en' || locale === 'ja' ? ', ' : '、';
}

export { localeOutputInstruction };
