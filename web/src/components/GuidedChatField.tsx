/**
 * 对话式单字段引导：助手提问 + 选项 chips + 自定义输入（上传除外）
 * 点选选项即推进；话题（topic-chips）为多选，需点「确认选题」再推进；主话题（main-topic）为单选可跳过。
 * 整数刻度（x-ui-type: scale）用专属滑杆，无「自定义…」。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Input, Slider, Upload } from 'antd';
import { ArrowUp, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WarpGateField } from './WarpGateWizard';
import { toAppLang } from '../i18n/appLocale';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import {
  defaultSeekVoiceRegion,
  isSeekVoiceFieldName,
  listSeekVoiceRegionsForUi,
  seekVoiceDisplayLabel,
  seekVoiceEnumForRegion,
  type SeekVoiceRegion,
} from '../lib/seekVoicePresets';
import {
  isKbWritingVoiceId,
  isTopicArticleVoiceCategoryField,
  isTopicArticleVoiceIdField,
  KB_WRITING_VOICE_ID,
  writingCategoryEnum,
  writingVoiceChipLabel,
  writingVoiceEnumForFilter,
} from '../lib/writingVoicePresets';
import {
  lengthsForVoiceCategory,
  structuresForVoiceCategory,
} from '../lib/topicArticlePurpose';
import { userFacingCopy } from '../lib/uiCopyHygiene';
import { FolderCardAtField } from './knowledge-base/FolderCardAtField';
import { TextFileOrPasteField } from './schema-fields/TextFileOrPasteField';
import { MinimaxVoiceField } from './schema-fields/MinimaxVoiceField';
import {
  DialogueCastField,
  normalizeDialogueCast,
  type DialogueCastMember,
} from './schema-fields/DialogueCastField';
import { TopicOutlineEditor } from './TopicOutlineEditor';

gsap.registerPlugin(useGSAP);

const STYLE_TONE_RECS = [
  '冷静短句，少感叹',
  '先事实后判断，克制评论',
  '清晰好读，少堆行话',
  '有锋芒但不人身攻击',
  '温和亲和，术语轻轻带过',
];

/** 行业日报：主观分析单选（无评论 = 关闭；其余写入 analysis_stance） */
const ANALYSIS_MODE_OPTIONS: Array<{ value: string; label: string; off?: boolean }> = [
  { value: '', label: '无主观评论', off: true },
  { value: '基于数据客观分析', label: '客观分析' },
  { value: '基于数据批判性分析', label: '批判性分析' },
  { value: '基于数据幽默分析', label: '幽默分析' },
  { value: '基于数据乐观分析', label: '乐观分析' },
];

export type GuidedChatFieldProps = {
  field: WarpGateField;
  topicChips?: string[];
  /** 完整发现池：区分其它批次已选 vs 手写 */
  topicPool?: string[];
  onReshuffleTopics?: () => void;
  reshuffleDisabled?: boolean;
  reshuffleHint?: string;
  /** 推荐话题检索失败/为空时重试 */
  onRetryTopicRecommend?: () => void;
  submitting?: boolean;
  /** 附加值（如 industry_custom / report_date）合并进提交 */
  onAnswer: (patch: Record<string, unknown>, displayText: string) => void;
  onSkip?: () => void;
  /** 仅更新上下文、不推进下一步（如类别步切换语言） */
  onSoftPatch?: (patch: Record<string, unknown>) => void;
  /** 上下文：当前 Wizard 已收集的值，用来在「自定义」输入框下面回显提示 */
  contextValues?: Record<string, unknown>;
};

const TOPIC_ARTICLE_LANGS: Array<{ id: string; label: string }> = [
  { id: 'zh', label: '简体中文' },
  { id: 'zh-TW', label: '繁体中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
];

/** 语言切换只在「写作风格」步：类别方向始终完整展示 */
function isTopicArticleLangSwitchField(name: string): boolean {
  return name === 'voice_id';
}

function isUploadField(field: WarpGateField): boolean {
  const ui = field['x-ui'];
  return ui === 'upload' || ui === 'image' || ui === 'file' || field.type === 'file';
}

function isTextFileOrPasteField(field: WarpGateField): boolean {
  return field['x-ui-type'] === 'textFileOrPaste' || field.name === 'source_material';
}

/** 已上传/粘贴/选自知识库的相关内容文本长度是否足够替代「内容说明」 */
function sourceMaterialTextLength(ctx?: Record<string, unknown>): number {
  const sm = ctx?.source_material;
  if (typeof sm === 'string') return sm.trim().length;
  if (sm && typeof sm === 'object' && !Array.isArray(sm)) {
    return String((sm as { text?: string }).text ?? '').trim().length;
  }
  return 0;
}

function hasSourceMaterialContext(ctx?: Record<string, unknown>): boolean {
  return sourceMaterialTextLength(ctx) > 0;
}

/** brief 在已有材料时可空：旧配置仍标 required 时前端也放行 */
function isBriefSatisfiedBySourceMaterial(
  field: WarpGateField,
  ctx?: Record<string, unknown>
): boolean {
  return field.name === 'brief' && hasSourceMaterialContext(ctx);
}

function isMinimaxVoiceField(field: WarpGateField): boolean {
  return field['x-ui-type'] === 'minimaxVoice' || field.name === 'voice';
}

function isDialogueCastField(field: WarpGateField): boolean {
  return field['x-ui-type'] === 'dialogueCast' || field.name === 'cast';
}

function isScaleField(field: WarpGateField): boolean {
  if (field['x-ui-type'] === 'scale') return true;
  // 兜底：整数区间字段即使旧 schema 未标 scale，也不走自由输入
  const t = String(field.type ?? '');
  if (
    (t === 'integer' || t === 'number') &&
    typeof field.minimum === 'number' &&
    typeof field.maximum === 'number' &&
    !(field.enum && field.enum.length > 0)
  ) {
    return true;
  }
  return (
    field.name === 'structure_divergence' ||
    field.name === 'style_divergence' ||
    field.name === 'seek_count'
  );
}

/** 枚举多选（array + multi-chips / voice_ids）；string+chips 是单选点选 */
function isMultiEnumField(field: WarpGateField): boolean {
  // 话题写作系统风格：始终单选
  if (field.name === 'voice_id' && field['x-ui-type'] !== 'minimaxVoice') {
    return false;
  }
  if (field['x-ui'] === 'multi-chips') {
    return true;
  }
  // x-ui-type: chips 仅当字段本身是 array 才多选；string 枚举为单选
  if (field['x-ui-type'] === 'chips') {
    return field.type === 'array';
  }
  if (field.name === 'voice_ids' || field.name === 'voices' || field.name === 'style_ids') {
    return true;
  }
  return field.type === 'array' && Boolean(field.enum?.length);
}

function scaleBounds(field: WarpGateField): { min: number; max: number } {
  let min = typeof field.minimum === 'number' && Number.isFinite(field.minimum) ? field.minimum : NaN;
  let max = typeof field.maximum === 'number' && Number.isFinite(field.maximum) ? field.maximum : NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    if (field.name === 'seek_count') {
      min = 2;
      max = 10;
    } else {
      min = 1;
      max = 10;
    }
  }
  return min <= max ? { min, max } : { min: max, max: min };
}

