/**
 * 分镜脚本写作类型配置
 * 用于为 storyboard-scripts 类型的写作任务提供系统提示词和格式要求
 * 合并了电影剧本和广告脚本的功能
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const storyboardScriptsConfig: WritingTypeConfig = {
  /**
   * 分镜脚本写作规则和指导原则
   */
  rules: `你是一位专业的分镜脚本写作助手，擅长创作各类分镜脚本，包括电影剧本、广告脚本、短视频脚本等。

【分镜脚本写作原则】
1. **场景清晰**：每个场景应明确描述时间、地点、人物、动作
2. **对话自然**：对话应符合人物性格和情境，自然流畅
3. **视觉化描述**：使用具体的视觉元素描述画面，便于拍摄或制作
4. **节奏控制**：合理控制场景节奏，突出重点情节
5. **格式规范**：遵循标准的分镜脚本格式，包含场景号、场景描述、对话等

【分镜脚本结构要求】
1. **场景标题**：包含场景号、地点、时间（日/夜）
2. **场景描述**：详细描述画面内容、人物动作、环境氛围
3. **对话内容**：人物对话，标注说话人
4. **镜头说明**：可选的镜头类型、角度、运动方式等
5. **音效/音乐**：可选的音效和背景音乐说明

【写作技巧】
1. 使用简洁有力的语言描述画面
2. 对话要符合人物身份和情境
3. 合理使用场景转换，保持节奏
4. 突出关键情节和冲突点
5. 考虑实际拍摄或制作的可行性`,

  /**
   * 分镜脚本结构要求
   */
  outputformat: `【分镜脚本格式要求】

1. **标准格式**：
   - 场景标题：场景 [场景号] - [地点] - [时间]
   - 场景描述：详细描述画面内容
   - 对话格式：[人物名]：对话内容
   - 镜头说明：（可选）镜头类型、角度等

2. **结构要素**：
   - 必须包含：场景标题、场景描述、对话（如有）
   - 可选包含：镜头说明、音效说明、转场说明
   - 每个场景应独立成段，清晰分隔

3. **内容要求**：
   - 场景描述应具体、视觉化，便于理解画面
   - 对话应自然、符合人物性格
   - 场景之间应有逻辑关联，形成完整故事线

4. **输出示例格式**：
   场景 1 - 办公室 - 日
   
   画面：现代化的办公室，阳光透过窗户洒在办公桌上。主角坐在桌前，专注地看着电脑屏幕。
   
   主角：这个项目需要重新规划。
   
   同事：你觉得应该从哪里开始？
   
   （镜头：中景，缓慢推进）`,

  /**
   * 获取分镜脚本类型需要的参数列表
   */
  getParamsForType(): string[] {
    return [
      'scriptType',
      'sceneCount',
      'characterCount',
      'duration',
      'dialogueStyle',
      'genre',
      'targetAudience',
      'productInfo',
      'callToAction',
    ];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const storyboardFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
      scriptType: [
        { value: 'film', label: '电影', labelEn: 'Film' },
        { value: 'tv', label: '电视剧', labelEn: 'TV Series' },
        { value: 'short-video', label: '短视频', labelEn: 'Short Video' },
        { value: 'commercial', label: '广告', labelEn: 'Commercial' },
        { value: 'documentary', label: '纪录片', labelEn: 'Documentary' },
        { value: 'music-video', label: '音乐MV', labelEn: 'Music Video' },
        { value: 'corporate', label: '企业宣传片', labelEn: 'Corporate Video' },
        { value: 'other', label: '其他', labelEn: 'Other' },
      ],
      dialogueStyle: [
        { value: 'no-dialogue', label: '无台词', labelEn: 'No Dialogue' },
        { value: 'natural', label: '自然流畅', labelEn: 'Natural' },
        { value: 'dramatic', label: '戏剧化', labelEn: 'Dramatic' },
        { value: 'minimal', label: '极简风格', labelEn: 'Minimal' },
      ],
      genre: [
        { value: 'drama', label: '剧情', labelEn: 'Drama' },
        { value: 'comedy', label: '喜剧', labelEn: 'Comedy' },
        { value: 'action', label: '动作', labelEn: 'Action' },
        { value: 'thriller', label: '惊悚', labelEn: 'Thriller' },
        { value: 'romance', label: '爱情', labelEn: 'Romance' },
        { value: 'sci-fi', label: '科幻', labelEn: 'Sci-Fi' },
        { value: 'horror', label: '恐怖', labelEn: 'Horror' },
        { value: 'other', label: '其他', labelEn: 'Other' },
      ],
      targetAudience: [
        { value: 'general', label: '大众', labelEn: 'General' },
        { value: 'adult', label: '成人', labelEn: 'Adult' },
        { value: 'youth', label: '青少年', labelEn: 'Youth' },
        { value: 'children', label: '儿童', labelEn: 'Children' },
        { value: 'elderly', label: '中老年', labelEn: 'Elderly' },
      ],

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        scriptType: {
          type: 'select',
          label: '脚本类型',
          labelEn: 'Script Type',
          helpText: '选择脚本类型（电影、广告、短视频等）',
          helpTextEn: 'Select the script type (film, commercial, short video, etc.)',
        },
        sceneCount: {
          type: 'number',
          label: '场景数量',
          labelEn: 'Scene Count',
          placeholder: '例如：10',
          placeholderEn: 'e.g., 10',
          helpText: '预计的场景数量',
          helpTextEn: 'Expected number of scenes',
          min: 1,
          max: 100,
        },
        characterCount: {
          type: 'number',
          label: '角色数量',
          labelEn: 'Character Count',
          placeholder: '例如：5',
          placeholderEn: 'e.g., 5',
          helpText: '主要角色数量',
          helpTextEn: 'Number of main characters',
          min: 1,
          max: 50,
        },
        duration: {
          type: 'number',
          label: '时长（秒）',
          labelEn: 'Duration (seconds)',
          placeholder: '30',
          placeholderEn: '30',
          helpText: '脚本总时长，单位：秒（默认30秒）',
          helpTextEn: 'Total script duration in seconds (default: 30)',
          min: 1,
          max: 3600,
        },
        dialogueStyle: {
          type: 'select',
          label: '对话风格',
          labelEn: 'Dialogue Style',
          helpText: '选择对话风格，可选择"无台词"或具体的对话风格',
          helpTextEn: 'Select dialogue style, can choose "No Dialogue" or specific dialogue style',
        },
        genre: {
          type: 'select',
          label: '类型',
          labelEn: 'Genre',
          helpText: '选择内容类型',
          helpTextEn: 'Select the content genre',
        },
        targetAudience: {
          type: 'select',
          label: '目标受众',
          labelEn: 'Target Audience',
          helpText: '选择目标受众',
          helpTextEn: 'Select the target audience',
        },
        productInfo: {
          type: 'textarea',
          label: '产品/内容信息',
          labelEn: 'Product/Content Information',
          placeholder: '请描述产品特点、功能、优势等（广告脚本）或内容主题（其他类型）...',
          placeholderEn: 'Describe product features (for commercials) or content theme (for other types)...',
          helpText: '用于广告脚本时描述产品信息，其他类型时描述内容主题',
          helpTextEn: 'Product info for commercials, content theme for other types',
        },
        callToAction: {
          type: 'text',
          label: '行动号召',
          labelEn: 'Call to Action',
          placeholder: '例如：立即购买、了解更多等（可选）',
          placeholderEn: 'e.g., Buy now, Learn more (optional)',
          helpText: '结尾的行动号召语（主要用于广告脚本）',
          helpTextEn: 'Call to action at the end (mainly for commercial scripts)',
        },
      },
    };

    if (language === 'en') {
      const scriptType = Array.isArray(storyboardFormOptionsZh.scriptType)
        ? storyboardFormOptionsZh.scriptType.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const dialogueStyle = Array.isArray(storyboardFormOptionsZh.dialogueStyle) 
        ? storyboardFormOptionsZh.dialogueStyle.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const genre = Array.isArray(storyboardFormOptionsZh.genre)
        ? storyboardFormOptionsZh.genre.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];
      const targetAudience = Array.isArray(storyboardFormOptionsZh.targetAudience)
        ? storyboardFormOptionsZh.targetAudience.map((opt: any) => ({
            value: opt.value,
            label: opt.labelEn || opt.value,
          }))
        : [];

      return {
        scriptType,
        dialogueStyle,
        genre,
        targetAudience,
        _metadata: {
          scriptType: {
            ...storyboardFormOptionsZh._metadata!.scriptType,
            label: storyboardFormOptionsZh._metadata!.scriptType.labelEn || 'Script Type',
            helpText: storyboardFormOptionsZh._metadata!.scriptType.helpTextEn,
          },
          sceneCount: {
            ...storyboardFormOptionsZh._metadata!.sceneCount,
            label: storyboardFormOptionsZh._metadata!.sceneCount.labelEn || 'Scene Count',
            placeholder: storyboardFormOptionsZh._metadata!.sceneCount.placeholderEn,
            helpText: storyboardFormOptionsZh._metadata!.sceneCount.helpTextEn,
          },
          characterCount: {
            ...storyboardFormOptionsZh._metadata!.characterCount,
            label: storyboardFormOptionsZh._metadata!.characterCount.labelEn || 'Character Count',
            placeholder: storyboardFormOptionsZh._metadata!.characterCount.placeholderEn,
            helpText: storyboardFormOptionsZh._metadata!.characterCount.helpTextEn,
          },
          duration: {
            ...storyboardFormOptionsZh._metadata!.duration,
            label: storyboardFormOptionsZh._metadata!.duration.labelEn || 'Duration (seconds)',
            placeholder: storyboardFormOptionsZh._metadata!.duration.placeholderEn,
            helpText: storyboardFormOptionsZh._metadata!.duration.helpTextEn,
          },
          dialogueStyle: {
            ...storyboardFormOptionsZh._metadata!.dialogueStyle,
            label: storyboardFormOptionsZh._metadata!.dialogueStyle.labelEn || 'Dialogue Style',
            helpText: storyboardFormOptionsZh._metadata!.dialogueStyle.helpTextEn,
          },
          genre: {
            ...storyboardFormOptionsZh._metadata!.genre,
            label: storyboardFormOptionsZh._metadata!.genre.labelEn || 'Genre',
            helpText: storyboardFormOptionsZh._metadata!.genre.helpTextEn,
          },
          targetAudience: {
            ...storyboardFormOptionsZh._metadata!.targetAudience,
            label: storyboardFormOptionsZh._metadata!.targetAudience.labelEn || 'Target Audience',
            helpText: storyboardFormOptionsZh._metadata!.targetAudience.helpTextEn,
          },
          productInfo: {
            ...storyboardFormOptionsZh._metadata!.productInfo,
            label: storyboardFormOptionsZh._metadata!.productInfo.labelEn || 'Product/Content Information',
            placeholder: storyboardFormOptionsZh._metadata!.productInfo.placeholderEn,
            helpText: storyboardFormOptionsZh._metadata!.productInfo.helpTextEn,
          },
          callToAction: {
            ...storyboardFormOptionsZh._metadata!.callToAction,
            label: storyboardFormOptionsZh._metadata!.callToAction.labelEn || 'Call to Action',
            placeholder: storyboardFormOptionsZh._metadata!.callToAction.placeholderEn,
            helpText: storyboardFormOptionsZh._metadata!.callToAction.helpTextEn,
          },
        },
      };
    }

    return storyboardFormOptionsZh;
  },
}
