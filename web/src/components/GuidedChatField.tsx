/**
 * 对话式单字段引导：助手提问 + 选项 chips + 自定义输入（上传除外）
 * 点选选项即推进；话题（topic-chips）为多选，需点「确认选题」再推进；主话题（main-topic）为单选可跳过。
 * 整数刻度（x-ui-type: scale）用专属滑杆，无「自定义…」。
 */
import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Button, Input, Slider, Upload } from 'antd';
import { ArrowUp, SkipForward } from 'lucide-react';
import type { WarpGateField } from './WarpGateWizard';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import { userFacingCopy } from '../lib/uiCopyHygiene';
import { FolderCardAtField } from './knowledge-base/FolderCardAtField';

gsap.registerPlugin(useGSAP);

const STYLE_TONE_RECS = [
  '冷静短句，少感叹',
  '先事实后判断，克制评论',
  '清晰好读，少堆行话',
  '有锋芒但不人身攻击',
  '温和亲和，术语轻轻带过',
];

/** 行业日报等：主观分析打开后的立场（与 schema analysis_stance.enum 对齐） */
const ANALYSIS_STANCES: Array<{ value: string; label: string }> = [
  { value: '基于数据客观分析', label: '客观分析' },
  { value: '基于数据批判性分析', label: '批判性分析' },
  { value: '基于数据幽默分析', label: '幽默分析' },
  { value: '基于数据乐观分析', label: '乐观分析' },
];

export type GuidedChatFieldProps = {
  field: WarpGateField;
  topicChips?: string[];
  submitting?: boolean;
  /** 附加值（如 industry_custom / report_date）合并进提交 */
  onAnswer: (patch: Record<string, unknown>, displayText: string) => void;
  onSkip?: () => void;
  /** 上下文：当前 Wizard 已收集的值，用来在「自定义」输入框下面回显提示 */
  contextValues?: Record<string, unknown>;
};

