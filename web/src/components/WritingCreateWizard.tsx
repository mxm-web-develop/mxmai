/**
 * 写作新建统一向导（§32 / §34）
 *
 * 1. 业务列表
 * 2. pre（不建任务）：交互卡 → 联网预览检索（≥5 话题）
 * 3. input：basic 分步（消费话题 chips）→ 任务名
 * 4. 确认计价后才 create task
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { App, Button, Spin } from 'antd';
import { Search } from 'lucide-react';
import {
  previewWritingTrendSearch,
  previewVoiceStyleTopics,
  previewTopicArticleOutline,
  previewDialogueContentScan,
  previewDeckPlanRecommend,
  runTaskV2,
  type TaskFormConfig,
  type TaskFormConfigListItem,
} from '../api/client';
import {
  TaskBillingBar,
  formatGenerateButtonLabel,
  handleTaskBillingResponseError,
  type TaskBillingState,
} from './billing/TaskBillingBar';
import type { WarpGateField } from './WarpGateWizard';
import { GuidedChatField } from './GuidedChatField';
import { groupBusinesses } from './bizListGroup';
import { schemaToWarpFields } from './schemaToWarpFields';
import { formatTaskSelectionKey, pickTaskIdFromRunTaskV2Response } from '../task-v2';
import { pageTopicPool, slimWebsourceForSelectedTopics } from '../lib/topicSelection';
import { purposeForVoiceCategory } from '../lib/topicArticlePurpose';
import { prepareTaskV2SubmitParams } from '../task-v2/prepareSubmitParams';
import { type AppLocale } from '../i18n/appLocale';
import {
  isSeekGenreFieldName,
  isSeekVoiceFieldName,
  seekGenreEnumForLocale,
  seekVoiceEnumForLocale,
} from '../lib/seekVoicePresets';
import { userFacingCopy, toUserFacingError } from '../lib/uiCopyHygiene';
import type { UserFacingError } from '../lib/platformErrors';
import { ErrorNotice } from './errors/ErrorNotice';
import { useAuth } from '../context/AuthContext';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import {
  filterBasicFieldsByCreateGuide,
  getCreateGuideMidPreOutline,
  getCreateGuideMidPreTopicRecommend,
  indicatesWarpGatesCreate,
  needsCreateGuideClientWebSearchPreview,
  needsCreateGuideNestedTextPreview,
  resolvePostPreAssistantHint,
  shouldUseWritingWarpGuidedCreate,
} from './writingCreateUx';
import './writing-create-wizard.css';

gsap.registerPlugin(useGSAP);

type Stage = 'select-business' | 'guide' | 'searching' | 'confirm';

type ThreadMsg = {
  id: string;
  role: 'assistant' | 'user' | 'status';
  text: string;
};

/** 引导会话钉死的业务配置：全程只用快照，禁止中途换 formConfig 串业务 */
type GuideSession = {
  taskKey: string;
  subtype: string | null;
  subtypeLabel: string | null;
  formConfig: TaskFormConfig;
};

const PRE_COLLECTED = new Set([
  'industry',
  'industry_custom',
  'date_mode',
  'report_date',
  'language',
  'search_track',
  'search_region',
  'topic',
]);
const BASIC_ORDER = [
  'core_topic',
  'main_topic',
  'subjective_analysis',
  'analysis_stance',
  'style',
  'style_custom',
  'structure_divergence',
  'style_divergence',
  'seek_count',
  'supplement',
];
const TASK_NAME_FIELD: WarpGateField = {
  name: '__task_label',
  title: '任务名称',
  description: '用于列表展示；可改成更易识别的名字。',
  required: true,
};

/** top-level enum，或 array.items.enum（如 voice_ids） */
function resolvePropEnum(prop: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(prop.enum) && prop.enum.length) return prop.enum.map(String);
  const items = prop.items;
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const ie = (items as Record<string, unknown>).enum;
    if (Array.isArray(ie) && ie.length) return ie.map(String);
  }
  return undefined;
}

/** 按 App 语言覆盖 seek 文风 / 文体展示名 */
function enrichSeekLocaleField(field: WarpGateField, locale: AppLocale): WarpGateField {
  if (isSeekVoiceFieldName(field.name)) {
    const pack = seekVoiceEnumForLocale(locale);
    const ids = field.enum?.length ? field.enum : pack.enum;
    const labelById = new Map(pack.enum.map((id, i) => [id, pack.labels[i] || id]));
    return {
      ...field,
      type: 'array',
      enum: ids,
      'x-enum-labels': ids.map((id) => labelById.get(id) || id),
      'x-ui': field['x-ui'] || 'multi-chips',
      'x-ui-type': field['x-ui-type'] || 'chips',
      minItems: field.minItems ?? 1,
      maxItems: field.maxItems ?? 8,
    };
  }
  if (isSeekGenreFieldName(field.name)) {
    const pack = seekGenreEnumForLocale(locale);
    const ids = field.enum?.length ? field.enum : pack.enum;
    const labelById = new Map(pack.enum.map((id, i) => [id, pack.labels[i] || id]));
    return {
      ...field,
      enum: ids,
      'x-enum-labels': ids.map((id) => labelById.get(id) || id),
    };
  }
  return field;
}

function schemaPropToField(
  name: string,
  prop: Record<string, unknown>,
  required: boolean,
  locale?: AppLocale
): WarpGateField {
  const rawTitle = typeof prop.title === 'string' ? prop.title : name;
  const rawDesc = typeof prop.description === 'string' ? prop.description : '';
  const title =
    name === 'subjective_analysis'
      ? userFacingCopy(rawTitle, '主观分析')
      : name === 'style'
        ? userFacingCopy(rawTitle, '文章风格')
        : name === 'voice_ids'
          ? userFacingCopy(rawTitle, '文风')
          : userFacingCopy(rawTitle, name);
  const description =
    name === 'subjective_analysis'
      ? userFacingCopy(
          rawDesc,
          '默认无主观评论（纯报道）；也可选一种分析口吻，或自定义说明。'
        )
      : name === 'style'
        ? userFacingCopy(
            rawDesc,
            '选一种风格：速报（客观列新闻）/ 专业深挖（带分析推理）/ 幽默解读（诙谐点评）；点「自定义…」可写偏好或 @ 引用语感文风。'
          )
        : name === 'voice_ids'
          ? userFacingCopy(
              rawDesc,
              '按语言分组点选一种或多种文风；份数等于所选数量'
            )
          : userFacingCopy(rawDesc) || undefined;
  const xUiTypeRaw = typeof prop['x-ui-type'] === 'string' ? prop['x-ui-type'] : undefined;
  const knownScale =
    name === 'structure_divergence' || name === 'style_divergence' || name === 'seek_count';
  const xUiType = xUiTypeRaw === 'scale' || knownScale ? 'scale' : xUiTypeRaw;
  const isScale = xUiType === 'scale';
  const resolvedEnum = resolvePropEnum(prop);
  const enumLabels = Array.isArray(prop['x-enum-labels'])
    ? prop['x-enum-labels'].map(String)
    : undefined;
  let minimum = typeof prop.minimum === 'number' ? prop.minimum : undefined;
  let maximum = typeof prop.maximum === 'number' ? prop.maximum : undefined;
  // scale：若只给了 enum 数字列表，从中推导区间
  if (isScale && (minimum == null || maximum == null) && resolvedEnum?.length) {
    const nums = resolvedEnum.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length) {
      minimum = minimum ?? Math.min(...nums);
      maximum = maximum ?? Math.max(...nums);
    }
  }
  if (isScale) {
    if (minimum == null) minimum = name === 'seek_count' ? 2 : 1;
    if (maximum == null) maximum = 10;
  }
  const isBool = prop.type === 'boolean' || name === 'subjective_analysis';
  const isArray = prop.type === 'array' || isSeekVoiceFieldName(name);
  const defaultObj =
    prop.default && typeof prop.default === 'object' && !Array.isArray(prop.default)
      ? (prop.default as Record<string, unknown>)
      : undefined;
  const defaultArr = Array.isArray(prop.default)
    ? prop.default.map(String).filter(Boolean)
    : undefined;
  const field: WarpGateField = {
    name,
    type: isBool ? 'boolean' : isArray ? 'array' : typeof prop.type === 'string' ? prop.type : 'string',
    title,
    description,
    // scale 不走枚举 chips；区间用 minimum/maximum；boolean 由 GuidedChatField 专属 UI
    enum: isScale || isBool ? undefined : resolvedEnum,
    required,
    default:
      defaultObj || defaultArr
        ? undefined
        : isBool
          ? prop.default === true || prop.default === 'true'
            ? 'true'
            : 'false'
          : prop.default != null
            ? String(prop.default)
            : undefined,
    defaultArray: defaultArr,
    defaultObject: defaultObj,
    'x-ui':
      name === 'core_topic'
        ? 'topic-chips'
        : name === 'main_topic'
          ? 'main-topic'
          : name === 'outline'
            ? 'outline-pre'
          : isSeekVoiceFieldName(name)
            ? 'multi-chips'
            : typeof prop['x-ui'] === 'string'
              ? prop['x-ui']
              : undefined,
    'x-ui-type': name === 'outline' ? 'outline' : xUiType,
    'x-voice-model':
      typeof prop['x-voice-model'] === 'string' ? prop['x-voice-model'] : undefined,
    'x-max-chars':
      typeof prop['x-max-chars'] === 'number' ? prop['x-max-chars'] : undefined,
    minimum,
    maximum,
    minItems: typeof prop.minItems === 'number' ? prop.minItems : undefined,
    maxItems: typeof prop.maxItems === 'number' ? prop.maxItems : undefined,
    'x-enum-labels': enumLabels,
    placeholder:
      typeof prop.placeholder === 'string'
        ? userFacingCopy(prop.placeholder) || undefined
        : name === 'style_custom'
          ? '写几句语气偏好，或输入 @ 选择语感文风'
          : undefined,
    help:
      name === 'style_custom'
        ? '自定义语气，或 @ 引用语感文风；不会改成别的文章类型。'
        : undefined,
  };
  return locale ? enrichSeekLocaleField(field, locale) : field;
}

