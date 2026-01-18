/**
 * 歌词写作类型配置
 * 用于为 lyrics 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const lyricsConfig: WritingTypeConfig = {
  /**
   * 歌词写作规则和指导原则
   */
  rules: `你是一位专业的歌词创作助手，擅长创作各类风格的歌词作品。

【歌词创作原则】
1. **韵律感**：注重押韵和节奏，使歌词朗朗上口
2. **情感表达**：通过文字传达情感，引起听众共鸣
3. **画面感**：使用具象的意象和比喻，营造画面感
4. **简洁有力**：语言精炼，避免冗余，每句都有意义
5. **结构完整**：包含主歌、副歌等完整结构

【歌词结构要求】
1. **主歌（Verse）**：叙述性内容，推进故事或情感
2. **副歌（Chorus）**：核心主题，重复出现，朗朗上口
3. **桥段（Bridge）**（可选）：转折或升华部分
4. **前奏/尾奏**（可选）：开头和结尾的过渡

【写作技巧】
1. 使用押韵增强韵律感（全押、半押、内押等）
2. 合理使用重复，强化主题
3. 运用比喻、拟人等修辞手法
4. 注意音节和节奏，便于演唱
5. 保持情感连贯，形成完整的情感线`,

  /**
   * 歌词结构要求（默认格式）
   */
  outputformat: `【歌词格式要求】

1. **结构组织**：
   - 主歌（Verse）：通常2-4段，每段4-8行
   - 副歌（Chorus）：重复出现，通常4-8行
   - 桥段（Bridge）：可选，通常2-4行
   - 前奏/尾奏：可选

2. **格式要求**：
   - 每行歌词独立成行
   - 标注段落类型（如：[主歌1]、[副歌]）
   - 注意押韵和节奏
   - 保持每行长度适中

3. **内容要求**：
   - 主题明确，情感连贯
   - 语言简洁有力
   - 使用具体意象，避免抽象
   - 注意音节和节奏感`,
  
  /**
   * 获取 Suno AI 格式的规则和输出格式
   * 当 format === 'suno' 时使用
   */
  getSunoFormatRules(): { rules: string; outputformat: string } {
    return {
      rules: `你是一位专业的歌词创作助手，专门为 Suno AI 音乐生成平台创作歌词。

【Suno AI 歌词创作原则】
1. **简洁直接**：歌词要简洁明了，每行长度适中（通常8-12个中文字符或4-8个英文单词）
2. **韵律感强**：注重押韵和节奏，使歌词朗朗上口，适合演唱
3. **情感饱满**：通过文字传达强烈的情感，引起听众共鸣
4. **画面感强**：使用具象的意象和比喻，营造清晰的画面感
5. **结构清晰**：包含主歌、副歌等完整结构，副歌要重复出现

【Suno AI 歌词结构要求】
1. **前奏（Intro）**（可选）：开头部分，通常1-2行，可以包含情绪和乐器标签
2. **主歌（Verse）**：通常2-3段，每段4-6行，叙述性内容，推进故事或情感
3. **预副歌（Pre-Chorus）**（可选）：连接主歌和副歌的过渡部分，通常2-4行
4. **副歌（Chorus）**：核心主题，重复出现2-3次，通常4-6行，朗朗上口
5. **桥段（Bridge）**（可选）：转折或升华部分，通常2-4行
6. **尾奏（Outro）**（可选）：结尾部分，通常1-2行

【Suno AI 写作技巧】
1. 使用押韵增强韵律感（全押、半押、内押等）
2. 合理使用重复，强化主题和记忆点
3. 运用比喻、拟人等修辞手法，增强画面感
4. 注意音节和节奏，便于演唱和音乐配合
5. 保持情感连贯，形成完整的情感线
6. 避免过于复杂的词汇和句式，保持通俗易懂
7. 每行歌词要有独立的意义，同时与整体主题呼应

【Suno AI 特殊要求】
1. **纯文本格式**：输出必须是纯文本，不使用任何 Markdown 语法（如 #、*、-、反引号 等符号）
2. **结构标签**：必须使用英文方括号标签标注段落类型，格式为 [标签名]
3. **标签格式**：所有结构标签必须用方括号括起来，使用英文，例如：[Verse]、[Chorus]、[Bridge] 等
4. **不包含歌名**：输出中不要包含歌曲标题或歌名，只输出歌词正文和结构标签
5. **直接输出**：直接输出歌词内容，不要添加任何说明文字或格式标记`,
      
      outputformat: `【Suno AI 歌词格式要求】

1. **输出格式**：
   - 必须是纯文本格式，不使用任何 Markdown 语法
   - 不使用 #、*、-、反引号 等任何 Markdown 符号
   - 只使用换行符和空格进行格式化
   - 段落之间使用空行分隔

2. **结构标签要求**（必须严格遵守）：
   - 所有结构标签必须使用英文方括号格式：[标签名]
   - 支持的标签：[Intro]、[Verse]、[Pre-Chorus]、[Chorus]、[Bridge]、[Final Chorus]、[Outro]
   - 标签单独成行，后面跟空行，然后是歌词内容
   - 标签使用英文，避免被误认为是歌词内容

3. **可选标签**（用于增强音乐效果）：
   - [Mood: 情绪描述]：如 [Mood: Calm]、[Mood: Energetic]
   - [Instrument: 乐器]：如 [Instrument: Keys, Soft Drums]
   - [Energy: 能量级别]：如 [Energy: High]、[Energy: Low]
   - [Build-Up]：用于预副歌，表示情绪递进
   - [Breakdown]：用于桥段，表示情绪转折

4. **结构组织**：
   - [Intro]（可选）：开头部分，通常1-2行
   - [Verse]：主歌，通常2-3段，每段4-6行
   - [Pre-Chorus]（可选）：预副歌，通常2-4行
   - [Chorus]：副歌，重复出现2-3次，每次4-6行
   - [Bridge]（可选）：桥段，通常2-4行
   - [Final Chorus]（可选）：最终副歌，通常4-6行
   - [Outro]（可选）：结尾部分，通常1-2行

5. **内容要求**：
   - 每行歌词独立成行
   - 每行长度适中（8-12个中文字符或4-8个英文单词）
   - 注意押韵和节奏
   - 主题明确，情感连贯
   - 语言简洁有力，通俗易懂
   - 使用具体意象，避免抽象
   - **绝对不要包含歌曲标题或歌名**

6. **示例格式**：
[Verse]
第一行歌词
第二行歌词
第三行歌词
第四行歌词

[Pre-Chorus]
[Build-Up]
第一行歌词
第二行歌词

[Chorus]
[Energy: High]
第一行歌词
第二行歌词
第三行歌词
第四行歌词

[Verse]
第一行歌词
第二行歌词
第三行歌词
第四行歌词

[Chorus]
[Energy: High]
第一行歌词
第二行歌词
第三行歌词
第四行歌词

[Bridge]
[Breakdown]
第一行歌词
第二行歌词

[Final Chorus]
[Energy: High]
第一行歌词
第二行歌词
第三行歌词
第四行歌词

[Outro]
最后一行歌词`,
    };
  },

  /**
   * 获取歌词类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['musicStyle', 'emotion', 'rhyme', 'theme', 'length', 'format'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const lyricsFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
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

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        musicStyle: {
          type: 'select',
          label: '音乐风格',
          labelEn: 'Music Style',
          helpText: '选择歌词的音乐风格',
          helpTextEn: 'Select the music style',
        },
        emotion: {
          type: 'select',
          label: '情感',
          labelEn: 'Emotion',
          helpText: '选择歌词要表达的情感',
          helpTextEn: 'Select the emotion to express',
        },
        rhyme: {
          type: 'select',
          label: '押韵',
          labelEn: 'Rhyme',
          helpText: '选择押韵方式',
          helpTextEn: 'Select the rhyme style',
        },
        length: {
          type: 'select',
          label: '长度',
          labelEn: 'Length',
          helpText: '选择歌词长度',
          helpTextEn: 'Select the length',
        },
        format: {
          type: 'select',
          label: '格式',
          labelEn: 'Format',
          helpText: '选择歌词输出格式',
          helpTextEn: 'Select the output format',
        },
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

    if (language === 'en') {
      const musicStyle = Array.isArray(lyricsFormOptionsZh.musicStyle)
        ? lyricsFormOptionsZh.musicStyle.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const emotion = Array.isArray(lyricsFormOptionsZh.emotion)
        ? lyricsFormOptionsZh.emotion.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const rhyme = Array.isArray(lyricsFormOptionsZh.rhyme)
        ? lyricsFormOptionsZh.rhyme.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const length = Array.isArray(lyricsFormOptionsZh.length)
        ? lyricsFormOptionsZh.length.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const format = Array.isArray(lyricsFormOptionsZh.format)
        ? lyricsFormOptionsZh.format.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];

      return {
        musicStyle,
        emotion,
        rhyme,
        length,
        format,
        _metadata: {
          musicStyle: {
            ...lyricsFormOptionsZh._metadata!.musicStyle,
            label: lyricsFormOptionsZh._metadata!.musicStyle.labelEn || 'Music Style',
            helpText: lyricsFormOptionsZh._metadata!.musicStyle.helpTextEn,
          },
          emotion: {
            ...lyricsFormOptionsZh._metadata!.emotion,
            label: lyricsFormOptionsZh._metadata!.emotion.labelEn || 'Emotion',
            helpText: lyricsFormOptionsZh._metadata!.emotion.helpTextEn,
          },
          rhyme: {
            ...lyricsFormOptionsZh._metadata!.rhyme,
            label: lyricsFormOptionsZh._metadata!.rhyme.labelEn || 'Rhyme',
            helpText: lyricsFormOptionsZh._metadata!.rhyme.helpTextEn,
          },
          length: {
            ...lyricsFormOptionsZh._metadata!.length,
            label: lyricsFormOptionsZh._metadata!.length.labelEn || 'Length',
            helpText: lyricsFormOptionsZh._metadata!.length.helpTextEn,
          },
          format: {
            ...lyricsFormOptionsZh._metadata!.format,
            label: lyricsFormOptionsZh._metadata!.format.labelEn || 'Format',
            helpText: lyricsFormOptionsZh._metadata!.format.helpTextEn,
          },
          theme: {
            ...lyricsFormOptionsZh._metadata!.theme,
            label: lyricsFormOptionsZh._metadata!.theme.labelEn || 'Theme',
            placeholder: lyricsFormOptionsZh._metadata!.theme.placeholderEn,
            helpText: lyricsFormOptionsZh._metadata!.theme.helpTextEn,
          },
        },
      };
    }

    return lyricsFormOptionsZh;
  },
}