/**
 * 话题写作：purpose → article_length / structure_id 动态选项（统一合同 key）。
 * purpose 由 voice_category 推导，不对用户再问一遍（避免与类别体裁冲突）。
 */
import purposeJson from './topic-article-purpose.json';
import { pickI18n, type I18nText } from './writing-voice-presets';

/** 类别方向 → 交付体裁（合同 purpose）；用户选类别即定体裁 */
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
    // literary_column / self_media / …
    default:
      return 'publish_article';
  }
}

export type TopicFormatSpec = {
  id: string;
  /** 写入合同 basic.topic_format，供提炼模型只读当前类别规则 */
  format: string;
  /** field_specs 短描述 */
  fieldHint: string;
  exampleGood: string;
  exampleBad: string;
};

/**
 * 选题格式按类别硬切换。财经/谈话禁止套用短剧「【剧名】+剧情」句式。
 */
export function topicFormatForVoiceCategory(voiceCategory: string): TopicFormatSpec {
  const cat = String(voiceCategory || '').trim();
  switch (cat) {
    case 'hongguo_drama':
      return {
        id: cat,
        format:
          '短剧节拍：每条「【剧名】+剧情核心冲突一句话」。题材必须跟检索到的**当前热播/爆款短剧素材**走，用所选风格的冲突节拍改写；**单次交付须在选定篇幅内打完一集**（冷开场→爆发→反转→收束），禁止「未完/下集见」；不要行业新闻、教程，也不要无视检索整批自造固定婚礼梗。',
        fieldHint: '【剧名】+剧情核心冲突（题材跟检索热播）',
        exampleGood: '（示例形态）【某热播竖屏剧名钩】开场三十秒冲突已爆发，篇幅内身份揭破并落点',
        exampleBad: '短剧行业版权合规研讨会召开；或选题写成「未完待续/下集更大反转」',
      };
    case 'fanqie_web':
      return {
        id: cat,
        format:
          '短篇网文：每条「【书名或题材钩子】+核心设定/反转」。题材必须跟检索到的**当前热门短篇/书名素材**走，用所选风格笔法改写；**单次交付须在选定篇幅内写完一个完整故事**（欲望→冲突→反转→收束），禁止「未完/下章见」连载钩；长篇连载另走 series。',
        fieldHint: '【书名/题材钩子】+核心设定/反转（题材跟检索热门）',
        exampleGood: '（示例形态）【某热门短篇钩】开局设定清楚，篇幅内可兑现反转与收束',
        exampleBad: '【真假千金婚礼大乱斗】套短剧礼堂句式；或选题写成「未完/六十日倒计时开始」',
      };
    case 'finance_narrative':
      return {
        id: cat,
        format:
          '财经叙事·自媒体专栏：每条写成「可发公众号/专栏的文章选题」，形态为「场景或交易钩子：激励结构/条款/人性博弈切入点」。题材必须跟检索到的**当前热议公司/交易/市场素材**走，用所选风格（夜话博弈/条款解剖/市场现场等）定角度；禁止短剧剧名腔与婚礼/重生梗。可故事化，但禁止编造具体假财报数字与荐股。',
        fieldHint: '文章选题：热议场景/交易钩 + 条款或激励切入（题材跟检索）',
        exampleGood: '（示例形态）某热议融资局：友情如何在董事会变成控制权争夺',
        exampleBad: '【病房尽调报告】短剧剧名腔；或无视检索整批自造固定对赌董事会梗',
      };
    case 'political_report':
      return {
        id: cat,
        format:
          '时政/深度叙事：每条「报道角度：人物/现场/材料边界」。题材必须跟检索到的**当前政策/发布会/地方温差素材**走；要可写调查/叙事稿切入点，禁止短剧剧名腔与爽文反转。',
        fieldHint: '报道角度 + 人物/现场/材料边界（题材跟检索热议）',
        exampleGood: '（示例形态）某场听证会后的材料缺口：各方说法如何对不上',
        exampleBad: '【身份反转复仇】隐藏继承人当众撕破协议；或无视检索写死固定细则梗',
      };
    case 'talk_brief':
      return {
        id: cat,
        format:
          '谈话资料：每条「议题钩子：可抬杠/可追问的核心矛盾」。题材必须跟检索到的**当前社会/新闻/经济/民生热议**走，用所选节目笔法定追问角度。voice_label / 参考节目名只定笔法，**禁止**把该节目本身、主持人、嘉宾名单、停播复播、沙发考古写成选题。禁止短剧剧情简介句式。',
        fieldHint: '公共议题钩子 + 可追问矛盾（题材跟检索热议；非节目元话题）',
        exampleGood: '（示例形态）某热议公共话题：成名前后谁还愿意为你背书',
        exampleBad:
          '锵锵三人行停播/窦文涛落泪/圆桌派嘉宾名单等节目本身元话题；或【直播间当众决裂】短剧腔；或无视检索写死固定人生鸡汤议题',
      };
    case 'voiceover_brief':
      return {
        id: cat,
        format:
          '短视频解说：每条「开口钩子：30秒内能说清的一点」。题材必须跟检索到的**当前热门可播选题**走；短句、可播解说，禁止短剧剧名长梗概。',
        fieldHint: '开口钩子 + 一点说清（题材跟检索热门）',
        exampleGood: '（示例形态）别急着复盘某热议事件：先问谁在接最后一棒',
        exampleBad: '【短剧】假千金婚礼被亲子鉴定砸场；或无视检索写死固定科普清单',
      };
    case 'literary_column':
      return {
        id: cat,
        format:
          '文学·专栏：每条「标题向选题：场景或意象钩子 + 可展开矛盾」。题材必须跟检索到的**当前可写专栏素材**走；禁止短剧【剧名】剧情简介格式。',
        fieldHint: '标题向选题 + 可展开矛盾（题材跟检索热门）',
        exampleGood: '（示例形态）当「稳了」没有担保函：预期差如何一夜变薄',
        exampleBad: '【打脸连击】隐藏身份在发布会当场揭穿',
      };
    case 'self_media':
      return {
        id: cat,
        format:
          '热点锐评：每条「判断向选题：刺耳观点或个案钩子 + 可展开矛盾」。题材必须跟检索到的**当前热搜/爆款观点素材**走；要观点文/快反角度，禁止短剧剧名腔。',
        fieldHint: '判断向选题 + 可展开矛盾（题材跟检索热门）',
        exampleGood: '（示例形态）规则改了谁在买单：某热搜里的双重标准',
        exampleBad: '【打脸连击】隐藏身份在发布会当场揭穿；或无视检索写死固定平台规则梗',
      };
    case 'course_tutorial':
      return {
        id: cat,
        format:
          '网课教程：每条「一课可教的点：学习目标或卡点 + 可跟练/可带走的结果」。题材必须跟检索到的**当前热门课/教程素材**走（爆款课题、热门技能课标题），不要写死某一学科，也不要整批自造编程入门课。要像课程章节标题；禁止短剧剧名腔。',
        fieldHint: '热门一课：目标/卡点 + 可跟练结果（题材跟检索热门）',
        exampleGood: '（示例形态）十分钟跟练讲清某热门技能的一个卡点：学员能交出可验收的一小步',
        exampleBad: '整批自造 Python/报错调试课，或无视检索热门、写死摄影/Excel 等固定领域',
      };
    default:
      return {
        id: cat || 'unknown',
        format:
          '通用写作选题：每条「可写标题/角度 + 核心矛盾一句话」。题材跟检索到的当前热门素材走；仅当类别为短剧时才可用【剧名】句式；当前类别禁止短剧剧情腔。',
        fieldHint: '可写角度 + 核心矛盾（题材跟检索热门）',
        exampleGood: '一个具体场面里的激励不相容',
        exampleBad: '【重生反杀】开场当众撕破假夫妻',
      };
  }
}