/** 挂卡 / 「其他」补充字段：禁止单独成引导步 */
function isInlineSupplementField(name: string, prop: Record<string, unknown>): boolean {
  if (
    name === 'style_custom' ||
    name === 'analysis_stance' ||
    name === 'industry_custom' ||
    name === 'writing_folder_id' ||
    name === 'report_date' ||
    // 派生字段：音色已在 voice 步选好；语速由播报风格决定
    name === 'voice_id' ||
    name === 'speed' ||
    name === 'character_folder_id' ||
    // 话题写作：用途由类别自动推导；来源由选题步静默写入
    name === 'purpose' ||
    name === 'topic_source'
  ) {
    return true;
  }
  if (prop['x-ui-type'] === 'folderCard') return true;
  if (prop['x-show-when'] != null || prop['x-hide-when'] != null) return true;
  if (prop['x-user-visible'] === false) return true;
  if (prop['x-guided-inline'] === true || prop['x-guided-hidden'] === true) return true;
  return false;
}

/** 日期模式中英归一，供检索与落库 */
function normalizeDateModeParams(params: Record<string, unknown>): Record<string, unknown> {
  const raw = String(params.date_mode ?? 'today').trim();
  const date_mode =
    raw === '今日' || raw === 'today'
      ? 'today'
      : raw === '昨日' || raw === 'yesterday'
        ? 'yesterday'
        : raw === '本周' || raw === 'this_week' || raw === 'week'
          ? 'this_week'
          : raw === '本月' || raw === 'this_month' || raw === 'month'
            ? 'this_month'
            : raw === '指定日期' || raw === 'custom'
              ? 'custom'
              : raw || 'today';
  const out: Record<string, unknown> = { ...params, date_mode };
  if (date_mode === 'custom') {
    const d = String(params.report_date ?? '').trim();
    if (d) out.report_date = d;
  }
  // 文章长度：引导可能写入中文标签，统一成 brief|standard|in_depth
  const al = resolveArticleLengthPreference(params.article_length);
  if (params.article_length != null && params.article_length !== '') {
    out.article_length = al;
  }
  return out;
}

function resolveArticleLengthPreference(raw: unknown): 'brief' | 'standard' | 'in_depth' {
  const s = String(raw ?? '').trim();
  if (!s) return 'standard';
  if (s === 'brief' || s.startsWith('简短')) return 'brief';
  if (s === 'in_depth' || s === 'deep' || s.startsWith('深度')) return 'in_depth';
  if (s === 'standard' || s.startsWith('适中')) return 'standard';
  return 'standard';
}

/**
 * 「自定义」曾把自由文本写进 enum 字段；提交前收成「其他」+ *_custom。
 * allowed 缺省用行业日报约定值；有 schema enum 时优先用 schema。
 */
function normalizeOtherEnumCustomParams(
  params: Record<string, unknown>,
  schema?: TaskFormConfig['schema'] | null
): Record<string, unknown> {
  const props =
    schema && typeof schema === 'object' && !Array.isArray(schema)
      ? ((schema as { properties?: Record<string, { enum?: unknown[] }> }).properties ?? {})
      : {};
  const pairs: Array<{ field: string; custom: string; fallback: string[] }> = [
    { field: 'industry', custom: 'industry_custom', fallback: ['股票', '基金', '银行保险', '加密货币', '人工智能', '半导体', '消费电子', '互联网', '影视综', '音乐', '游戏', '足球', '篮球', '网球', '赛车', '其他'] },
    {
      field: 'style',
      custom: 'style_custom',
      fallback: ['新闻速报', '专业深挖', '幽默解读', '其他'],
    },
  ];
  const out = { ...params };
  for (const { field, custom, fallback } of pairs) {
    const fromSchema = props[field]?.enum?.map(String);
    const allowed = fromSchema?.length ? fromSchema : fallback;
    if (!allowed.includes('其他') && !allowed.includes('其它')) continue;
    const otherLabel = allowed.includes('其他') ? '其他' : '其它';
    const raw = String(out[field] ?? '').trim();
    if (!raw || allowed.includes(raw)) continue;
    if (!String(out[custom] ?? '').trim()) out[custom] = raw;
    out[field] = otherLabel;
  }
  // 预设语气：清掉「其他」补充，避免脏参数改写文类/注入旧文风卡
  if (String(out.style ?? '') !== '其他' && String(out.style ?? '') !== '其它') {
    if (out.style_custom) out.style_custom = '';
    if (out.writing_folder_id) out.writing_folder_id = '';
  }
  // 主观分析关闭时清掉立场，避免脏参数
  const subj = out.subjective_analysis;
  const analysisOn = subj === true || subj === 'true' || subj === 1 || subj === '1';
  if (!analysisOn) {
    delete out.analysis_stance;
  } else if (!String(out.analysis_stance ?? '').trim()) {
    out.analysis_stance = '基于数据客观分析';
  }
  if (typeof out.subjective_analysis === 'string') {
    out.subjective_analysis = analysisOn;
  }
  return out;
}

function guideFieldToWarp(
  raw: Record<string, unknown> & { name: string },
  locale?: AppLocale
): WarpGateField {
  const name = String(raw.name).trim();
  const enums = resolvePropEnum(raw);
  // date_mode：展示用中文 chips；custom/指定日期由「自定义…」承接
  let displayEnum = enums;
  if (name === 'date_mode' && enums?.length) {
    displayEnum = enums
      .map((e) =>
        e === 'today' || e === '今日'
          ? '今日'
          : e === 'yesterday' || e === '昨日'
            ? '昨日'
            : e === 'this_week' || e === '本周' || e === 'week'
              ? '本周'
              : e === 'this_month' || e === '本月' || e === 'month'
                ? '本月'
                : e
      )
      .filter((e) => e !== 'custom' && e !== '指定日期');
  }
  if (name === 'search_region' && enums?.length) {
    const labels: Record<string, string> = {
      global: '全球',
      cn: '中国大陆',
      tw: '台湾',
      jp: '日本',
      na: '北美',
      eu: '欧洲',
    };
    displayEnum = enums.map((e) => labels[e] || e);
  }
  const defaultArr = Array.isArray(raw.default)
    ? raw.default.map(String).filter(Boolean)
    : undefined;
  const defaultRaw =
    defaultArr == null && raw.default != null ? String(raw.default) : undefined;
  let defaultDisplay = defaultRaw;
  if (name === 'date_mode' && (defaultRaw === 'today' || defaultRaw === '今日')) defaultDisplay = '今日';
  if (name === 'date_mode' && (defaultRaw === 'yesterday' || defaultRaw === '昨日'))
    defaultDisplay = '昨日';
  if (name === 'date_mode' && (defaultRaw === 'this_week' || defaultRaw === '本周'))
    defaultDisplay = '本周';
  if (name === 'date_mode' && (defaultRaw === 'this_month' || defaultRaw === '本月'))
    defaultDisplay = '本月';
  if (name === 'search_region' && defaultRaw) {
    const labels: Record<string, string> = {
      global: '全球',
      cn: '中国大陆',
      tw: '台湾',
      jp: '日本',
      na: '北美',
      eu: '欧洲',
    };
    defaultDisplay = labels[defaultRaw] || defaultRaw;
  }
  const xUiType = typeof raw['x-ui-type'] === 'string' ? raw['x-ui-type'] : undefined;
  const isScale = xUiType === 'scale';
  let minimum = typeof raw.minimum === 'number' ? raw.minimum : undefined;
  let maximum = typeof raw.maximum === 'number' ? raw.maximum : undefined;
  if (isScale && (minimum == null || maximum == null) && enums?.length) {
    const nums = enums.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length) {
      minimum = minimum ?? Math.min(...nums);
      maximum = maximum ?? Math.max(...nums);
    }
  }
  const isArray = raw.type === 'array' || isSeekVoiceFieldName(name);
  const field: WarpGateField = {
    name,
    type: isArray ? 'array' : typeof raw.type === 'string' ? raw.type : 'string',
    title: typeof raw.title === 'string' ? raw.title : name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    enum: isScale ? undefined : displayEnum,
    required: raw.required === true,
    default: defaultArr ? undefined : defaultDisplay,
    defaultArray: defaultArr,
    'x-ui':
      name === 'core_topic'
        ? 'topic-chips'
        : isSeekVoiceFieldName(name)
          ? 'multi-chips'
          : typeof raw['x-ui'] === 'string'
            ? raw['x-ui']
            : undefined,
    'x-ui-type': xUiType,
    'x-voice-model':
      typeof raw['x-voice-model'] === 'string' ? raw['x-voice-model'] : undefined,
    'x-max-chars':
      typeof raw['x-max-chars'] === 'number' ? raw['x-max-chars'] : undefined,
    minimum,
    maximum,
    minItems: typeof raw.minItems === 'number' ? raw.minItems : undefined,
    maxItems: typeof raw.maxItems === 'number' ? raw.maxItems : undefined,
    'x-enum-labels': Array.isArray(raw['x-enum-labels'])
      ? raw['x-enum-labels'].map(String)
      : undefined,
  };
  return locale ? enrichSeekLocaleField(field, locale) : field;
}

/**
 * pre 引导字段：只认当前业务的 createGuide / schema，禁止硬编码某业务字段（曾误把行业日报塞给方案类业务）。
 */
