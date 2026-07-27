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
import { Alert, App, Button, Spin } from 'antd';
import { Search } from 'lucide-react';
import {
  previewWritingTrendSearch,
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
import { schemaToWarpFields } from './schemaToWarpFields';
import { formatTaskSelectionKey, pickTaskIdFromRunTaskV2Response } from '../task-v2';
import { type AppLocale, pickDisplayLocalizedString } from '../i18n/appLocale';
import { userFacingCopy, userFacingTaskError } from '../lib/uiCopyHygiene';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import {
  filterBasicFieldsByCreateGuide,
  indicatesWarpGatesCreate,
  needsCreateGuideClientWebSearchPreview,
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
  'topic_count',
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

function schemaPropToField(name: string, prop: Record<string, unknown>, required: boolean): WarpGateField {
  const rawTitle = typeof prop.title === 'string' ? prop.title : name;
  const rawDesc = typeof prop.description === 'string' ? prop.description : '';
  const title =
    name === 'subjective_analysis'
      ? userFacingCopy(rawTitle, '主观分析')
      : name === 'style'
        ? userFacingCopy(rawTitle, '文章风格')
        : userFacingCopy(rawTitle, name);
  const description =
    name === 'subjective_analysis'
      ? userFacingCopy(
          rawDesc,
          '关闭时按报道体只写事实；打开后选择分析立场，成稿在事实后加入带情绪的主观推论。'
        )
      : name === 'style'
        ? userFacingCopy(
            rawDesc,
            '选一种风格：速报（客观列新闻）/ 专业深挖（带分析推理）/ 幽默解读（诙谐点评）；点「自定义…」可写偏好或 @ 引用语感文风。'
          )
        : userFacingCopy(rawDesc) || undefined;
  const xUiTypeRaw = typeof prop['x-ui-type'] === 'string' ? prop['x-ui-type'] : undefined;
  const knownScale =
    name === 'structure_divergence' || name === 'style_divergence' || name === 'seek_count';
  const xUiType = xUiTypeRaw === 'scale' || knownScale ? 'scale' : xUiTypeRaw;
  const isScale = xUiType === 'scale';
  const enumLabels = Array.isArray(prop['x-enum-labels'])
    ? prop['x-enum-labels'].map(String)
    : undefined;
  let minimum = typeof prop.minimum === 'number' ? prop.minimum : undefined;
  let maximum = typeof prop.maximum === 'number' ? prop.maximum : undefined;
  // scale：若只给了 enum 数字列表，从中推导区间
  if (isScale && (minimum == null || maximum == null) && Array.isArray(prop.enum) && prop.enum.length) {
    const nums = prop.enum.map(Number).filter((n) => Number.isFinite(n));
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
  return {
    name,
    type: isBool ? 'boolean' : typeof prop.type === 'string' ? prop.type : 'string',
    title,
    description,
    // scale 不走枚举 chips；区间用 minimum/maximum；boolean 由 GuidedChatField 专属 UI
    enum: isScale || isBool ? undefined : Array.isArray(prop.enum) ? prop.enum.map(String) : undefined,
    required,
    default:
      isBool
        ? prop.default === true || prop.default === 'true'
          ? 'true'
          : 'false'
        : prop.default != null
          ? String(prop.default)
          : undefined,
    'x-ui':
      name === 'core_topic'
        ? 'topic-chips'
        : name === 'main_topic'
          ? 'main-topic'
          : typeof prop['x-ui'] === 'string'
            ? prop['x-ui']
            : undefined,
    'x-ui-type': xUiType,
    minimum,
    maximum,
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
}

/** 挂卡 / 「其他」补充字段：禁止单独成引导步 */
function isInlineSupplementField(name: string, prop: Record<string, unknown>): boolean {
  if (
    name === 'style_custom' ||
    name === 'analysis_stance' ||
    name === 'industry_custom' ||
    name === 'writing_folder_id' ||
    name === 'report_date'
  ) {
    return true;
  }
  if (prop['x-ui-type'] === 'folderCard') return true;
  if (prop['x-show-when'] != null || prop['x-hide-when'] != null) return true;
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
  // 热点条数：引导常以字符串写入，统一成 1～30 整数
  const tc = resolveTopicCountPreference(params.topic_count);
  if (params.topic_count != null && params.topic_count !== '') {
    out.topic_count = tc;
  }
  return out;
}

/** 用户选题条数：优先用前面的候选；支持 number / "20" */
function resolveTopicCountPreference(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const n = typeof c === 'number' ? c : Number(String(c).trim());
    if (Number.isFinite(n) && n >= 1) return Math.max(1, Math.min(30, Math.floor(n)));
  }
  return 8;
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

function guideFieldToWarp(raw: Record<string, unknown> & { name: string }): WarpGateField {
  const name = String(raw.name).trim();
  const enums = Array.isArray(raw.enum) ? raw.enum.map(String) : undefined;
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
  const defaultRaw = raw.default != null ? String(raw.default) : undefined;
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
  return {
    name,
    type: typeof raw.type === 'string' ? raw.type : 'string',
    title: typeof raw.title === 'string' ? raw.title : name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    enum: isScale ? undefined : displayEnum,
    required: raw.required === true,
    default: defaultDisplay,
    'x-ui':
      name === 'core_topic'
        ? 'topic-chips'
        : typeof raw['x-ui'] === 'string'
          ? raw['x-ui']
          : undefined,
    'x-ui-type': xUiType,
    minimum,
    maximum,
    'x-enum-labels': Array.isArray(raw['x-enum-labels'])
      ? raw['x-enum-labels'].map(String)
      : undefined,
  };
}

/**
 * pre 引导字段：只认当前业务的 createGuide / schema，禁止硬编码某业务字段（曾误把行业日报塞给角度探索）。
 */
function buildPreCardFields(
  schema: TaskFormConfig['schema'] | null | undefined,
  createGuide?: TaskFormConfig['createGuide']
): WarpGateField[] {
  const cardFields = createGuide?.interactiveCard?.fields;
  if (Array.isArray(cardFields) && cardFields.length > 0) {
    const hint = createGuide?.interactiveCard?.hint?.trim();
    return cardFields
      .filter((f) => f && typeof f.name === 'string' && String(f.name).trim())
      .filter((f) => {
        const n = String(f.name).trim();
        // industry_custom / report_date 由「自定义」入口承接；language 跟 App locale，不单独成步
        return n !== 'industry_custom' && n !== 'report_date' && n !== 'language';
      })
      .map((f) => {
        const field = guideFieldToWarp(f as Record<string, unknown> & { name: string });
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
    if (name === 'industry_custom' || name === 'report_date' || name === 'language') continue;
    if ((prop as Record<string, unknown>)['x-hidden'] === true) continue;
    fields.push(schemaPropToField(name, prop as Record<string, unknown>, name === 'industry'));
  }
  if (fields.length > 0) return fields;

  // 再退一步：schema 有 topic 就只问 topic（写作类常见）
  if (props.topic) {
    return [schemaPropToField('topic', props.topic as Record<string, unknown>, true)];
  }
  return [];
}

function buildBasicFields(
  schema: TaskFormConfig['schema'] | null | undefined,
  session?: Pick<GuideSession, 'formConfig'> | null
): WarpGateField[] {
  const props = schema?.properties ?? {};
  const out: WarpGateField[] = [];
  for (const name of BASIC_ORDER) {
    if (isInlineSupplementField(name, (props[name] as Record<string, unknown>) ?? {})) continue;
    if (props[name]) out.push(schemaPropToField(name, props[name], false));
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
      out.push(schemaPropToField(name, prop as Record<string, unknown>, false));
    }
  }
  return filterBasicFieldsByCreateGuide(out, {
    schema: session?.formConfig.schema ?? schema,
    createGuide: session?.formConfig.createGuide,
  });
}

function pickI18n(
  locale: AppLocale,
  primary: string | null | undefined,
  map: Record<string, string> | null | undefined,
  fallback: string
): string {
  return pickDisplayLocalizedString(primary, map, locale, fallback);
}

type BizGroup = {
  taskKey: string;
  groupLabel: string;
  items: Array<{
    key: string;
    taskKey: string;
    subtype: string | null;
    title: string;
    description: string;
  }>;
};

function groupBusinesses(options: TaskFormConfigListItem[], locale: AppLocale): BizGroup[] {
  const map = new Map<string, BizGroup>();
  for (const o of options) {
    const groupLabel = pickI18n(locale, o.taskLabel, o.taskLabelI18n, o.taskKey);
    const title = pickI18n(
      locale,
      o.subtypeLabel,
      o.subtypeLabelI18n,
      o.subtype || o.taskKey
    );
    const description = pickI18n(
      locale,
      o.description,
      o.descriptionI18n,
      '选择此业务开始引导填写'
    );
    let g = map.get(o.taskKey);
    if (!g) {
      g = { taskKey: o.taskKey, groupLabel, items: [] };
      map.set(o.taskKey, g);
    }
    g.items.push({
      key: formatTaskSelectionKey(o.taskKey, o.subtype),
      taskKey: o.taskKey,
      subtype: o.subtype,
      title,
      description,
    });
  }
  return [...map.values()];
}

export type WritingCreateWizardProps = {
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
};

export function WritingCreateWizard({
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
}: WritingCreateWizardProps) {
  const { message } = App.useApp();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<Stage>('select-business');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState<Record<string, unknown>>({});
  const [preWebsource, setPreWebsource] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<WarpGateField[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [topicChips, setTopicChips] = useState<string[]>([]);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [pendingStart, setPendingStart] = useState(false);
  /** 点击业务时钉死的选型键，避免用上一业务的 formConfig 开引导 */
  const [pendingSelectionKey, setPendingSelectionKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pre' | 'basic' | 'task-name'>('pre');
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

  const bizGroups = useMemo(() => groupBusinesses(taskOptions, locale), [taskOptions, locale]);

  const confirmEstimateParams = useMemo(() => collected, [collected]);

  const resetGuideState = useCallback(() => {
    setErrorMsg(null);
    setCollected({});
    setPreWebsource(null);
    setQueue([]);
    setQueueIdx(0);
    setTopicChips([]);
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
      setPreWebsource(null);
      setTopicChips([]);
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
        const pre = buildPreCardFields(cfg.schema, cfg.createGuide);
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

      const fields = schemaToWarpFields(cfg.schema);
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
    setStage('select-business');
    message.warning('业务选择已变更，请重新选择业务，避免流程串用。');
  }, [guideSession, taskKey, subtype, stage, resetGuideState, message]);

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
    const fields = buildBasicFields(session.formConfig.schema, session);
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
    try {
      const industry = String(normalized.industry ?? '').trim();
      const industryCustom = String(normalized.industry_custom ?? '').trim();
      const guideMax = session.formConfig.createGuide?.webSearch?.maxResults;
      const maxResults =
        typeof guideMax === 'number' && Number.isFinite(guideMax)
          ? Math.max(1, Math.min(200, Math.floor(guideMax)))
          : 200;
      const topicCount = resolveTopicCountPreference(
        normalized.topic_count,
        preValues.topic_count,
        collected.topic_count,
        (session.formConfig.createGuide?.webSearch as { topicCount?: unknown } | undefined)
          ?.topicCount
      );
      const res = await previewWritingTrendSearch({
        industry: industry || '综合',
        industryCustom,
        dateMode: String(normalized.date_mode ?? 'today'),
        reportDate: String(normalized.report_date ?? '').trim() || undefined,
        searchRegion: String(normalized.search_region ?? 'global').trim() || 'global',
        language: String(normalized.language ?? 'zh').trim() || 'zh',
        maxResults,
        topicCount,
        writingTaskKey: session.taskKey,
        writingSubtype: session.subtype ?? undefined,
      });
      if (res.error || !res.data) throw new Error(res.error || '检索失败');
      const chips = [...res.data.topicChips];
      if (chips.length === 0) throw new Error('话题提炼未返回可用话题');
      if (
        guideSessionRef.current?.taskKey !== session.taskKey ||
        (guideSessionRef.current?.subtype ?? null) !== (session.subtype ?? null)
      ) {
        return;
      }
      setPreWebsource(res.data.websource as unknown as Record<string, unknown>);
      setTopicChips(chips);
      if (res.data.search_track) {
        setCollected((prev) => ({ ...prev, search_track: res.data!.search_track }));
      }
      enterBasicAfterPre(
        session,
        normalized,
        resolvePostPreAssistantHint({
          createGuide: session.formConfig.createGuide,
          usedClientWebSearchPreview: true,
          topicChipCount: chips.length,
        })
      );
    } catch (e) {
      const msg = userFacingTaskError(e instanceof Error ? e.message : String(e));
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

  const handleFieldAnswer = (patch: Record<string, unknown>, displayText: string) => {
    pushThread('user', displayText);

    if (phase === 'task-name' || patch.__task_label != null) {
      const name = String(patch.__task_label ?? displayText).trim();
      if (name) onTaskLabelChange(name);
      void enterConfirm(collected, name);
      return;
    }

    const nextCollected = { ...collected, ...patch };
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
      const nextField = queue[queueIdx + 1];
      if (nextField?.name === 'date_mode') {
        pushThread('assistant', '请继续选择日期；确认后才会按对应时间窗检索。');
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
    try {
      const params: Record<string, unknown> = normalizeOtherEnumCustomParams(
        normalizeDateModeParams({
          ...collected,
          language: String(collected.language ?? locale).trim() || locale,
        }),
        session.formConfig.schema
      );
      if (preWebsource) {
        params.sources = { websource: preWebsource };
      }
      const res = await runTaskV2({
        scope: 'writing',
        taskKey: session.taskKey,
        subtype: session.subtype,
        params: mergeTaskLabelIntoParams(params),
      });
      if (res.error) {
        if (handleTaskBillingResponseError(res)) return;
        throw new Error(res.error);
      }
      const id = pickTaskIdFromRunTaskV2Response(res.data);
      if (id) onTaskCreated(id);
      message.success('任务已创建');
      onFinished();
    } catch (e) {
      const msg = userFacingTaskError(e instanceof Error ? e.message : String(e));
      setErrorMsg(msg);
      message.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const currentField = queue[queueIdx];
  // searching 仅当 createGuide 声明了 C 端检索预览；有 pre 卡不等于要检索
  const progressStages: Stage[] = needsClientSearchPreview
    ? ['select-business', 'guide', 'searching', 'confirm']
    : hasPreCard
      ? ['select-business', 'guide', 'confirm']
      : ['select-business', 'guide', 'confirm'];

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
            ? '检索中'
            : stage === 'confirm'
              ? '确认生成'
              : '引导填写'}
      </p>

      {errorMsg ? <Alert type="error" showIcon title={errorMsg} /> : null}

      {stage === 'select-business' ? (
        <div className="biz-list">
          {configLoading && taskOptions.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : null}
          {bizGroups.map((g) => (
            <section key={g.taskKey}>
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
                  aria-label="正在检索该日要闻"
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
                  : currentField
              }
              topicChips={topicChips}
              submitting={busy}
              onAnswer={handleFieldAnswer}
              onSkip={!currentField.required ? handleSkip : undefined}
              contextValues={collected}
            />
          ) : null}

          {stage === 'guide' && (pendingStart || configLoading) && !currentField ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Spin description="加载表单配置…" />
            </div>
          ) : null}

          {stage === 'guide' ? (
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
            scope="writing"
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