function scaleLabel(field: WarpGateField, value: number): string {
  const labels = field['x-enum-labels'];
  const { min } = scaleBounds(field);
  if (labels?.length) {
    const idx = Math.round(value) - min;
    if (idx >= 0 && idx < labels.length) {
      const raw = labels[idx]!.trim();
      // 「5 · 适中差异」→ 优先展示刻度说明；无分隔则整段
      const sep = raw.indexOf('·');
      if (sep > 0) return raw.slice(sep + 1).trim() || raw;
      return raw;
    }
  }
  return String(value);
}

/** 多选话题写入 core_topic：用中文分号拼接，下游当主线主题串 */
export function joinSelectedTopics(selected: string[], custom = ''): string {
  const parts = [...selected.map((s) => s.trim()).filter(Boolean)];
  const c = custom.trim();
  if (c && !parts.includes(c)) parts.push(c);
  return parts.join('；');
}

export function splitJoinedTopics(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const LANGUAGE_LABELS: Record<string, string> = {
  zh: '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
};

const SEARCH_REGION_TO_KEY: Record<string, string> = {
  全球: 'global',
  国际: 'global',
  global: 'global',
  中国大陆: 'cn',
  大陆: 'cn',
  中国: 'cn',
  cn: 'cn',
  台湾: 'tw',
  台灣: 'tw',
  tw: 'tw',
  日本: 'jp',
  jp: 'jp',
  北美: 'na',
  美国: 'na',
  na: 'na',
  欧洲: 'eu',
  歐洲: 'eu',
  eu: 'eu',
};

const SEARCH_REGION_LABELS: Record<string, string> = {
  global: '全球',
  cn: '中国大陆',
  tw: '台湾',
  jp: '日本',
  na: '北美',
  eu: '欧洲',
};

export function GuidedChatField({
  field,
  topicChips = [],
  topicPool = [],
  onReshuffleTopics,
  reshuffleDisabled = false,
  reshuffleHint,
  onRetryTopicRecommend,
  submitting = false,
  onAnswer,
  onSkip,
  onSoftPatch,
  contextValues,
}: GuidedChatFieldProps) {
  const { i18n } = useTranslation();
  const appLocale = toAppLang(i18n.language);
  const isSeekVoice = isSeekVoiceFieldName(field.name);
  const showArticleLangTabs = isTopicArticleLangSwitchField(field.name);
  const voiceRegionTabs = useMemo(
    () => (isSeekVoice ? listSeekVoiceRegionsForUi(appLocale) : []),
    [isSeekVoice, appLocale]
  );
  const [voiceRegion, setVoiceRegion] = useState<SeekVoiceRegion>(() =>
    defaultSeekVoiceRegion(toAppLang(i18n.language))
  );
  const [articleLang, setArticleLang] = useState(() => {
    const fromCtx = String(contextValues?.language ?? '').trim();
    if (TOPIC_ARTICLE_LANGS.some((l) => l.id === fromCtx)) return fromCtx;
    return appLocale === 'zh-TW' || appLocale === 'en' || appLocale === 'ja' ? appLocale : 'zh';
  });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedEnums, setSelectedEnums] = useState<string[]>([]);
  const [scaleValue, setScaleValue] = useState(5);
  /** 主观分析：点「自定义」后展开输入 */
  const [analysisCustomOpen, setAnalysisCustomOpen] = useState(false);
  const [docValue, setDocValue] = useState<unknown>('');
  const [voiceValue, setVoiceValue] = useState<unknown>(
    field.defaultObject ?? {
      mode: 'system',
      voice_id: 'female-shaonv',
      label: '少女音色',
    }
  );
  const [hostPersonaDraft, setHostPersonaDraft] = useState(() => {
    return String(contextValues?.host_persona ?? '').trim();
  });
  const [personaSuggesting, setPersonaSuggesting] = useState(false);
  const speakerCountCtx = Number(contextValues?.speaker_count ?? 2) || 2;
  const [castValue, setCastValue] = useState<DialogueCastMember[]>(() =>
    normalizeDialogueCast(
      Array.isArray(contextValues?.cast)
        ? (contextValues!.cast as DialogueCastMember[])
        : undefined,
      speakerCountCtx
    )
  );

  const isTopicArticleVoice = isTopicArticleVoiceIdField(field);
  const isTopicArticleCategory = isTopicArticleVoiceCategoryField(field.name);
  /** 语言 tab 优先；与 softPatch 的 language 对齐 */
  const topicArticleFilterLang = showArticleLangTabs
    ? articleLang
    : String(contextValues?.language ?? articleLang ?? appLocale).trim() || articleLang;
  const topicArticleCategoryPack = useMemo(() => {
    if (!isTopicArticleCategory) return null;
    return writingCategoryEnum({ locale: appLocale });
  }, [isTopicArticleCategory, appLocale]);
  const topicArticleVoicePack = useMemo(() => {
    if (!isTopicArticleVoice) return null;
    const cat = String(contextValues?.voice_category ?? '').trim();
    return writingVoiceEnumForFilter({
      voiceCategory: cat || null,
      language: topicArticleFilterLang,
      locale: appLocale,
    });
  }, [
    isTopicArticleVoice,
    contextValues?.voice_category,
    topicArticleFilterLang,
    appLocale,
  ]);
  const topicArticleLengthPack = useMemo(() => {
    if (field.name !== 'article_length') return null;
    const cat = String(contextValues?.voice_category ?? '').trim();
    if (!cat) return null;
    return lengthsForVoiceCategory(cat, topicArticleFilterLang);
  }, [field.name, contextValues?.voice_category, topicArticleFilterLang]);
  const topicArticleStructurePack = useMemo(() => {
    if (field.name !== 'structure_id') return null;
    const cat = String(contextValues?.voice_category ?? '').trim();
    if (!cat) return null;
    return structuresForVoiceCategory(cat, topicArticleFilterLang);
  }, [field.name, contextValues?.voice_category, topicArticleFilterLang]);
  const enums =
    topicArticleVoicePack?.enum ??
    topicArticleCategoryPack?.enum ??
    topicArticleLengthPack?.enum ??
    topicArticleStructurePack?.enum ??
    field.enum ??
    [];
  /** 行业日报等多选话题 */
  const isTopic = field['x-ui'] === 'topic-chips' || field.name === 'core_topic';
  /** 话题写作：单选推荐话题 + 自定义 */
  const isRecommendTopic =
    field.name === 'topic' || field['x-ui'] === 'recommend-topic';
  const isMainTopic = field['x-ui'] === 'main-topic' || field.name === 'main_topic';
  const isMultiEnum = isMultiEnumField(field);
  const isSubjectiveAnalysis = field.name === 'subjective_analysis';
  const isUpload = isUploadField(field);
  const isDoc = isTextFileOrPasteField(field);
  const isVoice = isMinimaxVoiceField(field);
  const isCast = isDialogueCastField(field);
  const isScale = isScaleField(field);
  const isOutline =
    field.name === 'outline' ||
    field['x-ui'] === 'outline-pre' ||
    field['x-ui-type'] === 'outline';
  const isSupplement = field.name === 'supplement';
  /** 旧业务配置仍把 brief 标必填；有材料时前端按可选处理 */
  const effectivelyRequired =
    Boolean(field.required) && !isBriefSatisfiedBySourceMaterial(field, contextValues);
  const { min: scaleMin, max: scaleMax } = scaleBounds(field);
  const mainTopicCandidates = isMainTopic ? splitJoinedTopics(contextValues?.core_topic) : [];
  const seekVoicePack = useMemo(
    () => (isSeekVoice ? seekVoiceEnumForRegion(voiceRegion) : null),
    [isSeekVoice, voiceRegion]
  );
  const seekVoiceLabelById = useMemo(() => {
    if (!seekVoicePack) return null;
    return new Map(seekVoicePack.enum.map((id, i) => [id, seekVoicePack.labels[i] || id]));
  }, [seekVoicePack]);
  const topicArticleVoiceLabelById = useMemo(() => {
    if (!topicArticleVoicePack) return null;
    return new Map(
      topicArticleVoicePack.enum.map((id, i) => [id, topicArticleVoicePack.labels[i] || id])
    );
  }, [topicArticleVoicePack]);
  const topicArticleCategoryLabelById = useMemo(() => {
    if (!topicArticleCategoryPack) return null;
    return new Map(
      topicArticleCategoryPack.enum.map((id, i) => [
        id,
        topicArticleCategoryPack.labels[i] || id,
      ])
    );
  }, [topicArticleCategoryPack]);

  // App 语言变化时，默认落到对应用户熟悉的文风分组
  useEffect(() => {
    if (!isSeekVoice) return;
    setVoiceRegion(defaultSeekVoiceRegion(appLocale));
  }, [isSeekVoice, appLocale]);

  useEffect(() => {
    if (!showArticleLangTabs) return;
    const fromCtx = String(contextValues?.language ?? '').trim();
    if (TOPIC_ARTICLE_LANGS.some((l) => l.id === fromCtx) && fromCtx !== articleLang) {
      setArticleLang(fromCtx);
    }
    // 仅在上下文 language 变化时同步；避免与本地切换打架
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [showArticleLangTabs, contextValues?.language]);

  // 回显：已选知识库文风卡时展开挂卡区
  useEffect(() => {
    if (!isTopicArticleVoice) return;
    if (isKbWritingVoiceId(String(contextValues?.voice_id ?? ''))) {
      setCustomOpen(true);
      const folder = String(contextValues?.writing_folder_id ?? '').trim();
      if (folder) {
        setExtra((p) => ({ ...p, writing_folder_id: folder }));
      }
    }
  }, [isTopicArticleVoice, contextValues?.voice_id, contextValues?.writing_folder_id]);

  // industry/style/article_structure「其他」、usage_direction「custom」、date_mode「指定日期/custom」与「自定义…」重复，只保留自定义入口
  const chips = (
    isScale || isSubjectiveAnalysis || isDoc || isVoice || isCast
      ? []
      : isMainTopic
        ? mainTopicCandidates
        : (isTopic || isRecommendTopic) && topicChips.length > 0
          ? topicChips
          : isSeekVoice && seekVoicePack
            ? seekVoicePack.enum
            : enums
  ).filter((chip) => {
    if (isTopic || isMainTopic || isMultiEnum) return true;
    if (isKbWritingVoiceId(chip)) return false;
    if (
      (field.name === 'industry' || field.name === 'style' || field.name === 'article_structure') &&
      (chip === '其他' || chip === '其它')
    ) {
      return false;
    }
    if (field.name === 'usage_direction' && (chip === 'custom' || chip === '自定义…')) {
      return false;
    }
    if (field.name === 'date_mode' && (chip === '指定日期' || chip === 'custom')) {
      return false;
    }
    return true;
  });
  const seekVoiceOtherSelected =
    isSeekVoice && seekVoicePack
      ? selectedEnums.filter((id) => !seekVoicePack.enum.includes(id))
      : [];

  // 当前字段对应的「其他」补充字段名 + 已选枚举
  const OTHER_PAIR: Record<string, string> = {
    industry: 'industry_custom',
    style: 'style_custom',
    article_structure: 'article_structure_custom',
    usage_direction: 'usage_direction_custom',
  };
  const otherField = OTHER_PAIR[field.name];
  const otherSelected = otherField
    ? field.name === 'usage_direction'
      ? String(contextValues?.[field.name] ?? '').trim() === 'custom'
      : String(contextValues?.[field.name] ?? '').trim() === '其他'
    : false;
  const otherFieldTitle =
    otherField === 'article_structure_custom'
      ? '自定义结构说明'
      : otherField === 'style_custom'
        ? '自定义语气'
      : otherField === 'industry_custom'
          ? '自定义行业'
          : otherField === 'usage_direction_custom'
            ? '自定义使用方向'
            : null;

  const prompt = isMainTopic
    ? userFacingCopy(field.description, '从已选话题中指定一条主线；跳过则由系统按热度自动选取。')
    : isRecommendTopic
      ? userFacingCopy(
          field.description,
          '点选写作选题，或在下方自填；推荐随类别与风格变化。'
        )
      : isTopic
      ? userFacingCopy(
          field.description,
          '可多选具体事件；一条检索可能对应多条。点选后点「确认选题」，也可手写补充。'
        )
      : isSubjectiveAnalysis
        ? userFacingCopy(
            field.description,
            '默认无主观评论（纯报道）；也可选一种分析口吻，或自定义说明。'
          )
      : isOutline
        ? userFacingCopy(
            field.description,
            '改标题或各节内容后确认即可；确认后成稿会按这份大纲写。'
          )
      : isScale
        ? userFacingCopy(field.description, `拖动滑杆选择「${field.title || field.name}」`)
        : isMultiEnum
          ? userFacingCopy(
              field.description,
              isSeekVoice
                ? '按语言分组浏览文风；可跨组多选，点选后点确认继续'
                : `可多选「${field.title || field.name}」；点选后点确认继续`
            )
        : isTopicArticleVoice
          ? userFacingCopy(
              field.description,
              '点选平台参考风格，或不选内置、改用自己的语感文风卡'
            )
        : isDoc
          ? userFacingCopy(
              field.description,
              '可从知识库选取、上传文件，或直接粘贴要转成口播的正文。'
            )
          : isVoice
            ? userFacingCopy(field.description, '选择系统音色，或录制/上传音频克隆专属音色。')
        : field.name === 'brief' && hasSourceMaterialContext(contextValues)
          ? userFacingCopy(
              field.description,
              '已有材料时可直接发送跳过；系统会从上传文档归纳。若有重点、禁忌或页数偏好可在此补充。'
            )
        : userFacingCopy(field.description, `请选择或填写「${field.title || field.name}」`);

  const placeholder =
    field.placeholder ||
    (isTopic
      ? '可补充自定义话题；与上方多选合并提交'
      : isMultiEnum
        ? '点选上方选项后确认'
      : isSubjectiveAnalysis
        ? '例：略带讽刺但不人身攻击 / 偏投资人视角'
      : field.name === 'style'
        ? '写几句语气偏好，或输入 @ 选择语感文风'
        : '输入自定义内容…');

  // 「其他」补充输入框的占位
  const otherPlaceholder =
    otherField === 'article_structure_custom'
      ? '例：主线详写 → 短讯带过 → 收束展望'
      : otherField === 'style_custom'
        ? '写几句语气偏好，或输入 @ 选择语感文风'
        : otherField === 'industry_custom'
          ? '例：储能 / 出海 / 短剧'
          : '输入自定义内容…';

  useEffect(() => {
    setCustomOpen(false);
    setAnalysisCustomOpen(false);
    setExtra({});
    setError(null);
    setSelectedTopics([]);
    const defArr = Array.isArray(field.defaultArray)
      ? field.defaultArray.map(String).filter(Boolean)
      : [];
    setSelectedEnums(defArr);
    // 布尔默认值不要塞进自由输入（否则会出现 "false"）
    if (field.name === 'subjective_analysis' || field.type === 'boolean' || isMultiEnumField(field)) {
      setCustomText('');
    } else {
      setCustomText(field.default != null ? String(field.default) : '');
    }
    if (isScaleField(field)) {
      const { min, max } = scaleBounds(field);
      const raw = Number(field.default);
      const next = Number.isFinite(raw) ? Math.round(raw) : Math.round((min + max) / 2);
      setScaleValue(Math.min(max, Math.max(min, next)));
    }
    setDocValue('');
    setVoiceValue(
      field.defaultObject ?? {
        mode: 'system',
        voice_id: 'female-shaonv',
        label: '少女音色',
      }
    );
  }, [field.name, field.default, field.defaultArray, field.defaultObject, field.minimum, field.maximum, field['x-ui-type'], field.type]);

  useGSAP(
    () => {
      const el = panelRef.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' });
    },
    { dependencies: [field.name] }
  );

  const commit = (value: unknown, displayText: string, patch: Record<string, unknown> = {}) => {
    if (effectivelyRequired) {
      if (value == null) {
        setError(`请完成「${field.title || field.name}」`);
        return;
      }
      if (typeof value === 'string' && !value.trim()) {
        setError(`请完成「${field.title || field.name}」`);
        return;
      }
      if (Array.isArray(value) && value.length === 0) {
        setError(`请至少选择一项「${field.title || field.name}」`);
        return;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        const o = value as Record<string, unknown>;
        if (isTextFileOrPasteField(field) && !String(o.text ?? '').trim()) {
          setError(`请完成「${field.title || field.name}」`);
          return;
        }
        if (isMinimaxVoiceField(field) && !String(o.voice_id ?? '').trim()) {
          setError(`请完成「${field.title || field.name}」`);
          return;
        }
      }
    }
    if (field.name === 'industry' && String(value) === '其他') {
      const c = String(patch.industry_custom ?? extra.industry_custom ?? '').trim();
      if (!c) {
        setError('选「其他」时请填写自定义行业');
        setCustomOpen(true);
        return;
      }
      onAnswer({ [field.name]: value, industry_custom: c, ...patch }, c);
      return;
    }
    if (field.name === 'usage_direction' && String(value) === 'custom') {
      const c = String(patch.usage_direction_custom ?? extra.usage_direction_custom ?? '').trim();
      if (!c) {
        setError('请填写自定义使用方向');
        setCustomOpen(true);
        return;
      }
      onAnswer({ [field.name]: value, usage_direction_custom: c, ...patch }, c);
      return;
    }
    if (field.name === 'date_mode' && (String(value) === 'custom' || String(value) === '指定日期')) {
      const d = String(patch.report_date ?? extra.report_date ?? '').trim();
      if (!d) {
        setError('请填写日期，如 7月22日 或 2026-07-22');
        setCustomOpen(true);
        return;
      }
      // 后端检索节点会把自然语言规范成 YYYY-MM-DD，前端不强制格式
      onAnswer({ [field.name]: 'custom', report_date: d, ...patch }, d);
      return;
    }
    if (field.name === 'date_mode') {
      const mapped =
        value === '今日' || value === 'today'
          ? 'today'
          : value === '昨日' || value === 'yesterday'
            ? 'yesterday'
            : String(value);
      const label =
        mapped === 'today' ? '今日' : mapped === 'yesterday' ? '昨日' : displayText;
      onAnswer({ [field.name]: mapped, ...patch }, label);
      return;
    }
    if (field.name === 'search_region') {
      const raw = String(value ?? '').trim();
      const mapped = SEARCH_REGION_TO_KEY[raw] || SEARCH_REGION_TO_KEY[raw.toLowerCase()] || 'global';
      const label = SEARCH_REGION_LABELS[mapped] || mapped;
      onAnswer({ [field.name]: mapped, ...patch }, label);
      return;
    }
    if (field.name === 'style' && String(value) === '其他') {
      const c = String(patch.style_custom ?? extra.style_custom ?? customText).trim();
      const folder = String(
        patch.writing_folder_id ?? extra.writing_folder_id ?? contextValues?.writing_folder_id ?? ''
      ).trim();
      if (!c && !folder) {
        setError('请写一句语气偏好，或用 @ / 推荐选择语感文风');
        setCustomOpen(true);
        return;
      }
      const display = c || '已选语感文风';
      onAnswer(
        {
          [field.name]: value,
          style_custom: c,
          ...(folder ? { writing_folder_id: folder } : { writing_folder_id: '' }),
          ...patch,
        },
        display
      );
      return;
    }
    if (field.name === 'article_structure' && String(value) === '其他') {
      const c = String(patch.article_structure_custom ?? extra.article_structure_custom ?? customText).trim();
      if (!c) {
        setError('选「其他」时需补充结构要求');
        setCustomOpen(true);
        return;
      }
      onAnswer({ [field.name]: value, article_structure_custom: c, ...patch }, c);
      return;
    }
    onAnswer({ [field.name]: value, ...patch }, displayText);
  };

  const commitTopics = () => {
    const joined = joinSelectedTopics(selectedTopics, customText);
    if (!joined) {
      if (!field.required) {
        onSkip?.();
        return;
      }
      setError('请至少点选一个话题，或填写自定义话题');
      return;
    }
    const display =
      selectedTopics.length > 1
        ? `已选 ${selectedTopics.length} 个话题${customText.trim() ? '（含自定义）' : ''}`
        : joined.length > 48
          ? `${joined.slice(0, 46)}…`
          : joined;
    commit(joined, display);
  };

  const commitMultiEnum = () => {
    const max = typeof field.maxItems === 'number' && field.maxItems > 0 ? field.maxItems : 99;
    const min = typeof field.minItems === 'number' && field.minItems > 0 ? field.minItems : 1;
    let picked = selectedEnums.slice(0, max);
    if (picked.length < min) {
      if (!field.required && picked.length === 0) {
        onSkip?.();
        return;
      }
      setError(`请至少选择 ${min} 项「${field.title || field.name}」`);
      return;
    }
    const labels = picked.map((id) => {
      if (isSeekVoice) return seekVoiceDisplayLabel(id, appLocale);
      const idx = enums.indexOf(id);
      return (idx >= 0 ? field['x-enum-labels']?.[idx] : undefined) || id;
    });
    const display =
      picked.length <= 2
        ? labels.join('、')
        : `已选 ${picked.length} 种：${labels.slice(0, 2).join('、')}…`;
    commit(picked, display);
  };

  const toggleEnumChip = (chip: string) => {
    setError(null);
    setSelectedEnums((prev) => {
      if (prev.includes(chip)) return prev.filter((x) => x !== chip);
      const max = typeof field.maxItems === 'number' && field.maxItems > 0 ? field.maxItems : 99;
      if (prev.length >= max) {
        setError(`最多选择 ${max} 项`);
        return prev;
      }
      return [...prev, chip];
    });
  };

  const commitOutline = (parsed: {
    title: string;
    sections: Array<{ heading: string; intent: string; notes?: string }>;
  }) => {
    const display = parsed.title
      ? `大纲 · ${parsed.title}`
      : `大纲 · ${parsed.sections.length} 节`;
    commit(parsed, display);
  };

  const sendCustom = () => {
    if (isOutline) {
      return;
    }
    if (isSupplement) {
      const t = customText.trim();
      commit(t, t ? `补充 · ${t.slice(0, 40)}` : '无补充说明');
      return;
    }
    if (isMultiEnum) {
      commitMultiEnum();
      return;
    }
    if (isTopic) {
      commitTopics();
      return;
    }
    const t = customText.trim();
    const styleFolder = String(extra.writing_folder_id ?? '').trim();
    if (isTopicArticleVoice) {
      if (!styleFolder) {
        setError('请点选一张就绪的语感文风卡');
        return;
      }
      const folderName = String(extra._writing_folder_name ?? '').trim();
      commit(KB_WRITING_VOICE_ID, folderName || '已选文风卡', {
        writing_folder_id: styleFolder,
        ...(showArticleLangTabs ? { language: articleLang } : {}),
      });
      return;
    }
    if (field.name === 'style' && !t && styleFolder) {
      commit('其他', '已选语感文风', {
        style_custom: '',
        writing_folder_id: styleFolder,
      });
      return;
    }
    if (!t && isBriefSatisfiedBySourceMaterial(field, contextValues)) {
      const n = sourceMaterialTextLength(contextValues);
      commit('', `按已有材料自动归纳（${n} 字）`);
      return;
    }
    if (!t && effectivelyRequired) {
      setError('请输入内容');
      return;
    }
    if (!t && !effectivelyRequired) {
      onSkip?.();
      return;
    }
    if (isRecommendTopic) {
      commit(t, t.length > 48 ? `${t.slice(0, 46)}…` : t, { topic_source: 'user' });
      return;
    }
    // 「自定义」入口：枚举字段必须落成「其他」+ *_custom，不能把自由文本写进 enum 字段（否则 JSON Schema 校验失败）
    if (field.name === 'industry') {
      commit('其他', t, { industry_custom: t });
      return;
    }
    if (field.name === 'usage_direction') {
      if (!t) {
        setError('请填写自定义使用方向');
        return;
      }
      commit('custom', t, { usage_direction_custom: t });
      return;
    }
    if (field.name === 'style') {
      commit('其他', t || '已选语感文风', {
        style_custom: t,
        writing_folder_id: styleFolder,
      });
      return;
    }
    if (field.name === 'article_structure') {
      commit('其他', t, { article_structure_custom: t });
      return;
    }
    if (field.name === 'subjective_analysis') {
      if (!t) {
        setError('请写一句分析口吻，或改选上方预设');
        return;
      }
      commit(true, t, { analysis_stance: t });
      setAnalysisCustomOpen(false);
      return;
    }
    commit(t, t);
  };

  const toggleTopic = (chip: string) => {
    setError(null);
    setSelectedTopics((prev) =>
      prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]
    );
  };

  const commitScale = () => {
    const n = Math.min(scaleMax, Math.max(scaleMin, Math.round(scaleValue)));
    const hint = scaleLabel(field, n);
    commit(n, `${n} · ${hint}`);
  };

  return (
    <div ref={panelRef} className="guided-chat-field">
      <div className="guided-chat-field__assistant" role="status">
        <p className="guided-chat-field__title">
          {field.title || field.name}
          {effectivelyRequired ? <span className="guided-chat-field__req">*</span> : null}
        </p>
        <p className="guided-chat-field__prompt">{prompt}</p>
      </div>

      {isOutline ? (
        <TopicOutlineEditor
          key={`outline-editor-${String((field.defaultObject as { title?: string } | undefined)?.title ?? '')}-${
            Array.isArray((field.defaultObject as { sections?: unknown[] } | undefined)?.sections)
              ? (field.defaultObject as { sections: unknown[] }).sections.length
              : 0
          }`}
          value={field.defaultObject ?? contextValues?.outline}
          disabled={submitting}
          onError={(msg) => setError(msg)}
          onConfirm={(outline) => {
            setError(null);
            commitOutline(outline);
          }}
        />
      ) : null}

      {isScale ? (
        <div className="guided-chat-field__scale" role="group" aria-label={field.title || field.name}>
          <div className="guided-chat-field__scale-readout" aria-live="polite">
            <span className="guided-chat-field__scale-num">{scaleValue}</span>
            <span className="guided-chat-field__scale-hint">{scaleLabel(field, scaleValue)}</span>
          </div>
          <Slider
            min={scaleMin}
            max={scaleMax}
            step={1}
            value={scaleValue}
            disabled={submitting}
            tooltip={{ open: false }}
            onChange={(v) => {
              setError(null);
              setScaleValue(typeof v === 'number' ? v : scaleMin);
            }}
          />
          <div className="guided-chat-field__scale-ends">
            <span>{scaleMin}</span>
            <span>{scaleMax}</span>
          </div>
          <button
            type="button"
            className="guided-chat-field__confirm-topics"
            disabled={submitting}
            onClick={() => commitScale()}
          >
            确认 · {scaleValue}
          </button>
        </div>
      ) : null}

      {isSubjectiveAnalysis ? (
        <div
          className="guided-chat-field__chips"
          role="listbox"
          aria-label={field.title || field.name}
        >
          {ANALYSIS_MODE_OPTIONS.map((opt) => {
            const selected =
              !analysisCustomOpen &&
              (opt.off
                ? contextValues?.subjective_analysis !== true &&
                  contextValues?.subjective_analysis !== 'true'
                : String(contextValues?.analysis_stance ?? '') === opt.value);
            return (
              <button
                key={opt.off ? 'off' : opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? 'guided-chat-field__chip guided-chat-field__chip--selected'
                    : 'guided-chat-field__chip'
                }
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  setAnalysisCustomOpen(false);
                  if (opt.off) {
                    commit(false, '无主观评论', { analysis_stance: '' });
                    return;
                  }
                  commit(true, opt.label, { analysis_stance: opt.value });
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={analysisCustomOpen}
            className={
              analysisCustomOpen
                ? 'guided-chat-field__chip guided-chat-field__chip--selected'
                : 'guided-chat-field__chip'
            }
            disabled={submitting}
            onClick={() => {
              setError(null);
              setAnalysisCustomOpen(true);
              setCustomText('');
            }}
          >
            自定义…
          </button>
        </div>
      ) : null}

      {isDoc ? (
        <div className="guided-chat-field__media-block">
          <TextFileOrPasteField
            value={docValue}
            maxChars={field['x-max-chars']}
            embedded
            rows={4}
            onChange={(next) => {
              setDocValue(next);
              setError(null);
            }}
          />
          <button
            type="button"
            className="guided-chat-field__confirm-topics"
            style={{ marginTop: 12 }}
            disabled={submitting}
            onClick={() => {
              const text =
                docValue && typeof docValue === 'object' && !Array.isArray(docValue)
                  ? String((docValue as { text?: string }).text ?? '').trim()
                  : typeof docValue === 'string'
                    ? docValue.trim()
                    : '';
              if (!text) {
                setError('请粘贴或上传口播文档');
                return;
              }
              const mode =
                docValue && typeof docValue === 'object'
                  ? String((docValue as { mode?: string }).mode ?? 'paste')
                  : 'paste';
              const label =
                mode === 'file'
                  ? `已上传文件（${text.length} 字）`
                  : mode === 'knowledge'
                    ? `已选自知识库（${text.length} 字）`
                    : `已粘贴文本（${text.length} 字）`;
              commit(docValue, label);
            }}
          >
            确认文档
          </button>
        </div>
      ) : null}

      {isVoice ? (
        <div className="guided-chat-field__media-block">
          <MinimaxVoiceField
            value={voiceValue}
            voiceModel={field['x-voice-model'] || 'speech-2.8-hd'}
            onChange={(next) => {
              setVoiceValue(next);
              setError(null);
            }}
            onPersonaSuggest={(persona, meta) => {
              if (meta?.status === 'loading') {
                setHostPersonaDraft((prev) => prev); // 保持原值，下方 placeholder 提示生成中
                setPersonaSuggesting(true);
                return;
              }
              setPersonaSuggesting(false);
              setHostPersonaDraft(persona);
            }}
          />
          <label className="guided-chat-field__persona-label" style={{ display: 'block', marginTop: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
              主播人设（可选，选音色后由模型生成草稿；可改）
              {personaSuggesting ? ' · 生成中…' : ''}
            </span>
            <Input.TextArea
              value={hostPersonaDraft}
              onChange={(e) => setHostPersonaDraft(e.target.value)}
              rows={3}
              placeholder="性格、常用语气词、口头语。角色卡会带入；系统音色由模型根据名称/描述生成；没有就留空。"
              style={{ marginTop: 6 }}
            />
          </label>
          <button
            type="button"
            className="guided-chat-field__confirm-topics"
            style={{ marginTop: 12 }}
            disabled={submitting}
            onClick={() => {
              const v =
                voiceValue && typeof voiceValue === 'object' && !Array.isArray(voiceValue)
                  ? (voiceValue as { voice_id?: string; label?: string })
                  : null;
              const vid = String(v?.voice_id ?? '').trim();
              if (!vid) {
                setError('请选择或克隆一个音色');
                return;
              }
              const persona = hostPersonaDraft.trim();
              commit(voiceValue, v?.label?.trim() || vid, {
                host_persona: persona,
              });
            }}
          >
            确认音色
          </button>
        </div>
      ) : null}

      {isCast ? (
        <div className="guided-chat-field__media-block">
          <DialogueCastField
            value={castValue}
            speakerCount={speakerCountCtx}
            disabled={submitting}
            onChange={(next) => {
              setCastValue(next);
              setError(null);
            }}
          />
          <button
            type="button"
            className="guided-chat-field__confirm-topics"
            style={{ marginTop: 12 }}
            disabled={submitting}
            onClick={() => {
              const normalized = normalizeDialogueCast(castValue, speakerCountCtx);
              const missing = normalized.find((m) => !String(m.voice?.voice_id ?? '').trim());
              if (missing) {
                setError(`请为「${missing.name}」选择音色`);
                return;
              }
              commit(
                normalized,
                normalized.map((m) => m.name).join('、'),
                { speaker_count: normalized.length, cast: normalized }
              );
            }}
          >
            确认角色与音色
          </button>
        </div>
      ) : null}

      {!isOutline &&
      !isUpload &&
      !isScale &&
      !isSubjectiveAnalysis &&
      !isDoc &&
      !isVoice &&
      !isCast &&
      (chips.length > 0 || isSeekVoice) ? (
        <div>
          {isSeekVoice && voiceRegionTabs.length > 0 ? (
            <div
              className="guided-chat-field__region-tabs"
              role="tablist"
              aria-label="文风语言分组"
            >
              {voiceRegionTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={voiceRegion === tab.id}
                  className={
                    voiceRegion === tab.id
                      ? 'guided-chat-field__region-tab guided-chat-field__region-tab--active'
                      : 'guided-chat-field__region-tab'
                  }
                  disabled={submitting}
                  onClick={() => setVoiceRegion(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
          {showArticleLangTabs ? (
            <div
              className="guided-chat-field__region-tabs"
              role="tablist"
              aria-label="成稿语言"
            >
              {TOPIC_ARTICLE_LANGS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={articleLang === tab.id}
                  className={
                    articleLang === tab.id
                      ? 'guided-chat-field__region-tab guided-chat-field__region-tab--active'
                      : 'guided-chat-field__region-tab'
                  }
                  disabled={submitting}
                  onClick={() => {
                    setArticleLang(tab.id);
                    onSoftPatch?.({ language: tab.id });
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
          {isTopic
            ? (() => {
                const poolSet = new Set(
                  (topicPool.length > 0 ? topicPool : topicChips).map((t) => t.trim()).filter(Boolean)
                );
                const otherBatch = selectedTopics.filter(
                  (x) => poolSet.has(x) && !topicChips.includes(x)
                );
                if (otherBatch.length === 0) return null;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>已选（其它批次）</div>
                    <div className="guided-chat-field__chips" role="group" aria-label="已选其它批次">
                      {otherBatch.map((chip) => (
                        <button
                          key={`sel-${chip}`}
                          type="button"
                          className="guided-chat-field__chip guided-chat-field__chip--selected"
                          disabled={submitting}
                          onClick={() => toggleTopic(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            : null}
          {seekVoiceOtherSelected.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>已选（其它语言）</div>
              <div className="guided-chat-field__chips" role="group" aria-label="已选其它语言文风">
                {seekVoiceOtherSelected.map((chip) => (
                  <button
                    key={`voice-sel-${chip}`}
                    type="button"
                    className="guided-chat-field__chip guided-chat-field__chip--selected"
                    disabled={submitting}
                    onClick={() => toggleEnumChip(chip)}
                  >
                    {seekVoiceDisplayLabel(chip, appLocale)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div
            className="guided-chat-field__chips"
            role={isTopic || isMultiEnum ? 'group' : 'listbox'}
            aria-label={field.title || field.name}
            aria-multiselectable={isTopic || isMultiEnum || undefined}
          >
          {chips.map((chip) => {
            const selected =
              (isTopic && selectedTopics.includes(chip)) ||
              (isMultiEnum && selectedEnums.includes(chip));
            const purposePackLabel = (() => {
              const pack = topicArticleLengthPack || topicArticleStructurePack;
              if (!pack) return undefined;
              const idx = pack.enum.indexOf(chip);
              return idx >= 0 ? pack.labels[idx] : undefined;
            })();
            const enumLabel = isSeekVoice
              ? seekVoiceLabelById?.get(chip) || seekVoiceDisplayLabel(chip, appLocale)
              : isTopicArticleVoice
                ? topicArticleVoiceLabelById?.get(chip) ||
                  writingVoiceChipLabel(chip, topicArticleFilterLang as typeof appLocale)
                : isTopicArticleCategory
                  ? topicArticleCategoryLabelById?.get(chip) || chip
                  : purposePackLabel ||
                    (() => {
                      const fullIdx = (field.enum ?? []).indexOf(chip);
                      if (fullIdx >= 0 && field['x-enum-labels']?.[fullIdx]) {
                        return field['x-enum-labels'][fullIdx];
                      }
                      return undefined;
                    })();
            const label =
              enumLabel ||
              (field.name === 'language'
                ? LANGUAGE_LABELS[chip] || chip
                : field.name === 'search_region'
                  ? SEARCH_REGION_LABELS[chip] || chip
                  : chip);
            return (
              <button
                key={chip}
                type="button"
                role={isTopic || isMultiEnum ? 'checkbox' : 'option'}
                aria-checked={isTopic || isMultiEnum ? selected : undefined}
                className={
                  selected
                    ? 'guided-chat-field__chip guided-chat-field__chip--selected'
                    : 'guided-chat-field__chip'
                }
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  if (isTopic) {
                    toggleTopic(chip);
                    return;
                  }
                  if (isRecommendTopic) {
                    commit(chip, chip.length > 48 ? `${chip.slice(0, 46)}…` : chip, {
                      topic_source: 'recommend',
                    });
                    return;
                  }
                  // 写作风格：单选即提交，禁止走多选确认
                  if (isTopicArticleVoice || isTopicArticleCategory) {
                    commit(
                      chip,
                      label,
                      showArticleLangTabs
                        ? { language: articleLang, writing_folder_id: '' }
                        : { writing_folder_id: '' }
                    );
                    return;
                  }
                  if (isMultiEnum) {
                    toggleEnumChip(chip);
                    return;
                  }
                  if (field.name === 'date_mode') {
                    const mapped =
                      chip === '今日' || chip === 'today'
                        ? 'today'
                        : chip === '昨日' || chip === 'yesterday'
                          ? 'yesterday'
                          : chip;
                    const labelDate =
                      mapped === 'today' ? '今日' : mapped === 'yesterday' ? '昨日' : chip;
                    commit(mapped, labelDate);
                    return;
                  }
                  if (field.name === 'search_region') {
                    const mapped =
                      SEARCH_REGION_TO_KEY[chip] ||
                      SEARCH_REGION_TO_KEY[chip.toLowerCase()] ||
                      'global';
                    commit(mapped, SEARCH_REGION_LABELS[mapped] || mapped);
                    return;
                  }
                  if (field.name === 'style' && chip !== '其他') {
                    commit(chip, label, { style_custom: '', writing_folder_id: '' });
                    return;
                  }
                  if (showArticleLangTabs) {
                    commit(chip, label, { language: articleLang });
                    return;
                  }
                  commit(chip, label);
                }}
              >
                {label}
              </button>
            );
          })}
          {isTopicArticleVoice && chips.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.5, padding: '4px 2px 8px' }}>
              {String(contextValues?.voice_category ?? '').trim()
                ? '当前语言下该类别暂无系统风格，请切换上方语言，或返回改选类别。'
                : '请先选择类别方向。'}
            </div>
          ) : null}
          {isRecommendTopic && chips.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.55, padding: '8px 2px 12px' }}>
              <p style={{ margin: '0 0 10px' }}>
                还没有写作选题列表。请先完成检索与生成；成功后即可点选，也可再自填。
              </p>
              {onRetryTopicRecommend ? (
                <button
                  type="button"
                  className="guided-chat-field__confirm-topics"
                  disabled={submitting}
                  onClick={() => onRetryTopicRecommend()}
                >
                  重新检索写作选题
                </button>
              ) : null}
            </div>
          ) : null}
          {!isTopic &&
          !isRecommendTopic &&
          !isMainTopic &&
          !isMultiEnum &&
          field.name !== 'broadcast_style' &&
          // 话题写作等封闭枚举：只点选 chips；写作风格额外开放「我的文风卡」
          !(
            chips.length > 0 &&
            (field.name === 'voice_category' ||
              field.name === 'purpose' ||
              field.name === 'article_length' ||
              field.name === 'structure_id' ||
              field.name === 'plan_id' ||
              (field.name === 'voice_id' && !isTopicArticleVoice))
          ) ? (
            <button
              type="button"
              className={
                isTopicArticleVoice &&
                (customOpen || isKbWritingVoiceId(String(contextValues?.voice_id ?? '')))
                  ? 'guided-chat-field__chip guided-chat-field__chip--custom guided-chat-field__chip--selected'
                  : 'guided-chat-field__chip guided-chat-field__chip--custom'
              }
              disabled={submitting}
              onClick={() => {
                setCustomOpen(true);
                setError(null);
                if (field.name === 'date_mode') {
                  setExtra((p) => ({ ...p, _pending: 'custom' }));
                }
              }}
            >
              {isTopicArticleVoice ? '我的文风卡' : '自定义…'}
            </button>
          ) : null}
        </div>
          {(isTopic || isRecommendTopic) && onReshuffleTopics ? (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="guided-chat-field__skip"
                disabled={submitting || reshuffleDisabled}
                onClick={() => onReshuffleTopics()}
              >
                换一批
              </button>
              {reshuffleHint ? (
                <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 8 }}>{reshuffleHint}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 「其他」选中时内联展开；语气风格用 @ 选卡 + 推荐，禁止裸挂卡框 */}
      {otherField && otherSelected ? (
        <div
          className="guided-chat-field__custom-inline"
          role="group"
          aria-label={otherFieldTitle ?? otherField}
        >
          <label className="guided-chat-field__custom-inline-label">
            {otherFieldTitle}
            <span className="guided-chat-field__custom-inline-required">
              {otherField === 'style_custom' ? '语气或文风至少一项' : '必填'}
            </span>
          </label>
          {otherField === 'style_custom' ? (
            <>
              <FolderCardAtField
                cardTag="writing"
                withText
                textValue={String(extra.style_custom ?? customText ?? '')}
                onTextChange={(v) => {
                  setCustomText(v);
                  setExtra((p) => ({ ...p, style_custom: v }));
                  setError(null);
                }}
                value={
                  String(extra.writing_folder_id ?? contextValues?.writing_folder_id ?? '').trim() ||
                  null
                }
                onChange={(id) => {
                  setError(null);
                  setExtra((p) => ({ ...p, writing_folder_id: id ?? '' }));
                }}
                textRecommendations={STYLE_TONE_RECS}
                textPlaceholder={otherPlaceholder}
                disabled={submitting}
              />
              <button
                type="button"
                className="guided-chat-field__confirm-topics"
                style={{ marginTop: 10 }}
                disabled={submitting}
                onClick={() =>
                  commit('其他', customText.trim() || '已选语感文风', {
                    style_custom: customText.trim(),
                    writing_folder_id: String(extra.writing_folder_id ?? '').trim(),
                  })
                }
              >
                确认自定义语气
              </button>
            </>
          ) : (
            <>
              <Input.TextArea
                variant="borderless"
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder={otherPlaceholder}
                value={
                  otherField === 'article_structure_custom'
                    ? String(extra.article_structure_custom ?? customText ?? '')
                    : String(extra.industry_custom ?? customText ?? '')
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomText(v);
                  if (otherField === 'article_structure_custom') {
                    setExtra((p) => ({ ...p, article_structure_custom: v }));
                  } else {
                    setExtra((p) => ({ ...p, industry_custom: v }));
                  }
                }}
              />
              <p className="guided-chat-field__custom-inline-hint">
                {otherField === 'article_structure_custom'
                  ? '说明详略与段落节奏即可，骨架仍是行业日报。'
                  : '补充具体行业名，便于检索与归类'}
              </p>
            </>
          )}
        </div>
      ) : null}

      {isTopic && (selectedTopics.length > 0 || customText.trim()) ? (
        <p className="guided-chat-field__selection-hint">
          已选 {selectedTopics.length} 条
          {customText.trim() ? ' + 自定义' : ''}
          {selectedTopics.length > 0 ? `：${selectedTopics.slice(0, 2).join('；')}${selectedTopics.length > 2 ? '…' : ''}` : ''}
        </p>
      ) : null}

      {isMultiEnum && selectedEnums.length > 0 ? (
        <p className="guided-chat-field__selection-hint">
          已选 {selectedEnums.length} 种
          {typeof field.maxItems === 'number' ? `（最多 ${field.maxItems}）` : ''}
          ：
          {selectedEnums
            .slice(0, 3)
            .map((id) => {
              if (isSeekVoice) return seekVoiceDisplayLabel(id, appLocale);
              if (isTopicArticleVoice) {
                return (
                  topicArticleVoiceLabelById?.get(id) ||
                  writingVoiceChipLabel(id, topicArticleFilterLang as typeof appLocale)
                );
              }
              // 按 id 在全量 enum 中定位，避免过滤后下标错位
              const fullIdx = (field.enum ?? []).indexOf(id);
              if (fullIdx >= 0 && field['x-enum-labels']?.[fullIdx]) {
                return field['x-enum-labels'][fullIdx]!;
              }
              return id;
            })
            .join('；')}
          {selectedEnums.length > 3 ? '…' : ''}
        </p>
      ) : null}

      {isUpload ? (
        <Upload
          beforeUpload={() => false}
          maxCount={1}
          onChange={(info) => {
            const file = info.fileList[0]?.originFileObj;
            if (file) commit(file, file.name);
          }}
        >
          <Button disabled={submitting}>选择文件</Button>
        </Upload>
      ) : null}

      {!isOutline &&
      !isScale &&
      !isUpload &&
      !isDoc &&
      !isVoice &&
      !isMultiEnum &&
      !(otherField && otherSelected) &&
      (isSubjectiveAnalysis
        ? analysisCustomOpen
        : // 推荐话题：必须先有检索列表，才开放自定义（禁止空列表直接手填）
          isRecommendTopic
          ? chips.length > 0
          : isTopicArticleVoice
            ? customOpen
          : customOpen ||
            (chips.length === 0 && !isSubjectiveAnalysis) ||
            isTopic) ? (
        field.name === 'style' && customOpen ? (
          <div className="guided-chat-field__custom-inline">
            <FolderCardAtField
              cardTag="writing"
              withText
              textValue={customText}
              onTextChange={(v) => {
                setCustomText(v);
                setExtra((p) => ({ ...p, style_custom: v }));
                setError(null);
              }}
              value={String(extra.writing_folder_id ?? '').trim() || null}
              onChange={(id) => {
                setError(null);
                setExtra((p) => ({ ...p, writing_folder_id: id ?? '' }));
              }}
              textRecommendations={STYLE_TONE_RECS}
              textPlaceholder={placeholder}
              disabled={submitting}
              autoFocus
            />
            <button
              type="button"
              className="guided-chat-field__confirm-topics"
              style={{ marginTop: 10 }}
              disabled={submitting}
              onClick={() => sendCustom()}
            >
              确认自定义语气
            </button>
          </div>
        ) : isTopicArticleVoice && customOpen ? (
          <div
            className="guided-chat-field__custom-inline"
            role="group"
            aria-label="我的文风卡"
          >
            <label className="guided-chat-field__custom-inline-label">
              挂载语感文风
              <span className="guided-chat-field__custom-inline-required">点选一张就绪卡</span>
            </label>
            <FolderCardAtField
              cardTag="writing"
              mode="pick"
              value={
                String(extra.writing_folder_id ?? contextValues?.writing_folder_id ?? '').trim() ||
                null
              }
              onChange={(id, folder) => {
                setError(null);
                setExtra((p) => ({
                  ...p,
                  writing_folder_id: id ?? '',
                  _writing_folder_name: folder?.name ?? '',
                }));
              }}
              disabled={submitting}
              autoFocus
            />
            <button
              type="button"
              className="guided-chat-field__confirm-topics"
              style={{ marginTop: 10 }}
              disabled={submitting}
              onClick={() => sendCustom()}
            >
              确认使用文风卡
            </button>
          </div>
        ) : (
          <div className="guided-chat-field__composer">
            {field.name === 'date_mode' && extra._pending === 'custom' ? (
              <Input
                size="large"
                variant="borderless"
                placeholder="例：7月22日 / 昨天 / 2026-07-22"
                value={extra.report_date ?? ''}
                onChange={(e) => setExtra((p) => ({ ...p, report_date: e.target.value }))}
                onPressEnter={() =>
                  commit('custom', extra.report_date ?? '', { report_date: extra.report_date })
                }
              />
            ) : (
              <Input.TextArea
                variant="borderless"
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder={placeholder}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    sendCustom();
                  }
                }}
              />
            )}
            <button
              type="button"
              className="guided-chat-field__send"
              disabled={submitting}
              aria-label={isTopic ? '确认选题' : '发送'}
              title={isTopic ? '确认选题' : '发送'}
              onClick={() => {
                if (field.name === 'date_mode' && extra._pending === 'custom') {
                  commit('custom', extra.report_date ?? '', { report_date: extra.report_date });
                  return;
                }
                sendCustom();
              }}
            >
              <ArrowUp size={16} strokeWidth={2.25} />
            </button>
          </div>
        )
      ) : null}

      {isSupplement ? (
        <button
          type="button"
          className="guided-chat-field__confirm-topics"
          disabled={submitting}
          onClick={() => {
            const t = customText.trim();
            commit(t, t ? `补充 · ${t.slice(0, 40)}` : '无补充说明');
          }}
        >
          {customText.trim() ? '确认补充' : '无补充，继续'}
        </button>
      ) : null}

      {isTopic ? (
        <button
          type="button"
          className="guided-chat-field__confirm-topics"
          disabled={submitting || (selectedTopics.length === 0 && !customText.trim())}
          onClick={() => commitTopics()}
        >
          确认选题
          {selectedTopics.length > 0 ? `（${selectedTopics.length}）` : ''}
        </button>
      ) : null}

      {isMultiEnum ? (
        <button
          type="button"
          className="guided-chat-field__confirm-topics"
          disabled={
            submitting ||
            selectedEnums.length <
              (typeof field.minItems === 'number' && field.minItems > 0 ? field.minItems : 1)
          }
          onClick={() => commitMultiEnum()}
        >
          确认选择
          {selectedEnums.length > 0 ? `（${selectedEnums.length}）` : ''}
        </button>
      ) : null}

      {error ? <p className="guided-chat-field__error">{error}</p> : null}

      <div className="guided-chat-field__footer">
        {!effectivelyRequired && onSkip ? (
          <button
            type="button"
            className="guided-chat-field__skip"
            disabled={submitting}
            onClick={() => {
              if (isBriefSatisfiedBySourceMaterial(field, contextValues)) {
                const n = sourceMaterialTextLength(contextValues);
                commit('', `按已有材料自动归纳（${n} 字）`);
                return;
              }
              onSkip();
            }}
          >
            <SkipForward size={14} />
            跳过
          </button>
        ) : null}
      </div>
    </div>
  );
}