function buildPreCardFields(
  schema: TaskFormConfig['schema'] | null | undefined,
  createGuide?: TaskFormConfig['createGuide'],
  locale?: AppLocale
): WarpGateField[] {
  const cardFields = createGuide?.interactiveCard?.fields;
  if (Array.isArray(cardFields) && cardFields.length > 0) {
    const hint = createGuide?.interactiveCard?.hint?.trim();
    return cardFields
      .filter((f) => f && typeof f.name === 'string' && String(f.name).trim())
      .filter((f) => {
        const n = String(f.name).trim();
        // industry_custom / report_date 由「自定义」入口承接；language 跟 App locale，不单独成步
        return n !== 'industry_custom' && n !== 'report_date' && n !== 'language' && n !== 'usage_direction_custom';
      })
      .map((f) => {
        const name = String(f.name).trim();
        const schemaProp =
          schema?.properties?.[name] && typeof schema.properties[name] === 'object'
            ? (schema.properties[name] as Record<string, unknown>)
            : {};
        const guideRaw = f as Record<string, unknown> & { name: string };
        // createGuide 常只写 name/title；enum / x-ui-type 从 formSchema 合并，避免退化成手填
        const guideHasEnum = Boolean(resolvePropEnum(guideRaw)?.length);
        const merged: Record<string, unknown> & { name: string } = {
          ...schemaProp,
          ...guideRaw,
          name,
          enum: guideHasEnum ? resolvePropEnum(guideRaw) : resolvePropEnum(schemaProp),
          'x-enum-labels': Array.isArray(guideRaw['x-enum-labels'])
            ? guideRaw['x-enum-labels']
            : schemaProp['x-enum-labels'],
          'x-ui-type':
            guideRaw['x-ui-type'] ??
            schemaProp['x-ui-type'] ??
            (resolvePropEnum(schemaProp)?.length || guideHasEnum ? 'selection' : undefined),
        };
        const field = guideFieldToWarp(merged, locale);
        if (hint && field.name === cardFields[0]?.name) {
          field.description = hint;
        }
        return field;
      });
  }

  // 无 interactiveCard：仅从当前 schema 收集 x-collect:pre（绝不捏造 industry 等字段）
  const props = schema?.properties ?? {};
  const fields: WarpGateField[] = [];
  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue;
    if ((prop as Record<string, unknown>)['x-collect'] !== 'pre') continue;
    if (name === 'industry_custom' || name === 'report_date' || name === 'language' || name === 'usage_direction_custom') continue;
    if ((prop as Record<string, unknown>)['x-hidden'] === true) continue;
    fields.push(
      schemaPropToField(name, prop as Record<string, unknown>, name === 'industry', locale)
    );
  }
  if (fields.length > 0) return fields;

  // 再退一步：schema 有 topic 就只问 topic（写作类常见）
  if (props.topic) {
    return [schemaPropToField('topic', props.topic as Record<string, unknown>, true, locale)];
  }
  return [];
}

/** 第二张交互卡：用 nestedText 预览结果预填 default；plans → plan_id chips */
function buildFollowUpCardFields(
  createGuide?: TaskFormConfig['createGuide'],
  previewPatch?: Record<string, unknown>,
  locale?: AppLocale
): WarpGateField[] {
  const card = createGuide?.followUpInteractiveCard;
  const cardFields = card?.fields;
  if (!Array.isArray(cardFields) || cardFields.length === 0) return [];
  const hint = card?.hint?.trim();
  const plansRaw = previewPatch?.plans;
  const planChips = Array.isArray(plansRaw)
    ? plansRaw
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && !Array.isArray(p))
        .map((p) => {
          const id = String(p.id ?? '').trim();
          if (!id) return null;
          const label = String(p.label ?? '').trim() || id;
          const pages = Number(p.page_count);
          const dens = String(p.density ?? '').trim();
          const densZh = dens === 'sparse' ? '疏' : dens === 'dense' ? '密' : dens === 'balanced' ? '中' : '';
          const chip =
            /\d+\s*页/.test(label) || !Number.isFinite(pages)
              ? label
              : `${label}·${Math.round(pages)}页${densZh ? `·${densZh}` : ''}`;
          return { id, chip, why: String(p.why ?? '').trim() };
        })
        .filter((x): x is { id: string; chip: string; why: string } => !!x)
    : [];

  return cardFields
    .filter((f) => f && typeof f.name === 'string' && String(f.name).trim())
    .map((f, idx) => {
      const field = guideFieldToWarp(
        f as Record<string, unknown> & { name: string },
        locale
      );
      if (hint && idx === 0) field.description = hint;
      if (field.name === 'plan_id' && planChips.length > 0) {
        field.enum = planChips.map((p) => p.id);
        field['x-enum-labels'] = planChips.map((p) => p.chip);
        field['x-ui-type'] = 'chips';
        field.required = true;
        const whys = planChips.map((p) => p.why).filter(Boolean);
        if (whys.length) {
          field.description = [
            hint || '点选一页数与信息密度合适的方案',
            ...whys.map((w, i) => `${planChips[i]!.chip}：${w}`),
          ].join('\n');
        }
      }
      const seeded = previewPatch?.[field.name];
      if (seeded != null) {
        if (typeof seeded === 'object' && !Array.isArray(seeded)) {
          field.defaultObject = seeded as Record<string, unknown>;
        } else if (Array.isArray(seeded)) {
          field.defaultArray = seeded.map(String);
        } else if (
          typeof seeded === 'string' ||
          typeof seeded === 'number' ||
          typeof seeded === 'boolean'
        ) {
          field.default = seeded;
        }
      }
      return field;
    });
}

const DIALOGUE_FORMAT_LABELS: Record<string, string> = {
  alternate_read: '交替朗读',
  topic_discuss: '话题讨论',
  host_sidekick: '主讲陪聊',
  audio_drama: '演绎有声剧',
};

function extractSourceMaterialText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    return String((raw as { text?: string }).text ?? '').trim();
  }
  return '';
}

/** 按 createGuide.nestedTextPreview.taskKey 跑 C 端预览，回写推荐字段（不绑业务名） */
async function runCreateGuideNestedTextPreview(opts: {
  nestedTextTaskKey: string;
  collected: Record<string, unknown>;
  language?: string;
}): Promise<Record<string, unknown>> {
  const key = opts.nestedTextTaskKey.trim();
  if (key.endsWith('/dialogue-content-scan') || key.includes('dialogue-content-scan')) {
    const sourceText = extractSourceMaterialText(opts.collected.source_material);
    if (sourceText.length < 8) throw new Error('文稿过短，请补充后再分析');
    const res = await previewDialogueContentScan({
      sourceMaterial: sourceText,
      language: opts.language,
    });
    if (res.error || !res.data) throw new Error(res.error || '文稿分析失败');
    const data = res.data;
    return {
      content_scan: data,
      dialogue_format: data.suggested_format,
      speaker_count: data.suggested_speakers,
      broadcast_style: data.suggested_broadcast_style || 'chat_show',
    };
  }
  if (key.endsWith('/deck-plan-recommend') || key.includes('deck-plan-recommend')) {
    const sourceText = extractSourceMaterialText(opts.collected.source_material);
    const brief = String(opts.collected.brief ?? '').trim();
    if (sourceText.length < 4 && brief.length < 8) {
      throw new Error('请先上传相关内容或写清内容说明');
    }
    const res = await previewDeckPlanRecommend({
      usageDirection: String(opts.collected.usage_direction ?? '').trim() || undefined,
      usageDirectionCustom: String(opts.collected.usage_direction_custom ?? '').trim() || undefined,
      sourceMaterial: sourceText || undefined,
      brief: brief || undefined,
      language: opts.language,
    });
    if (res.error || !res.data) throw new Error(res.error || '方案推荐失败');
    const data = res.data;
    const plans = Array.isArray(data.plans) ? data.plans : [];
    if (plans.length === 0) throw new Error('未得到可用方案，请稍后重试');
    return {
      plans,
      plan_id: String(data.plan_id || plans[0]?.id || '').trim() || String(plans[0]?.id ?? ''),
    };
  }
  throw new Error(`暂不支持客户端预览：${key}`);
}

function formatNestedTextRecommendHint(patch: Record<string, unknown>): string {
  if (Array.isArray(patch.plans) && patch.plans.length > 0) {
    const plans = patch.plans.filter(
      (p): p is Record<string, unknown> => !!p && typeof p === 'object' && !Array.isArray(p)
    );
    const lines = plans.slice(0, 3).map((p) => {
      const label = String(p.label ?? p.id ?? '方案').trim();
      const pages = Number(p.page_count);
      const why = String(p.why ?? '').trim();
      const head = Number.isFinite(pages) ? `${label}（约 ${Math.round(pages)} 页）` : label;
      return why ? `· ${head}：${why}` : `· ${head}`;
    });
    return ['已按你的资料推荐 3 套方案，点选即可，无需手填：', ...lines].join('\n');
  }
  const scan =
    patch.content_scan && typeof patch.content_scan === 'object'
      ? (patch.content_scan as Record<string, unknown>)
      : patch;
  const format = String(scan.suggested_format ?? patch.dialogue_format ?? '').trim();
  const speakers = scan.suggested_speakers ?? patch.speaker_count;
  const reason = String(scan.reason ?? '').trim();
  const label = DIALOGUE_FORMAT_LABELS[format] ?? format;
  const parts: string[] = [];
  if (label && speakers != null && String(speakers).trim()) {
    parts.push(`根据文稿，建议「${label} / ${speakers} 人」。`);
  }
  if (reason) parts.push(reason);
  parts.push('你也可以改选，并确认各角色音色。');
  return parts.join(' ');
}