function isUploadField(field: WarpGateField): boolean {
  const ui = field['x-ui'];
  return ui === 'upload' || ui === 'image' || ui === 'file' || field.type === 'file';
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
  submitting = false,
  onAnswer,
  onSkip,
  contextValues,
}: GuidedChatFieldProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [scaleValue, setScaleValue] = useState(5);
  /** 主观分析：点「打开」后展开立场 chips */
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const enums = field.enum ?? [];
  const isTopic = field['x-ui'] === 'topic-chips' || field.name === 'core_topic';
  const isMainTopic = field['x-ui'] === 'main-topic' || field.name === 'main_topic';
  const isSubjectiveAnalysis = field.name === 'subjective_analysis';
  const isUpload = isUploadField(field);
  const isScale = isScaleField(field);
  const { min: scaleMin, max: scaleMax } = scaleBounds(field);
  const mainTopicCandidates = isMainTopic ? splitJoinedTopics(contextValues?.core_topic) : [];
  // industry/style/article_structure「其他」、date_mode「指定日期/custom」与「自定义…」重复，只保留自定义入口
  const chips = (
    isScale || isSubjectiveAnalysis
      ? []
      : isMainTopic
        ? mainTopicCandidates
        : isTopic && topicChips.length > 0
          ? topicChips
          : enums
  ).filter((chip) => {
    if (isTopic || isMainTopic) return true;
    if (
      (field.name === 'industry' || field.name === 'style' || field.name === 'article_structure') &&
      (chip === '其他' || chip === '其它')
    ) {
      return false;
    }
    if (field.name === 'date_mode' && (chip === '指定日期' || chip === 'custom')) {
      return false;
    }
    return true;
  });

  // 当前字段对应的「其他」补充字段名 + 已选枚举
  const OTHER_PAIR: Record<string, string> = {
    industry: 'industry_custom',
    style: 'style_custom',
    article_structure: 'article_structure_custom',
  };
  const otherField = OTHER_PAIR[field.name];
  const otherSelected = otherField ? String(contextValues?.[field.name] ?? '').trim() === '其他' : false;
  const otherFieldTitle =
    otherField === 'article_structure_custom'
      ? '自定义结构说明'
      : otherField === 'style_custom'
        ? '自定义语气'
      : otherField === 'industry_custom'
          ? '自定义行业'
          : null;

  const prompt = isMainTopic
    ? userFacingCopy(field.description, '从已选话题中指定一条主线；跳过则由系统按热度自动选取。')
    : isTopic
      ? userFacingCopy(
          field.description,
          '可多选具体事件；一条检索可能对应多条。点选后点「确认选题」，也可手写补充。'
        )
      : isSubjectiveAnalysis
        ? userFacingCopy(
            field.description,
            '关闭时按报道体只写事实；打开后选择分析立场，成稿在事实后加入带情绪的主观推论。'
          )
      : isScale
        ? userFacingCopy(field.description, `拖动滑杆选择「${field.title || field.name}」`)
        : userFacingCopy(field.description, `请选择或填写「${field.title || field.name}」`);

  const placeholder =
    field.placeholder ||
    (isTopic
      ? '可补充自定义话题；与上方多选合并提交'
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
    setCustomText(field.default != null ? String(field.default) : '');
    setExtra({});
    setError(null);
    setSelectedTopics([]);
    setAnalysisOpen(false);
    if (isScaleField(field)) {
      const { min, max } = scaleBounds(field);
      const raw = Number(field.default);
      const next = Number.isFinite(raw) ? Math.round(raw) : Math.round((min + max) / 2);
      setScaleValue(Math.min(max, Math.max(min, next)));
    }
  }, [field.name, field.default, field.minimum, field.maximum, field['x-ui-type']]);

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
    if (field.required && (value == null || String(value).trim() === '')) {
      setError(`请完成「${field.title || field.name}」`);
      return;
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

  const sendCustom = () => {
    if (isTopic) {
      commitTopics();
      return;
    }
    const t = customText.trim();
    const styleFolder = String(extra.writing_folder_id ?? '').trim();
    if (field.name === 'style' && !t && styleFolder) {
      commit('其他', '已选语感文风', {
        style_custom: '',
        writing_folder_id: styleFolder,
      });
      return;
    }
    if (!t && field.required) {
      setError('请输入内容');
      return;
    }
    if (!t && !field.required) {
      onSkip?.();
      return;
    }
    // 「自定义」入口：枚举字段必须落成「其他」+ *_custom，不能把自由文本写进 enum 字段（否则 JSON Schema 校验失败）
    if (field.name === 'industry') {
      commit('其他', t, { industry_custom: t });
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
          {field.required ? <span className="guided-chat-field__req">*</span> : null}
        </p>
        <p className="guided-chat-field__prompt">{prompt}</p>
      </div>

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
          <button
            type="button"
            role="option"
            className={
              !analysisOpen
                ? 'guided-chat-field__chip guided-chat-field__chip--selected'
                : 'guided-chat-field__chip'
            }
            disabled={submitting}
            onClick={() => {
              setError(null);
              setAnalysisOpen(false);
              commit(false, '关闭 · 纯报道', { analysis_stance: '' });
            }}
          >
            关闭（纯报道）
          </button>
          <button
            type="button"
            role="option"
            className={
              analysisOpen
                ? 'guided-chat-field__chip guided-chat-field__chip--selected'
                : 'guided-chat-field__chip'
            }
            disabled={submitting}
            onClick={() => {
              setError(null);
              setAnalysisOpen(true);
            }}
          >
            打开
          </button>
          {analysisOpen ? (
            <div
              className="guided-chat-field__custom-inline"
              role="group"
              aria-label="分析立场"
              style={{ flexBasis: '100%', marginTop: 4 }}
            >
              <label className="guided-chat-field__custom-inline-label">
                分析立场
                <span className="guided-chat-field__custom-inline-required">必选</span>
              </label>
              <div className="guided-chat-field__chips" role="listbox" aria-label="分析立场">
                {ANALYSIS_STANCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="option"
                    className="guided-chat-field__chip"
                    disabled={submitting}
                    onClick={() => {
                      setError(null);
                      commit(true, s.label, { analysis_stance: s.value });
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isUpload && !isScale && !isSubjectiveAnalysis && chips.length > 0 ? (
        <div
          className="guided-chat-field__chips"
          role={isTopic ? 'group' : 'listbox'}
          aria-label={field.title || field.name}
          aria-multiselectable={isTopic || undefined}
        >
          {chips.map((chip) => {
            const selected = isTopic && selectedTopics.includes(chip);
            const label =
              field.name === 'language'
                ? LANGUAGE_LABELS[chip] || chip
                : field.name === 'search_region'
                  ? SEARCH_REGION_LABELS[chip] || chip
                  : chip;
            return (
              <button
                key={chip}
                type="button"
                role={isTopic ? 'checkbox' : 'option'}
                aria-checked={isTopic ? selected : undefined}
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
                  commit(chip, label);
                }}
              >
                {label}
              </button>
            );
          })}
          {!isTopic && !isMainTopic ? (
            <button
              type="button"
              className="guided-chat-field__chip guided-chat-field__chip--custom"
              disabled={submitting}
              onClick={() => {
                setCustomOpen(true);
                setError(null);
                if (field.name === 'date_mode') {
                  setExtra((p) => ({ ...p, _pending: 'custom' }));
                }
              }}
            >
              自定义…
            </button>
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

      {!isScale &&
      (customOpen || (chips.length === 0 && !isUpload) || isTopic) &&
      !isUpload &&
      !(otherField && otherSelected) ? (
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

      {error ? <p className="guided-chat-field__error">{error}</p> : null}

      <div className="guided-chat-field__footer">
        {!field.required && onSkip ? (
          <button
            type="button"
            className="guided-chat-field__skip"
            disabled={submitting}
            onClick={() => onSkip()}
          >
            <SkipForward size={14} />
            跳过
          </button>
        ) : null}
      </div>
    </div>
  );
}
