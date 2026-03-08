/**
 * 歌词（lyrics）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const lyricsFormOptionsZh: FormOptionsConfig = {
  musicStyle: [
    { value: 'pop', label: '流行', labelEn: 'Pop' },
    { value: 'rock', label: '摇滚', labelEn: 'Rock' },
    { value: 'ballad', label: '抒情', labelEn: 'Ballad' },
    { value: 'rap', label: '说唱', labelEn: 'Rap' },
    { value: 'folk', label: '民谣', labelEn: 'Folk' },
  ],
  emotion: [
    { value: 'happy', label: '快乐', labelEn: 'Happy' },
    { value: 'sad', label: '悲伤', labelEn: 'Sad' },
    { value: 'romantic', label: '浪漫', labelEn: 'Romantic' },
    { value: 'energetic', label: '激昂', labelEn: 'Energetic' },
    { value: 'nostalgic', label: '怀旧', labelEn: 'Nostalgic' },
  ],
  rhyme: [
    { value: 'full', label: '全押韵', labelEn: 'Full Rhyme' },
    { value: 'half', label: '半押韵', labelEn: 'Half Rhyme' },
    { value: 'internal', label: '内押韵', labelEn: 'Internal Rhyme' },
    { value: 'free', label: '自由韵', labelEn: 'Free Verse' },
  ],
  length: [
    { value: 'short', label: '短篇（2-3分钟）', labelEn: 'Short (2-3 min)' },
    { value: 'medium', label: '中篇（3-5分钟）', labelEn: 'Medium (3-5 min)' },
    { value: 'long', label: '长篇（5分钟以上）', labelEn: 'Long (5+ min)' },
  ],
  format: [
    { value: 'default', label: '默认格式（Markdown）', labelEn: 'Default (Markdown)' },
    { value: 'suno', label: 'Suno AI 格式（纯文本）', labelEn: 'Suno AI Format (Plain Text)' },
  ],
  _metadata: {
    musicStyle: { type: 'select', label: '音乐风格', labelEn: 'Music Style', helpText: '选择歌词的音乐风格', helpTextEn: 'Select the music style' },
    emotion: { type: 'select', label: '情感', labelEn: 'Emotion', helpText: '选择歌词要表达的情感', helpTextEn: 'Select the emotion to express' },
    rhyme: { type: 'select', label: '押韵', labelEn: 'Rhyme', helpText: '选择押韵方式', helpTextEn: 'Select the rhyme style' },
    length: { type: 'select', label: '长度', labelEn: 'Length', helpText: '选择歌词长度', helpTextEn: 'Select the length' },
    format: { type: 'select', label: '格式', labelEn: 'Format', helpText: '选择歌词输出格式', helpTextEn: 'Select the output format' },
    theme: {
      type: 'textarea',
      label: '主题内容',
      labelEn: 'Theme',
      placeholder: '描述歌词要表达的主题和情感...',
      placeholderEn: 'Describe the theme and emotion of the lyrics...',
      helpText: '歌词要表达的核心主题和情感',
      helpTextEn: 'The core theme and emotion to express',
    },
  },
};

const asOpts = (arr: FormOption[] | undefined) =>
  (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));

export function getLyricsFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const m = lyricsFormOptionsZh._metadata!;
    return {
      musicStyle: asOpts(lyricsFormOptionsZh.musicStyle as FormOption[]),
      emotion: asOpts(lyricsFormOptionsZh.emotion as FormOption[]),
      rhyme: asOpts(lyricsFormOptionsZh.rhyme as FormOption[]),
      length: asOpts(lyricsFormOptionsZh.length as FormOption[]),
      format: asOpts(lyricsFormOptionsZh.format as FormOption[]),
      _metadata: {
        musicStyle: { ...m.musicStyle, label: m.musicStyle.labelEn || 'Music Style', helpText: m.musicStyle.helpTextEn },
        emotion: { ...m.emotion, label: m.emotion.labelEn || 'Emotion', helpText: m.emotion.helpTextEn },
        rhyme: { ...m.rhyme, label: m.rhyme.labelEn || 'Rhyme', helpText: m.rhyme.helpTextEn },
        length: { ...m.length, label: m.length.labelEn || 'Length', helpText: m.length.helpTextEn },
        format: { ...m.format, label: m.format.labelEn || 'Format', helpText: m.format.helpTextEn },
        theme: { ...m.theme, label: m.theme.labelEn || 'Theme', placeholder: m.theme.placeholderEn, helpText: m.theme.helpTextEn },
      },
    };
  }
  return lyricsFormOptionsZh;
}