function buildBasicFields(
  schema: TaskFormConfig['schema'] | null | undefined,
  session?: Pick<GuideSession, 'formConfig'> | null,
  locale?: AppLocale
): WarpGateField[] {
  const props = schema?.properties ?? {};
  const out: WarpGateField[] = [];
  for (const name of BASIC_ORDER) {
    if (isInlineSupplementField(name, (props[name] as Record<string, unknown>) ?? {})) continue;
    if (props[name]) out.push(schemaPropToField(name, props[name], false, locale));
  }
  for (const [name, prop] of Object.entries(props)) {
    if (
      PRE_COLLECTED.has(name) ||
      BASIC_ORDER.includes(name) ||
      name === 'parallel_count' ||
      isInlineSupplementField(name, (prop as Record<string, unknown>) ?? {})
    ) {
      continue;
    }
    if (prop && typeof prop === 'object' && (prop as Record<string, unknown>)['x-zone'] === 'basic') {
      if ((prop as Record<string, unknown>)['x-collect'] === 'pre') continue;
      if ((prop as Record<string, unknown>)['x-hidden']) continue;
      out.push(schemaPropToField(name, prop as Record<string, unknown>, false, locale));
    }
  }
  return filterBasicFieldsByCreateGuide(out, {
    schema: session?.formConfig.schema ?? schema,
    createGuide: session?.formConfig.createGuide,
  });
}

export type WritingCreateWizardProps = {
  /** 默认 writing；音频等 scope 复用同一向导 */
  scope?: 'writing' | 'audio' | 'graph' | 'video' | 'music';
  taskOptions: TaskFormConfigListItem[];
  selectOptions: { label: string; value: string }[];
  selectedValue: string;
  onSelectBusiness: (taskKey: string, subtype: string | null) => void;
  taskKey: string;
  subtype: string | null;
  formConfig: TaskFormConfig | null;
  configLoading?: boolean;
  taskLabel: string;
  onTaskLabelChange: (v: string) => void;
  mergeTaskLabelIntoParams: (params: Record<string, unknown>) => Record<string, unknown>;
  locale: AppLocale;
  generateLabel: string;
  billing: TaskBillingState;
  onBillingStateChange: (s: TaskBillingState) => void;
  onTaskCreated: (taskId: string) => void;
  onFinished: () => void;
  /**
   * Admin 操作监控室：钉死当前业务，配置就绪后直接开引导（不展示业务列表）。
   * 交互与 C 端 WritingCreateWizard 完全一致，仅入口不同。
   */
  lockBusiness?: boolean;
  /** Admin 调试：runTaskV2 带 adminPipelineDebug，落逐步 raw I/O */
  adminPipelineDebug?: boolean;
  /**
   * Admin 监控室：引导期客户端预览（网络检索 / nestedText 等）的逐步 I/O。
   * 与管线 pipelineTrace 拼成右侧时间轴。
   */
  onGuideStepIo?: (event: CreateGuideStepIoEvent) => void;
};

/** 创建引导内客户端步骤（任务尚未创建时也会发生） */
export type CreateGuideStepIoEvent = {
  id: string;
  phase: 'create-guide';
  step: string;
  label?: string;
  status: 'running' | 'done' | 'error';
  at: number;
  durationMs?: number;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  error?: string;
};