export type PurposeLength = {
  id: string;
  label: I18nText;
  min_chars?: number;
  /** 仅注入模型：档位体量与写法提示（不对用户展示钉死字数） */
  model_guide?: I18nText;
};

export type PurposeStructure = {
  id: string;
  title: I18nText;
  beats: string[];
};

export type PurposeDef = {
  id: string;
  label: I18nText;
  lengths: PurposeLength[];
  structures: PurposeStructure[];
};

type PurposeFile = {
  purposes: PurposeDef[];
};

const data = purposeJson as PurposeFile;
const byId = new Map(data.purposes.map((p) => [p.id, p]));

export function listTopicPurposes(): PurposeDef[] {
  return data.purposes.slice();
}

export function getTopicPurpose(id: string): PurposeDef | undefined {
  return byId.get(String(id || '').trim());
}

export function lengthsForPurpose(purposeId: string, lang?: string): Array<{ id: string; label: string }> {
  const p = getTopicPurpose(purposeId);
  if (!p) return [];
  return p.lengths.map((l) => ({ id: l.id, label: pickI18n(l.label, lang) }));
}

export function structuresForPurpose(
  purposeId: string,
  lang?: string
): Array<{ id: string; title: string; beats: string[] }> {
  const p = getTopicPurpose(purposeId);
  if (!p) return [];
  return p.structures.map((s) => ({
    id: s.id,
    title: pickI18n(s.title, lang),
    beats: s.beats.slice(),
  }));
}

/**
 * 写入合同供主笔/大纲读取：档位标签 + 体量引导（软下限，非绝对钉死）。
 */
export function articleLengthGuide(
  purposeId: string,
  lengthId: string,
  lang?: string
): string {
  const purpose = getTopicPurpose(purposeId);
  const length =
    purpose?.lengths.find((l) => l.id === String(lengthId || '').trim()) ||
    purpose?.lengths.find((l) => l.id === 'standard') ||
    purpose?.lengths[0];
  if (!length) {
    return `article_length=${lengthId || 'standard'}：按用途交付一档完整体量。`;
  }
  const label = pickI18n(length.label, lang) || length.id;
  const guide = pickI18n(length.model_guide, lang);
  const floor =
    typeof length.min_chars === 'number' && length.min_chars > 0
      ? `软下限约${length.min_chars}汉字（不得明显短于该档）。`
      : '';
  return [`档位=${length.id}（${label}）`, guide, floor].filter(Boolean).join(' ');
}