export function WritingCreateWizard({
  scope = 'writing',
  taskOptions,
  selectedValue,
  onSelectBusiness,
  taskKey,
  subtype,
  formConfig,
  configLoading,
  taskLabel,
  onTaskLabelChange,
  mergeTaskLabelIntoParams,
  locale,
  generateLabel,
  billing,
  onBillingStateChange,
  onTaskCreated,
  onFinished,
  lockBusiness = false,
  adminPipelineDebug = false,
  onGuideStepIo,
}: WritingCreateWizardProps) {
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const onGuideStepIoRef = useRef(onGuideStepIo);
  onGuideStepIoRef.current = onGuideStepIo;
  const [stage, setStage] = useState<Stage>('select-business');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [guideError, setGuideError] = useState<UserFacingError | null>(null);
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState<Record<string, unknown>>({});
  const [preWebsource, setPreWebsource] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<WarpGateField[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [topicChips, setTopicChips] = useState<string[]>([]);
  const [topicPool, setTopicPool] = useState<string[]>([]);
  const [topicPageIndex, setTopicPageIndex] = useState(0);
  const [topicPageSize, setTopicPageSize] = useState(8);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [pendingStart, setPendingStart] = useState(false);
  /** 点击业务时钉死的选型键，避免用上一业务的 formConfig 开引导 */
  const [pendingSelectionKey, setPendingSelectionKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pre' | 'pre-followup' | 'basic' | 'task-name'>('pre');
  /** 引导会话业务快照：与 props.formConfig 解耦，杜绝中途串业务 */
  const [guideSession, setGuideSession] = useState<GuideSession | null>(null);
  const guideSessionRef = useRef<GuideSession | null>(null);
  guideSessionRef.current = guideSession;

  /** 引导中用会话快照；未开引导前用 props.formConfig */
  const activeConfig = guideSession?.formConfig ?? formConfig;

  const bizIdentity = {
    schema: activeConfig?.schema,
    createGuide: activeConfig?.createGuide,
  };

  const hasPreCard = shouldUseWritingWarpGuidedCreate({
    createUx: activeConfig?.createUx,
    ...bizIdentity,
  });
  const needsClientSearchPreview = needsCreateGuideClientWebSearchPreview(bizIdentity);
  const needsMidPreTopicRecommend = Boolean(
    getCreateGuideMidPreTopicRecommend({ createGuide: bizIdentity.createGuide })
  );
  const needsNestedTextPreview = needsCreateGuideNestedTextPreview(bizIdentity);

  const bizGroups = useMemo(() => groupBusinesses(taskOptions, locale), [taskOptions, locale]);

  const confirmEstimateParams = useMemo(() => collected, [collected]);

  const emitGuideIo = useCallback((event: CreateGuideStepIoEvent) => {
    onGuideStepIoRef.current?.(event);
  }, []);

  const faceGuideError = useCallback(
    (e: unknown): UserFacingError => {
      if (e && typeof e === 'object' && ('code' in e || 'debugDetail' in e || 'error' in e)) {
        const o = e as { code?: string; message?: string; debugDetail?: string; error?: string };
        return toUserFacingError(
          {
            code: o.code,
            error: o.error || o.message || (e instanceof Error ? e.message : String(e)),
            debugDetail: o.debugDetail,
          },
          { isAdmin }
        );
      }
      return toUserFacingError(e instanceof Error ? e.message : e, { isAdmin });
    },
    [isAdmin]
  );

  const resetGuideState = useCallback(() => {
    setErrorMsg(null);
    setGuideError(null);
    setCollected({});
    setPreWebsource(null);
    setQueue([]);
    setQueueIdx(0);
    setTopicChips([]);
    setTopicPool([]);
    setTopicPageIndex(0);
    setThread([]);
    setPhase('pre');
    setGuideSession(null);
    setPendingSelectionKey(null);
  }, []);

  useGSAP(
    () => {
      const el = shellRef.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });
    },
    { dependencies: [stage] }
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, queueIdx, stage]);

  const pushThread = useCallback((role: ThreadMsg['role'], text: string) => {
    setThread((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, role, text }]);
  }, []);

  const startGuideForConfig = useCallback(
    (session: GuideSession) => {
      setGuideSession(session);
      guideSessionRef.current = session;
      setErrorMsg(null);
      setGuideError(null);
      setPreWebsource(null);
      setTopicChips([]);
    setTopicPool([]);
    setTopicPageIndex(0);
      setThread([]);
      setCollected({ language: locale, search_region: 'global' });
      setStage('guide');

      const cfg = session.formConfig;
      const identity = {
        createUx: cfg.createUx,
        schema: cfg.schema,
        createGuide: cfg.createGuide,
      };
      const usePre = indicatesWarpGatesCreate(identity) || shouldUseWritingWarpGuidedCreate(identity);

      if (usePre) {
        const pre = buildPreCardFields(cfg.schema, cfg.createGuide, locale);
        setPhase('pre');
        setQueue(pre);
        setQueueIdx(0);
        const cardLabel = cfg.createGuide?.interactiveCard?.label?.trim();
        const cardHint = cfg.createGuide?.interactiveCard?.hint?.trim();
        pushThread(
          'assistant',
          cardHint ||
            (cardLabel
              ? `好的，我们一步一步来。请完成「${cardLabel}」。`
              : '好的，我们一步一步来。请按提示填写。')
        );
        return;
      }

      const fields = schemaToWarpFields(cfg.schema, locale);
      setPhase(fields.length > 0 ? 'basic' : 'task-name');
      setQueue(fields.length > 0 ? fields : [TASK_NAME_FIELD]);
      setQueueIdx(0);
      pushThread(
        'assistant',
        fields.length > 0 ? '已选好业务。请按提示逐项填写。' : '请为这次任务起个名称。'
      );
    },
    [pushThread, locale]
  );

  // 选中业务后：仅当 formConfig 与「点击时钉死的选型」完全一致时开引导
  useEffect(() => {
    if (!pendingStart || !pendingSelectionKey) return;
    if (configLoading) return;
    if (!taskKey) return;
    if (!formConfig?.schema) return;
    const configKey = formatTaskSelectionKey(formConfig.taskKey, formConfig.subtype);
    const liveKey = formatTaskSelectionKey(taskKey, subtype);
    if (configKey !== pendingSelectionKey || liveKey !== pendingSelectionKey) return;
    setPendingStart(false);
    setPendingSelectionKey(null);
    startGuideForConfig({
      taskKey,
      subtype,
      subtypeLabel: formConfig.subtypeLabel ?? null,
      formConfig,
    });
  }, [
    pendingStart,
    pendingSelectionKey,
    configLoading,
    taskKey,
    subtype,
    formConfig,
    startGuideForConfig,
  ]);

  // Admin 监控室：钉死业务，配置就绪后直接进入与 C 端相同的引导
  useEffect(() => {
    if (!lockBusiness) return;
    if (guideSession) return;
    if (pendingStart) return;
    if (configLoading) return;
    if (!taskKey || !formConfig?.schema) return;
    const configKey = formatTaskSelectionKey(formConfig.taskKey, formConfig.subtype);
    const liveKey = formatTaskSelectionKey(taskKey, subtype);
    if (configKey !== liveKey) return;
    startGuideForConfig({
      taskKey,
      subtype,
      subtypeLabel: formConfig.subtypeLabel ?? null,
      formConfig,
    });
  }, [
    lockBusiness,
    guideSession,
    pendingStart,
    configLoading,
    taskKey,
    subtype,
    formConfig,
    startGuideForConfig,
  ]);

  // 引导中若外部选型被改成别的业务 → 立刻中止，禁止串会话
  useEffect(() => {
    if (!guideSession) return;
    if (stage === 'select-business') return;
    if (guideSession.taskKey === taskKey && (guideSession.subtype ?? null) === (subtype ?? null)) {
      return;
    }
    resetGuideState();
    setPendingStart(false);
    setPendingSelectionKey(null);
    setStage(lockBusiness ? 'guide' : 'select-business');
    if (!lockBusiness) {
      message.warning('业务选择已变更，请重新选择业务，避免流程串用。');
    }
  }, [guideSession, taskKey, subtype, stage, resetGuideState, message, lockBusiness]);

  const pickBusiness = (item: BizGroup['items'][number]) => {
    resetGuideState();
    const key = formatTaskSelectionKey(item.taskKey, item.subtype);
    setPendingSelectionKey(key);
    onSelectBusiness(item.taskKey, item.subtype);
    setPendingStart(true);
    setStage('guide');
    pushThread('assistant', `已选择「${item.title}」。正在加载引导…`);
  };

  const enterBasicAfterPre = (
    session: GuideSession,
    preValues: Record<string, unknown>,
    assistantMsg: string
  ) => {
    const normalized = {
      ...preValues,
      language: String(preValues.language ?? collected.language ?? locale).trim() || locale,
    };
    setCollected((prev) => ({ ...prev, ...normalized }));
    const fields = buildBasicFields(session.formConfig.schema, session, locale);
    setPhase(fields.length > 0 ? 'basic' : 'task-name');
    setQueue(fields.length > 0 ? fields : [TASK_NAME_FIELD]);
    setQueueIdx(0);
    setStage('guide');
    pushThread('assistant', assistantMsg);
  };

  const runSearchAfterPre = async (preValues: Record<string, unknown>) => {
    const session = guideSessionRef.current;
    if (!session) {
      message.error('引导会话已失效，请重新选择业务');
      setStage('select-business');
      return;
    }
    const identity = {
      schema: session.formConfig.schema,
      createGuide: session.formConfig.createGuide,
    };
    const normalized = normalizeDateModeParams({
      ...preValues,
      language: String(preValues.language ?? collected.language ?? locale).trim() || locale,
    });
    setCollected((prev) => ({ ...prev, ...normalized }));

    // 双卡 pre：先跑 nestedText 客户端预览，再展示第二张交互卡（loading 期间禁用输入）
    if (needsCreateGuideNestedTextPreview(identity)) {
      const nt = session.formConfig.createGuide?.nestedTextPreview;
      const loadingHint =
        nt?.loadingHint?.trim() ||
        session.formConfig.createGuide?.interactiveCard?.postPreHint?.trim() ||
        '正在分析内容并生成推荐…';
      const nestedKey = String(nt?.nestedTextTaskKey ?? '');
      const nestedInput = {
        nestedTextTaskKey: nestedKey,
        language: String(normalized.language ?? 'zh'),
        collected: normalized,
      };
      const nestedStarted = Date.now();
      emitGuideIo({
        id: 'create-guide:nested-text-preview',
        phase: 'create-guide',
        step: 'nestedTextPreview',
        label: '文稿分析预览（引导）',
        status: 'running',
        at: nestedStarted,
        inputSnapshot: nestedInput,
      });
      setBusy(true);
      setStage('searching');
      pushThread('status', loadingHint);
      try {
        const patch = await runCreateGuideNestedTextPreview({
          nestedTextTaskKey: nestedKey,
          collected: normalized,
          language: String(normalized.language ?? 'zh'),
        });
        if (
          guideSessionRef.current?.taskKey !== session.taskKey ||
          (guideSessionRef.current?.subtype ?? null) !== (session.subtype ?? null)
        ) {
          return;
        }
        emitGuideIo({
          id: 'create-guide:nested-text-preview',
          phase: 'create-guide',
          step: 'nestedTextPreview',
          label: '文稿分析预览（引导）',
          status: 'done',
          at: nestedStarted,
          durationMs: Date.now() - nestedStarted,
          inputSnapshot: nestedInput,
          outputSnapshot: patch,
        });
        const merged = { ...normalized, ...patch };
        setCollected((prev) => ({ ...prev, ...merged }));
        const followFields = buildFollowUpCardFields(session.formConfig.createGuide, patch, locale);
        if (followFields.length === 0) {
          throw new Error('第二张交互卡未配置字段');
        }
        setPhase('pre-followup');
        setQueue(followFields);
        setQueueIdx(0);
        setStage('guide');
        pushThread('assistant', formatNestedTextRecommendHint(patch));
      } catch (e) {
        const faced = faceGuideError(e);
        const msg = faced.message;
        emitGuideIo({
          id: 'create-guide:nested-text-preview',
          phase: 'create-guide',
          step: 'nestedTextPreview',
          label: '文稿分析预览（引导）',
          status: 'error',
          at: nestedStarted,
          durationMs: Date.now() - nestedStarted,
          inputSnapshot: nestedInput,
          error: faced.debugDetail || msg,
        });
        setGuideError(faced);
        setErrorMsg(msg);
        message.error(msg);
        const isDeckPlan = nestedKey.includes('deck-plan-recommend');
        const fallbackPatch = isDeckPlan
          ? {
              plans: [
                {
                  id: 'p1',
                  label: '精简·8页',
                  page_count: 8,
                  density: 'sparse',
                  why: '页数少、信息疏，适合快速过一遍',
                },
                {
                  id: 'p2',
                  label: '适中·12页',
                  page_count: 12,
                  density: 'balanced',
                  why: '常用默认，信息密度适中',
                },
                {
                  id: 'p3',
                  label: '详尽·16页',
                  page_count: 16,
                  density: 'dense',
                  why: '页数多、讲得更细',
                },
              ],
              plan_id: 'p2',
            }
          : undefined;
        const followFields = buildFollowUpCardFields(
          session.formConfig.createGuide,
          fallbackPatch,
          locale
        );
        if (followFields.length > 0) {
          if (fallbackPatch) {
            setCollected((prev) => ({ ...prev, ...fallbackPatch }));
          }
          setPhase('pre-followup');
          setQueue(followFields);
          setQueueIdx(0);
          setStage('guide');
          pushThread(
            'assistant',
            isDeckPlan
              ? '自动推荐暂不可用，已提供三套常用页数方案，请点选。'
              : '自动推荐暂不可用，请手动选择口播形式、人数与音色。'
          );
        } else {
          setStage('guide');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // 是否 C 端预览检索：只看 createGuide.webSearch 能力，不看业务名
    if (!needsCreateGuideClientWebSearchPreview(identity)) {
      enterBasicAfterPre(
        session,
        normalized,
        resolvePostPreAssistantHint({
          createGuide: session.formConfig.createGuide,
          usedClientWebSearchPreview: false,
        })
      );
      return;
    }

    setBusy(true);
    setStage('searching');
    const industry = String(normalized.industry ?? '').trim();
    const industryCustom = String(normalized.industry_custom ?? '').trim();
    const guideMax = session.formConfig.createGuide?.webSearch?.maxResults;
    const maxResults =
      typeof guideMax === 'number' && Number.isFinite(guideMax)
        ? Math.max(1, Math.min(200, Math.floor(guideMax)))
        : 200;
    // 发现池条数由服务端固定提炼；C 端只负责翻页展示（不再问用户要几条）
    const pageSize = 8;
    const searchInput = {
      industry: industry || '综合',
      industryCustom,
      dateMode: String(normalized.date_mode ?? 'today'),
      reportDate: String(normalized.report_date ?? '').trim() || undefined,
      searchRegion: String(normalized.search_region ?? 'global').trim() || 'global',
      language: String(normalized.language ?? locale).trim() || locale,
      maxResults,
      writingTaskKey: session.taskKey,
      writingSubtype: session.subtype ?? undefined,
    };
    const searchStarted = Date.now();
    emitGuideIo({
      id: 'create-guide:client-web-search',
      phase: 'create-guide',
      step: 'clientWebSearchPreview',
      label: '网络检索（引导预览）',
      status: 'running',
      at: searchStarted,
      inputSnapshot: searchInput,
    });
    try {
      const res = await previewWritingTrendSearch(searchInput);
      if (res.error || !res.data) throw new Error(res.error || '检索失败');
      const chips = [...res.data.topicChips];
      if (chips.length === 0) throw new Error('话题提炼未返回可用话题');
      if (
        guideSessionRef.current?.taskKey !== session.taskKey ||
        (guideSessionRef.current?.subtype ?? null) !== (session.subtype ?? null)
      ) {
        return;
      }
      emitGuideIo({
        id: 'create-guide:client-web-search',
        phase: 'create-guide',
        step: 'clientWebSearchPreview',
        label: '网络检索（引导预览）',
        status: 'done',
        at: searchStarted,
        durationMs: Date.now() - searchStarted,
        inputSnapshot: searchInput,
        outputSnapshot: {
          topicChips: chips,
          topicExtractTaskId: res.data.topicExtractTaskId ?? null,
          search_track: res.data.search_track,
          track_source: res.data.track_source,
          websource: res.data.websource,
        },
      });
      setPreWebsource(res.data.websource as unknown as Record<string, unknown>);
      const pool = Array.isArray(res.data.topicPool) && res.data.topicPool.length > 0
        ? res.data.topicPool.map(String)
        : chips;
      setTopicPool(pool);
      setTopicPageSize(pageSize);
      setTopicPageIndex(0);
      const first = pageTopicPool(pool, pageSize, 0);
      setTopicChips(first.chips.length > 0 ? first.chips : chips);
      if (res.data.search_track) {
        setCollected((prev) => ({ ...prev, search_track: res.data!.search_track }));
      }
      enterBasicAfterPre(
        session,
        normalized,
        resolvePostPreAssistantHint({
          createGuide: session.formConfig.createGuide,
          usedClientWebSearchPreview: true,
          topicChipCount: pool.length,
        })
      );
    } catch (e) {
      const faced = faceGuideError(e);
      const msg = faced.message;
      emitGuideIo({
        id: 'create-guide:client-web-search',
        phase: 'create-guide',
        step: 'clientWebSearchPreview',
        label: '网络检索（引导预览）',
        status: 'error',
        at: searchStarted,
        durationMs: Date.now() - searchStarted,
        inputSnapshot: searchInput,
        error: faced.debugDetail || msg,
      });
      setGuideError(faced);
      setErrorMsg(msg);
      setStage('guide');
      message.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const enterTaskNameStep = () => {
    setPhase('task-name');
    setQueue([
      {
        ...TASK_NAME_FIELD,
        default: taskLabel || undefined,
      },
    ]);
    setQueueIdx(0);
    pushThread('assistant', '最后一步：给任务起个名称（列表里会显示）。');
  };

  const enterConfirm = async (_basicValues: Record<string, unknown>, labelOverride?: string) => {
    const label = (labelOverride ?? taskLabel).trim();
    if (label) onTaskLabelChange(label);
    setStage('confirm');
    pushThread('assistant', '信息已齐。确认价格后才会真正创建任务并生成。');
  };

  /** 答完结构后：text 生成简要大纲，再进入大纲编辑步 */
  const runTopicArticleOutlinePreview = async (
    values: Record<string, unknown>,
    mid: NonNullable<ReturnType<typeof getCreateGuideMidPreOutline>>
  ): Promise<boolean> => {
    const session = guideSessionRef.current;
    if (!session) {
      message.error('引导会话已失效，请重新选择业务');
      setStage('select-business');
      return false;
    }
    const topic = String(values.topic ?? '').trim();
    const voiceCategory = String(values.voice_category ?? '').trim();
    const voiceId = String(values.voice_id ?? '').trim();
    if (!topic || !voiceCategory || !voiceId) {
      message.error('请先完成类别、风格与话题');
      return false;
    }
    const outlineInput = {
      topic,
      voiceCategory,
      voiceId,
      language: String(values.language ?? locale).trim() || locale,
      articleLength: String(values.article_length ?? 'standard').trim() || 'standard',
      structureId: String(values.structure_id ?? '').trim() || undefined,
      purpose:
        String(values.purpose ?? '').trim() || purposeForVoiceCategory(voiceCategory),
      supplement: String(values.supplement ?? '').trim() || undefined,
      textKey: mid.textKey,
    };
    const started = Date.now();
    emitGuideIo({
      id: 'create-guide:topic-article-outline',
      phase: 'create-guide',
      step: 'topicArticleOutlinePreview',
      label: '简要大纲预览',
      status: 'running',
      at: started,
      inputSnapshot: outlineInput,
    });
    setBusy(true);
    setStage('searching');
    pushThread('status', mid.loadingHint);
    try {
      const res = await previewTopicArticleOutline(outlineInput);
      if (res.error || !res.data) throw new Error(res.error || '大纲生成失败');
      if (
        guideSessionRef.current?.taskKey !== session.taskKey ||
        (guideSessionRef.current?.subtype ?? null) !== (session.subtype ?? null)
      ) {
        return false;
      }
      emitGuideIo({
        id: 'create-guide:topic-article-outline',
        phase: 'create-guide',
        step: 'topicArticleOutlinePreview',
        label: '简要大纲预览',
        status: 'done',
        at: started,
        durationMs: Date.now() - started,
        inputSnapshot: outlineInput,
        outputSnapshot: {
          outline: res.data.outline,
          textKey: res.data.textKey,
          topicExtractTaskId: res.data.topicExtractTaskId ?? null,
        },
      });
      setCollected((prev) => ({ ...prev, [mid.outlineField]: res.data!.outline }));
      setQueue((prev) =>
        prev.map((f) =>
          f.name === mid.outlineField
            ? { ...f, defaultObject: res.data!.outline as Record<string, unknown> }
            : f
        )
      );
      setStage('guide');
      pushThread(
        'assistant',
        `已生成「${res.data.outline.title || topic}」简要大纲（可直接改文，确认后成稿会跟随）。`
      );
      return true;
    } catch (e) {
      const faced = faceGuideError(e);
      const msg = faced.message;
      emitGuideIo({
        id: 'create-guide:topic-article-outline',
        phase: 'create-guide',
        step: 'topicArticleOutlinePreview',
        label: '简要大纲预览',
        status: 'error',
        at: started,
        durationMs: Date.now() - started,
        inputSnapshot: outlineInput,
        error: faced.debugDetail || msg,
      });
      // 仍进入大纲步，允许手写；避免卡死
      setGuideError(faced);
      setStage('guide');
      pushThread('assistant', `${msg}。可在下方自行写一份简要大纲，或跳过。`);
      return true;
    } finally {
      setBusy(false);
    }
  };

  /** 答完风格后：检索 + text 提炼写作选题，再进入话题步 */
  const runVoiceStyleTopicRecommend = async (
    values: Record<string, unknown>,
    mid: NonNullable<ReturnType<typeof getCreateGuideMidPreTopicRecommend>>
  ): Promise<boolean> => {
    const session = guideSessionRef.current;
    if (!session) {
      message.error('引导会话已失效，请重新选择业务');
      setStage('select-business');
      return false;
    }
    const voiceCategory = String(values.voice_category ?? '').trim();
    const voiceId = String(values.voice_id ?? '').trim();
    if (!voiceCategory || !voiceId) {
      message.error('请先完成类别与写作风格');
      return false;
    }
    const searchInput = {
      voiceCategory,
      voiceId,
      language: String(values.language ?? locale).trim() || locale,
      searchRegion: String(values.search_region ?? 'global').trim() || 'global',
      maxResults: mid.maxResults,
      topicCount: mid.topicCount,
      writingTaskKey: session.taskKey,
      writingSubtype: session.subtype ?? undefined,
      topicExtractTextKey: mid.topicExtractTextKey,
    };
    const searchStarted = Date.now();
    emitGuideIo({
      id: 'create-guide:voice-style-topics',
      phase: 'create-guide',
      step: 'voiceStyleTopicPreview',
      label: '写作选题推荐（风格检索）',
      status: 'running',
      at: searchStarted,
      inputSnapshot: searchInput,
    });
    setBusy(true);
    setStage('searching');
    pushThread('status', '正在按所选风格检索创作素材并生成选题，请稍候…');
    try {
      const res = await previewVoiceStyleTopics(searchInput);
      if (res.error || !res.data) {
        throw Object.assign(new Error(res.error || '话题推荐失败'), {
          code: res.code,
          debugDetail: res.debugDetail,
        });
      }
      const chips = [...res.data.topicChips];
      if (chips.length === 0) throw new Error('话题提炼未返回可用话题');
      if (
        guideSessionRef.current?.taskKey !== session.taskKey ||
        (guideSessionRef.current?.subtype ?? null) !== (session.subtype ?? null)
      ) {
        return false;
      }
      emitGuideIo({
        id: 'create-guide:voice-style-topics',
        phase: 'create-guide',
        step: 'voiceStyleTopicPreview',
        label: '写作选题推荐（风格检索）',
        status: 'done',
        at: searchStarted,
        durationMs: Date.now() - searchStarted,
        inputSnapshot: searchInput,
        outputSnapshot: {
          topicChips: chips,
          topicExtractTaskId: res.data.topicExtractTaskId ?? null,
          intentLabel: res.data.intentLabel,
          websource: res.data.websource,
        },
      });
      setPreWebsource(res.data.websource as unknown as Record<string, unknown>);
      const pool =
        Array.isArray(res.data.topicPool) && res.data.topicPool.length > 0
          ? res.data.topicPool.map(String)
          : chips;
      const pageSize = 12;
      setTopicPool(pool);
      setTopicPageSize(pageSize);
      setTopicPageIndex(0);
      const first = pageTopicPool(pool, pageSize, 0);
      setTopicChips(first.chips.length > 0 ? first.chips : chips);
      setStage('guide');
      setGuideError(null);
      setErrorMsg(null);
      pushThread(
        'assistant',
        `已根据「${res.data.intentLabel || '当前风格'}」提炼 ${pool.length} 条写作选题（可点选或自填，可换一批）。`
      );
      return true;
    } catch (e) {
      const faced = faceGuideError(e);
      const msg = faced.message;
      emitGuideIo({
        id: 'create-guide:voice-style-topics',
        phase: 'create-guide',
        step: 'voiceStyleTopicPreview',
        label: '写作选题推荐（风格检索）',
        status: 'error',
        at: searchStarted,
        durationMs: Date.now() - searchStarted,
        inputSnapshot: searchInput,
        error: faced.debugDetail || msg,
      });
      // 仍进入话题步，但无列表时禁止手填；提供重试
      setGuideError(faced);
      setTopicChips([]);
      setTopicPool([]);
      setStage('guide');
      pushThread('assistant', '选题推荐暂时未能完成，请点「重新检索」再试；成功后即可点选或自填。');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleFieldAnswer = (patch: Record<string, unknown>, displayText: string) => {
    pushThread('user', displayText);

    if (phase === 'task-name' || patch.__task_label != null) {
      const name = String(patch.__task_label ?? displayText).trim();
      if (name) onTaskLabelChange(name);
      void enterConfirm(collected, name);
      return;
    }

    const nextCollected = { ...collected, ...patch };
    // 话题写作：选类别即锁定体裁 purpose，不再单独询问
    if (typeof patch.voice_category === 'string' && patch.voice_category.trim()) {
      nextCollected.purpose = purposeForVoiceCategory(patch.voice_category);
    }
    if (typeof patch.core_topic === 'string') {
      const parts = String(patch.core_topic)
        .split(/[；;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 1) {
        nextCollected.main_topic = parts[0];
      }
    }
    setCollected(nextCollected);

    if (phase === 'pre') {
      if (queueIdx >= queue.length - 1) {
        void runSearchAfterPre(nextCollected);
        return;
      }
      const answeredName = String(queue[queueIdx]?.name ?? Object.keys(patch)[0] ?? '').trim();
      const nextField = queue[queueIdx + 1];
      const midFromGuide = getCreateGuideMidPreTopicRecommend({
        createGuide: guideSessionRef.current?.formConfig.createGuide,
      });
      // 兜底：voice_id 下一步是 topic 时强制中途检索（避免 createGuide 合并丢字段）
      const mid =
        midFromGuide ||
        (answeredName === 'voice_id' && nextField?.name === 'topic'
          ? {
              afterField: 'voice_id',
              topicField: 'topic',
              topicCount: 24,
              maxResults: 24,
              topicExtractTextKey: 'text/expert/writing-style-topics' as string | undefined,
            }
          : null);
      if (
        mid &&
        answeredName === mid.afterField &&
        nextField?.name === mid.topicField
      ) {
        void runVoiceStyleTopicRecommend(nextCollected, mid).then((ok) => {
          if (ok) setQueueIdx((i) => i + 1);
        });
        return;
      }
      const outlineMidFromGuide = getCreateGuideMidPreOutline({
        createGuide: guideSessionRef.current?.formConfig.createGuide,
      });
      const outlineMid =
        outlineMidFromGuide ||
        (answeredName === 'structure_id' && nextField?.name === 'outline'
          ? {
              afterField: 'structure_id',
              outlineField: 'outline',
              textKey: 'text/expert/topic-article-outline',
              loadingHint: '正在根据话题与结构生成简要大纲，请稍候…',
            }
          : null);
      if (
        outlineMid &&
        answeredName === outlineMid.afterField &&
        nextField?.name === outlineMid.outlineField
      ) {
        void runTopicArticleOutlinePreview(nextCollected, outlineMid).then((ok) => {
          if (ok) setQueueIdx((i) => i + 1);
        });
        return;
      }
      if (nextField?.name === 'date_mode') {
        pushThread('assistant', '请继续选择日期；确认后才会按对应时间窗检索。');
      }
      setQueueIdx((i) => i + 1);
      return;
    }

    if (phase === 'pre-followup') {
      if (queueIdx >= queue.length - 1) {
        const session = guideSessionRef.current;
        if (!session) {
          message.error('引导会话已失效，请重新选择业务');
          setStage('select-business');
          return;
        }
        enterBasicAfterPre(
          session,
          nextCollected,
          resolvePostPreAssistantHint({
            createGuide: session.formConfig.createGuide,
            usedClientWebSearchPreview: false,
          })
        );
        return;
      }
      setQueueIdx((i) => i + 1);
      return;
    }

    if (queueIdx < queue.length - 1) {
      let next = queueIdx + 1;
      // 单选话题已自动写入 main_topic 时跳过「指定主话题」步
      while (
        next < queue.length &&
        queue[next]?.name === 'main_topic' &&
        String(nextCollected.main_topic ?? '').trim()
      ) {
        next += 1;
      }
      if (next >= queue.length) {
        enterTaskNameStep();
        return;
      }
      if (queue[next]?.name === 'main_topic') {
        pushThread('assistant', '已选多个话题。可指定一条主线（也可跳过，由系统按热度选取）。');
      }
      setQueueIdx(next);
      return;
    }
    enterTaskNameStep();
  };

  const handleSkip = () => {
    pushThread('user', '（跳过）');
    // pre 阶段此前漏了推进，会导致「一直点跳过」卡死
    if (phase === 'pre') {
      if (queueIdx >= queue.length - 1) {
        void runSearchAfterPre(collected);
        return;
      }
      const answeredName = String(queue[queueIdx]?.name ?? '').trim();
      const nextField = queue[queueIdx + 1];
      const midFromGuide = getCreateGuideMidPreTopicRecommend({
        createGuide: guideSessionRef.current?.formConfig.createGuide,
      });
      const mid =
        midFromGuide ||
        (answeredName === 'voice_id' && nextField?.name === 'topic'
          ? {
              afterField: 'voice_id',
              topicField: 'topic',
              topicCount: 24,
              maxResults: 24,
              topicExtractTextKey: 'text/expert/writing-style-topics' as string | undefined,
            }
          : null);
      if (mid && answeredName === mid.afterField && nextField?.name === mid.topicField) {
        void runVoiceStyleTopicRecommend(collected, mid).then((ok) => {
          if (ok) setQueueIdx((i) => i + 1);
        });
        return;
      }
      const outlineMidFromGuide = getCreateGuideMidPreOutline({
        createGuide: guideSessionRef.current?.formConfig.createGuide,
      });
      const outlineMid =
        outlineMidFromGuide ||
        (answeredName === 'structure_id' && nextField?.name === 'outline'
          ? {
              afterField: 'structure_id',
              outlineField: 'outline',
              textKey: 'text/expert/topic-article-outline',
              loadingHint: '正在根据话题与结构生成简要大纲，请稍候…',
            }
          : null);
      if (
        outlineMid &&
        answeredName === outlineMid.afterField &&
        nextField?.name === outlineMid.outlineField
      ) {
        void runTopicArticleOutlinePreview(collected, outlineMid).then((ok) => {
          if (ok) setQueueIdx((i) => i + 1);
        });
        return;
      }
      setQueueIdx((i) => i + 1);
      return;
    }
    if (phase === 'pre-followup') {
      if (queueIdx < queue.length - 1) {
        setQueueIdx((i) => i + 1);
        return;
      }
      const session = guideSessionRef.current;
      if (!session) {
        message.error('引导会话已失效，请重新选择业务');
        setStage('select-business');
        return;
      }
      enterBasicAfterPre(
        session,
        collected,
        resolvePostPreAssistantHint({
          createGuide: session.formConfig.createGuide,
          usedClientWebSearchPreview: false,
        })
      );
      return;
    }
    if (phase === 'basic') {
      if (queueIdx < queue.length - 1) {
        let next = queueIdx + 1;
        while (
          next < queue.length &&
          queue[next]?.name === 'main_topic' &&
          String(collected.main_topic ?? '').trim()
        ) {
          next += 1;
        }
        if (next >= queue.length) {
          enterTaskNameStep();
          return;
        }
        setQueueIdx(next);
        return;
      }
      enterTaskNameStep();
      return;
    }
    if (phase === 'task-name') {
      void enterConfirm(collected);
    }
  };

  const handleFinalGenerate = async () => {
    const session = guideSessionRef.current;
    if (!session) {
      message.error('引导会话已失效，请重新选择业务');
      setStage('select-business');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setGuideError(null);
    const createStarted = Date.now();
    try {
      const withPurpose = {
        ...collected,
        language: String(collected.language ?? locale).trim() || locale,
      };
      const cat = String(withPurpose.voice_category ?? '').trim();
      if (cat) withPurpose.purpose = purposeForVoiceCategory(cat);
      const params: Record<string, unknown> = prepareTaskV2SubmitParams(
        normalizeOtherEnumCustomParams(
          normalizeDateModeParams(withPurpose),
          session.formConfig.schema
        ),
        session.formConfig.schema,
        { scope }
      );
      if (preWebsource) {
        const slimmed = slimWebsourceForSelectedTopics(
          preWebsource,
          params.topic ??
            params.core_topic ??
            params.main_topic ??
            collected.topic ??
            collected.core_topic ??
            collected.main_topic
        );
        params.sources = { websource: slimmed ?? preWebsource };
      }
      const submitParams = mergeTaskLabelIntoParams(params);
      emitGuideIo({
        id: 'create-guide:create-task',
        phase: 'create-guide',
        step: 'createTask',
        label: '创建任务',
        status: 'running',
        at: createStarted,
        inputSnapshot: {
          scope,
          taskKey: session.taskKey,
          subtype: session.subtype,
          params: submitParams,
          adminPipelineDebug: Boolean(adminPipelineDebug),
        },
      });
      const res = await runTaskV2({
        scope,
        taskKey: session.taskKey,
        subtype: session.subtype,
        params: submitParams,
        ...(adminPipelineDebug ? { adminPipelineDebug: true } : {}),
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }
      const id = pickTaskIdFromRunTaskV2Response(res.data);
      emitGuideIo({
        id: 'create-guide:create-task',
        phase: 'create-guide',
        step: 'createTask',
        label: '创建任务',
        status: 'done',
        at: createStarted,
        durationMs: Date.now() - createStarted,
        inputSnapshot: {
          scope,
          taskKey: session.taskKey,
          subtype: session.subtype,
          params: submitParams,
          adminPipelineDebug: Boolean(adminPipelineDebug),
        },
        outputSnapshot: { taskId: id ?? null, raw: res.data },
      });
      if (id) onTaskCreated(id);
      message.success('任务已创建');
      onFinished();
    } catch (e) {
      const faced = faceGuideError(e);
      const msg = faced.message;
      emitGuideIo({
        id: 'create-guide:create-task',
        phase: 'create-guide',
        step: 'createTask',
        label: '创建任务',
        status: 'error',
        at: createStarted,
        durationMs: Date.now() - createStarted,
        error: faced.debugDetail || msg,
      });
      setGuideError(faced);
      setErrorMsg(msg);
      message.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const currentField = queue[queueIdx];
  // searching 仅当 createGuide 声明了 C 端检索预览；有 pre 卡不等于要检索
  const progressStages: Stage[] = (() => {
    const base: Stage[] =
      needsClientSearchPreview || needsNestedTextPreview || needsMidPreTopicRecommend
        ? ['select-business', 'guide', 'searching', 'confirm']
        : ['select-business', 'guide', 'confirm'];
    return lockBusiness ? base.filter((s) => s !== 'select-business') : base;
  })();

  return (
    <div ref={shellRef} className="writing-create-wizard">
      <div className="writing-create-wizard__progress" aria-hidden>
        {progressStages.map((s) => (
          <span
            key={s}
            className={
              s === stage
                ? 'writing-create-wizard__pip writing-create-wizard__pip--on'
                : 'writing-create-wizard__pip'
            }
          />
        ))}
      </div>
      <p className="writing-create-wizard__hint">
        {stage === 'select-business'
          ? '选择业务'
          : stage === 'searching'
            ? needsNestedTextPreview
              ? '分析中'
              : '检索中'
            : stage === 'confirm'
              ? '确认生成'
              : '引导填写'}
      </p>

      {guideError ? (
        <ErrorNotice
          resolved={guideError}
          isAdmin={isAdmin}
          className="writing-create-wizard__error-notice"
          actionLabel={guideError.retryable ? '重新检索' : undefined}
          onAction={
            guideError.retryable && currentField?.name === 'topic'
              ? () => {
                  setGuideError(null);
                  const mid =
                    getCreateGuideMidPreTopicRecommend({
                      createGuide: guideSessionRef.current?.formConfig.createGuide,
                    }) || {
                      afterField: 'voice_id',
                      topicField: 'topic',
                      topicCount: 24,
                      maxResults: 24,
                      topicExtractTextKey: 'text/expert/writing-style-topics',
                    };
                  void runVoiceStyleTopicRecommend(collected, mid);
                }
              : undefined
          }
        />
      ) : errorMsg ? (
        <ErrorNotice error={errorMsg} isAdmin={isAdmin} className="writing-create-wizard__error-notice" />
      ) : null}

      {lockBusiness && stage === 'select-business' ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin description={configLoading || !formConfig?.schema ? '加载表单配置…' : '正在进入引导…'} />
        </div>
      ) : null}

      {stage === 'select-business' && !lockBusiness ? (
        <div className="biz-list">
          {configLoading && taskOptions.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : null}
          {bizGroups.map((g) => (
            <section key={g.groupKey}>
              <h3 className="biz-list__group-title">{g.groupLabel}</h3>
              <div className="biz-list__items">
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={
                      item.key === selectedValue
                        ? 'biz-list__item biz-list__item--active'
                        : 'biz-list__item'
                    }
                    onClick={() => pickBusiness(item)}
                  >
                    <p className="biz-list__item-title">{item.title}</p>
                    <p className="biz-list__item-desc">{item.description}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {(stage === 'guide' || stage === 'searching') && (
        <>
          <div className="guided-thread">
            {thread.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'guided-thread__row guided-thread__row--user'
                    : 'guided-thread__row guided-thread__row--assistant'
                }
              >
                <p
                  className={
                    m.role === 'user'
                      ? 'guided-thread__bubble guided-thread__bubble--user'
                      : m.role === 'status'
                        ? 'guided-thread__bubble guided-thread__bubble--status'
                        : 'guided-thread__bubble guided-thread__bubble--assistant'
                  }
                >
                  {m.text}
                </p>
              </div>
            ))}
            {stage === 'searching' ? (
              <div className="guided-thread__row guided-thread__row--assistant">
                <div
                  className="guided-thread__searching"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  aria-label={
                    needsNestedTextPreview
                      ? '正在分析文稿并生成推荐'
                      : getCreateGuideMidPreOutline({
                            createGuide: guideSessionRef.current?.formConfig.createGuide,
                          }) &&
                          String(collected.structure_id ?? '').trim() &&
                          !collected.outline
                        ? '正在生成简要大纲'
                        : getCreateGuideMidPreTopicRecommend({
                              createGuide: guideSessionRef.current?.formConfig.createGuide,
                            })
                          ? '正在按风格检索写作选题'
                          : '正在检索该日要闻'
                  }
                >
                  <span className="guided-thread__searching-orb" aria-hidden>
                    <Search size={16} strokeWidth={2.25} className="guided-thread__searching-icon" />
                    <span className="guided-thread__searching-ring" />
                    <span className="guided-thread__searching-ring guided-thread__searching-ring--delay" />
                  </span>
                  <span className="guided-thread__searching-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={threadEndRef} />
          </div>

          {stage === 'guide' && currentField ? (
            <GuidedChatField
              key={`${phase}-${currentField.name}-${queueIdx}`}
              field={
                currentField.name === '__task_label'
                  ? { ...currentField, default: taskLabel || undefined }
                  : currentField.name === 'outline' &&
                      collected.outline &&
                      typeof collected.outline === 'object' &&
                      !Array.isArray(collected.outline)
                    ? {
                        ...currentField,
                        // 已有预生成大纲：必须确认，避免只点「跳过」看不见表单内容
                        required: true,
                        'x-ui': 'outline-pre',
                        'x-ui-type': 'outline',
                        defaultObject: collected.outline as Record<string, unknown>,
                      }
                    : currentField.name === 'outline'
                      ? {
                          ...currentField,
                          'x-ui': 'outline-pre',
                          'x-ui-type': 'outline',
                        }
                      : currentField
              }
              topicChips={topicChips}
              topicPool={topicPool}
              onReshuffleTopics={
                topicPool.length > topicPageSize
                  ? () => {
                      const next = pageTopicPool(topicPool, topicPageSize, topicPageIndex + 1);
                      setTopicPageIndex(next.pageIndex);
                      setTopicChips(next.chips);
                    }
                  : undefined
              }
              reshuffleDisabled={topicPool.length <= topicPageSize}
              reshuffleHint={
                topicPool.length > topicPageSize
                  ? `发现池 ${topicPool.length} 条 · 第 ${topicPageIndex + 1}/${Math.max(1, Math.ceil(topicPool.length / Math.max(1, topicPageSize)))} 批`
                  : undefined
              }
              onRetryTopicRecommend={
                currentField.name === 'topic'
                  ? () => {
                      const mid =
                        getCreateGuideMidPreTopicRecommend({
                          createGuide: guideSessionRef.current?.formConfig.createGuide,
                        }) || {
                          afterField: 'voice_id',
                          topicField: 'topic',
                          topicCount: 24,
                          maxResults: 24,
                          topicExtractTextKey: 'text/expert/writing-style-topics',
                        };
                      void runVoiceStyleTopicRecommend(collected, mid);
                    }
                  : undefined
              }
              submitting={busy}
              onAnswer={handleFieldAnswer}
              onSkip={
                currentField.name === 'outline' &&
                collected.outline &&
                typeof collected.outline === 'object'
                  ? undefined
                  : !currentField.required ||
                      (currentField.name === 'brief' &&
                        (() => {
                          const sm = collected.source_material;
                          if (typeof sm === 'string') return sm.trim().length > 0;
                          if (sm && typeof sm === 'object' && !Array.isArray(sm)) {
                            return String((sm as { text?: string }).text ?? '').trim().length > 0;
                          }
                          return false;
                        })())
                    ? handleSkip
                    : undefined
              }
              onSoftPatch={(patch) => setCollected((prev) => ({ ...prev, ...patch }))}
              contextValues={collected}
            />
          ) : null}

          {stage === 'guide' && (pendingStart || configLoading) && !currentField ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Spin description="加载表单配置…" />
            </div>
          ) : null}

          {stage === 'guide' && !busy && !lockBusiness ? (
            <button
              type="button"
              className="guided-chat-field__skip"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                resetGuideState();
                setStage('select-business');
                setPendingStart(false);
              }}
            >
              ← 重选业务
            </button>
          ) : null}
        </>
      )}

      {stage === 'confirm' ? (
        <div className="writing-create-wizard__confirm">
          <div className="guided-thread" style={{ maxHeight: 180 }}>
            {thread.slice(-4).map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'guided-thread__row guided-thread__row--user'
                    : 'guided-thread__row guided-thread__row--assistant'
                }
              >
                <p
                  className={
                    m.role === 'user'
                      ? 'guided-thread__bubble guided-thread__bubble--user'
                      : 'guided-thread__bubble guided-thread__bubble--assistant'
                  }
                >
                  {m.text}
                </p>
              </div>
            ))}
          </div>
          <p className="writing-create-wizard__hint">
            任务名：{taskLabel || '（未命名）'}
          </p>
          <TaskBillingBar
            scope={scope}
            taskKey={guideSession?.taskKey ?? taskKey}
            subtype={(guideSession?.subtype ?? subtype) ?? null}
            params={confirmEstimateParams}
            enabled={Boolean(guideSession)}
            debounceMs={300}
            onStateChange={onBillingStateChange}
          />
          <div className="writing-create-wizard__confirm-actions">
            <Button
              onClick={() => {
                setStage('guide');
                enterTaskNameStep();
              }}
              disabled={busy}
            >
              修改任务名
            </Button>
            <Button
              type="primary"
              size="large"
              loading={busy || billing.loading}
              disabled={!billing.canSubmit}
              onClick={() => void handleFinalGenerate()}
            >
              {formatGenerateButtonLabel(generateLabel, billing.estimate, billing.loading, {
                insufficientBalance: billing.blockReason === 'insufficient_balance',
                locale,
              })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
