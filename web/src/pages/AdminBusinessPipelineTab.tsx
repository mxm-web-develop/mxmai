import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Collapse, Dropdown, Input, InputNumber, Popover, Radio, Select, Switch, Tooltip, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type {
  JsonSchema,
  PipelineAdminPhase,
  PipelineStepDraft,
  PromptConfigRow,
  TaskTemplateDraft,
} from './AdminBusiness.types';
import {
  PIPELINE_PLATFORM_STEPS,
  buildPlatformPipelineStep,
  buildSensitiveCheckStep,
  buildManualReviewStep,
  buildInteractiveCardStep,
  buildVideoTimelineClipRenderStep,
  buildVideoTimelineConcatStep,
  buildMarkdownToPdfStep,
  buildTranscribeVoiceoverAudioStep,
  buildResolveVoiceoverAudioStep,
  buildVideoEditTimelineStep,
  buildVideoTimelineManualReviewStep,
  collectSensitivePathOptions,
  collectFormParamFieldOptions,
  collectContractClaimPathOptions,
  collectContractCommitPathOptions,
  SYSTEM_EVIDENCE_KEY_OPTIONS,
  defaultNestedTextMapping,
  deriveAutoPipelineDisplayItems,
  formatPipelineStepLabel,
  formatPipelineStepSummary,
  NESTED_TEXT_OUTPUT_TARGET_OPTIONS,
  PIPELINE_WHEN_OP_OPTIONS,
  readPipelineWhenClauses,
  readPipelineWhenMode,
  writePipelineWhenClauses,
  type PipelineWhenClause,
  type PipelineWhenMode,
  formatPipelineStepTooltip,
  isGraphPreFormatStep,
  isRedundantManualStep,
  manualStepCoversContextField,
  pipelineStepIdentity,
  readGraphPreFormatTaskKey,
  sanitizeBusinessDisplayLabel,
  setGraphPreFormatTaskKey,
  buildExtractHotTopicsStep,
  buildPickMainTopicStep,
  buildPruneToSelectionStep,
  type PipelineDisplayItem,
  type TextBusinessOption,
} from './admin-business-pipeline.utils';
import './admin-business-pipeline.css';

const WARP_STAGE_META: Record<
  'pre' | 'input' | 'enrich' | 'output' | 'post',
  { title: string; key: string; hint: string }
> = {
  pre: { title: '前置', key: 'pre', hint: '大话题/趋势检索等，结果进 sources' },
  input: { title: 'Input', key: 'input', hint: '平台按合同 basic 简单回填' },
  enrich: { title: 'Enrich', key: 'enrich', hint: '深检索与专家回填 business' },
  output: { title: 'Output', key: 'output', hint: '角色 Prompt + 完整合同' },
  post: { title: '后置', key: 'post', hint: '产出后处理' },
};

type PipelineAddStepOption = {
  key: string;
  title: string;
  description?: string;
  disabled?: boolean;
  group?: string;
  onClick: () => void;
};

/** 子串 + 顺序模糊匹配（如 "asr 口播" 可命中 transcribeVoiceoverAudio） */
function pipelineStepFuzzyMatch(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = target.toLowerCase();
  if (hay.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

function filterPipelineAddStepOptions(
  options: PipelineAddStepOption[],
  query: string
): PipelineAddStepOption[] {
  if (!query.trim()) return options;
  return options.filter((opt) =>
    pipelineStepFuzzyMatch(
      query,
      [opt.group, opt.title, opt.description, opt.key].filter(Boolean).join(' ')
    )
  );
}

function PipelineAddStepDropdown({
  options,
  children,
}: {
  options: PipelineAddStepOption[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => filterPipelineAddStepOptions(options, query),
    [options, query]
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const popup = (
    <div
      className="admin-pipeline-add-step"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="admin-pipeline-add-step__search">
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
          placeholder="搜索步骤名称、关键字…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="admin-pipeline-add-step__list" role="listbox" aria-label="可添加的管线步骤">
        {filtered.length === 0 ? (
          <div className="admin-pipeline-add-step__empty">无匹配步骤，换个关键词试试</div>
        ) : (
          filtered.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="option"
              className="admin-pipeline-add-step__item"
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                opt.onClick();
                setOpen(false);
                setQuery('');
              }}
            >
              {opt.group ? (
                <span className="admin-pipeline-add-step__group">{opt.group}</span>
              ) : null}
              <span className="admin-pipeline-add-step__title">{opt.title}</span>
              {opt.description ? (
                <span className="admin-pipeline-add-step__desc">{opt.description}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      trigger={['click']}
      placement="topLeft"
      getPopupContainer={() => document.body}
      menu={{ items: [] }}
      popupRender={() => popup}
    >
      {children}
    </Dropdown>
  );
}

type SensitiveList = { id: string; name: string; description?: string | null; is_active: boolean };

export type AdminBusinessPipelineTabProps = {
  draft: TaskTemplateDraft | null;
  selected: PromptConfigRow | null;
  textBusinessOptions: PromptConfigRow[];
  sensitiveLists: SensitiveList[];
  sensitiveHint: string | null;
  onDraftChange: (next: TaskTemplateDraft | null) => void;
  /** 跳到 Output Prompt Tab */
  onNavigateToPrompt?: () => void;
};

function ensurePipeline(draft: TaskTemplateDraft): TaskTemplateDraft {
  return {
    ...draft,
    pipeline: {
      pre: draft.pipeline?.pre ? [...draft.pipeline.pre] : [],
      enrich: draft.pipeline?.enrich ? [...draft.pipeline.enrich] : [],
      post: draft.pipeline?.post ? [...draft.pipeline.post] : [],
    },
  };
}

function toTextBusinessSelectOptions(rows: PromptConfigRow[]): TextBusinessOption[] {
  return rows.map((opt) => {
    const fullKey = opt.subtype ? `${opt.scope}/${opt.type}/${opt.subtype}` : `${opt.scope}/${opt.type}`;
    const display = (opt.extra as { display?: { taskLabel?: string; subtypeLabel?: string } } | undefined)
      ?.display;
    const rawSubtype = display?.subtypeLabel?.trim();
    const rawTask = display?.taskLabel?.trim();
    const fallback = opt.subtype ? `${opt.scope}/${opt.type} (${opt.subtype})` : `${opt.scope}/${opt.type}`;
    const label = rawSubtype || rawTask || fallback;
    const shortFromDisplay = sanitizeBusinessDisplayLabel(rawSubtype || rawTask || '');
    const seg = opt.subtype ?? fullKey.split('/').pop() ?? fullKey;
    const shortLabel =
      shortFromDisplay ||
      (seg.includes('-') ? seg.replace(/-/g, ' ') : seg);
    return { value: fullKey, label, shortLabel };
  });
}

function stripLegacyFromPipeline(d: TaskTemplateDraft): TaskTemplateDraft {
  const strip = (steps: PipelineStepDraft[]) =>
    steps.filter((s) => s.step !== 'knowledgeRetrieve' && s.step !== 'formatDocument');
  return {
    ...d,
    pipeline: {
      pre: strip(d.pipeline?.pre ?? []),
      enrich: strip(d.pipeline?.enrich ?? []),
      post: strip(d.pipeline?.post ?? []),
    },
  };
}

function stepTypeBadge(step: PipelineStepDraft): string | null {
  switch (step.step) {
    case 'sensitiveCheck':
      return '敏感词';
    case 'manualReview':
      return '审核';
    case 'interactiveCard':
      return '交互卡';
    case 'nestedText':
      return '文本';
    case 'webSearch':
      return '检索';
    case 'pickMainTopic':
      return '主话题';
    case 'pruneToSelection':
      return '剪枝';
    case 'resolveContextFields':
      return '上下文';
    case 'markdownToPdf':
    case 'renderDocumentPdf':
      return 'PDF';
    case 'renderPptx':
      return 'PPTX';
    case 'expandDeckSlides':
      return '幻灯片骨架';
    case 'transcribeVoiceoverAudio':
      return 'ASR';
    case 'resolveVoiceoverAudio':
      return '口播';
    case 'buildVideoEditTimeline':
    case 'buildSciencePopTimeline':
      return '分镜';
    case 'videoTimelineRender':
    case 'nestedVideo':
      return '渲染';
    case 'polishManuscript':
      return '润色';
    default:
      return null;
  }
}

function SensitiveStepSettings({
  step,
  formSchema,
  lists,
  hint,
  onChange,
}: {
  step: PipelineStepDraft;
  formSchema: JsonSchema | undefined;
  lists: SensitiveList[];
  hint: string | null;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const paths = (step.params?.paths as string[] | undefined) ?? ['prompt'];
  const listIds = (step.params?.listIds as string[] | undefined) ?? [];
  const pathOptions = collectSensitivePathOptions(formSchema).map((o) => ({
    ...o,
    label: o.label.replace(/（params\.\w+）/, '').replace(/params\.\w+/, '').trim(),
  }));

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">检查内容</div>
        <Select
          mode="multiple"
          allowClear
          size="small"
          className="admin-pipeline-settings__control"
          placeholder="选择要检查的字段"
          value={paths}
          options={pathOptions}
          onChange={(v) =>
            onChange({
              params: {
                ...(step.params ?? {}),
                paths: v.length > 0 ? v : ['prompt'],
              },
            })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">敏感词库</div>
        {hint ? (
          <Typography.Text type="warning" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            {hint}
          </Typography.Text>
        ) : null}
        <Select
          mode="multiple"
          allowClear
          size="small"
          className="admin-pipeline-settings__control"
          placeholder={lists.length ? '留空则使用业务默认词库' : '请先在「敏感词库」页创建词库'}
          value={listIds}
          options={lists.map((l) => ({
            value: l.id,
            label: l.description ? `${l.name}（${l.description}）` : l.name,
          }))}
          onChange={(v) =>
            onChange({
              params: {
                ...(step.params ?? {}),
                listIds: v.length > 0 ? v : undefined,
              },
            })
          }
        />
      </div>
    </div>
  );
}

function ManualReviewStepSettings({
  step,
  onChange,
}: {
  step: PipelineStepDraft;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const label = (step.params?.label as string | undefined) ?? '';
  const kind = (step.params?.kind as string | undefined) ?? 'text';
  const draftFrom = (step.params?.draftFrom as string | undefined) ?? '';

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">审核标题</div>
        <Input
          size="small"
          placeholder="如：口播稿审核"
          value={label}
          onChange={(e) =>
            onChange({ params: { ...(step.params ?? {}), label: e.target.value } })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">审核内容类型</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={kind}
          options={[
            { value: 'text', label: '文本' },
            { value: 'json', label: 'JSON' },
            { value: 'image', label: '图片' },
            { value: 'composite', label: '组合预览（只读）' },
          ]}
          onChange={(v) => onChange({ params: { ...(step.params ?? {}), kind: v } })}
        />
      </div>
      <Collapse
        ghost
        size="small"
        className="admin-pipeline-settings__advanced"
        items={[
          {
            key: 'advanced',
            label: '高级选项',
            children: (
              <div className="admin-pipeline-settings__field">
                <div className="admin-pipeline-settings__label">草稿来源</div>
                <Input
                  size="small"
                  value={draftFrom}
                  placeholder="默认按阶段自动选择"
                  onChange={(e) =>
                    onChange({ params: { ...(step.params ?? {}), draftFrom: e.target.value } })
                  }
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

type InteractiveCardFieldDraft = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  default?: string;
  'x-ui'?: string;
};

function InteractiveCardStepSettings({
  step,
  onChange,
}: {
  step: PipelineStepDraft;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const label = (params.label as string | undefined) ?? '';
  const kind = (params.kind as string | undefined) ?? 'interactive-card';
  const hint = (params.hint as string | undefined) ?? '';
  const fields: InteractiveCardFieldDraft[] = useMemo(() => {
    const raw = Array.isArray(params.fields) ? params.fields : [];
    return raw
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && !Array.isArray(f))
      .map((f) => ({
        name: String(f.name ?? '').trim(),
        type: typeof f.type === 'string' ? f.type : 'string',
        title: typeof f.title === 'string' ? f.title : undefined,
        description: typeof f.description === 'string' ? f.description : undefined,
        required: f.required === true,
        enum: Array.isArray(f.enum) ? f.enum.map(String) : undefined,
        default: f.default != null ? String(f.default) : undefined,
        'x-ui': typeof f['x-ui'] === 'string' ? f['x-ui'] : undefined,
      }))
      .filter((f) => f.name);
  }, [params.fields]);

  const [fieldsJsonText, setFieldsJsonText] = useState(() => JSON.stringify(fields, null, 2));
  useEffect(() => {
    setFieldsJsonText(JSON.stringify(fields, null, 2));
  }, [fields]);

  const patchParams = (next: Record<string, unknown>) =>
    onChange({ params: { ...params, ...next } });

  const setFields = (next: InteractiveCardFieldDraft[]) => {
    patchParams({ fields: next });
  };

  const updateFieldAt = (index: number, patch: Partial<InteractiveCardFieldDraft>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFieldAt = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  };

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">标题</div>
        <Input
          size="small"
          value={label}
          onChange={(e) => patchParams({ label: e.target.value })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">类型</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={kind}
          options={[
            { value: 'interactive-card', label: '交互卡' },
            { value: 'basic-form', label: '分步 basic' },
          ]}
          onChange={(v) => patchParams({ kind: v })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">提示 hint</div>
        <Input
          size="small"
          value={hint}
          onChange={(e) => patchParams({ hint: e.target.value })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">可跳过</div>
        <Switch
          size="small"
          checked={params.skippable === true}
          onChange={(v) => patchParams({ skippable: v })}
        />
      </div>

      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">字段（结构化）</div>
        <div className="admin-pipeline-card-fields">
          {fields.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              暂无字段，请添加
            </Typography.Text>
          ) : null}
          {fields.map((f, index) => (
            <div key={`${f.name}-${index}`} className="admin-pipeline-card-fields__row">
              <div className="admin-pipeline-card-fields__grid">
                <Input
                  size="small"
                  placeholder="name"
                  value={f.name}
                  onChange={(e) => updateFieldAt(index, { name: e.target.value.trim() })}
                />
                <Input
                  size="small"
                  placeholder="title"
                  value={f.title ?? ''}
                  onChange={(e) => updateFieldAt(index, { title: e.target.value || undefined })}
                />
                <Select
                  size="small"
                  value={f.type || 'string'}
                  options={[
                    { value: 'string', label: 'string' },
                    { value: 'number', label: 'number' },
                    { value: 'boolean', label: 'boolean' },
                  ]}
                  onChange={(v) => updateFieldAt(index, { type: v })}
                />
                <label className="admin-pipeline-card-fields__req">
                  <Switch
                    size="small"
                    checked={f.required === true}
                    onChange={(v) => updateFieldAt(index, { required: v })}
                  />
                  <span>必填</span>
                </label>
              </div>
              <Select
                size="small"
                mode="tags"
                className="admin-pipeline-settings__control"
                placeholder="enum 选项（回车添加）"
                value={f.enum ?? []}
                onChange={(vals) =>
                  updateFieldAt(index, {
                    enum: Array.isArray(vals) && vals.length ? vals.map(String) : undefined,
                  })
                }
                tokenSeparators={[',']}
              />
              <div className="admin-pipeline-card-fields__actions">
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index >= fields.length - 1}
                  onClick={() => moveField(index, 1)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeFieldAt(index)}
                />
              </div>
            </div>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setFields([
                ...fields,
                { name: `field_${fields.length + 1}`, type: 'string', title: '新字段', required: false },
              ])
            }
          >
            添加字段
          </Button>
        </div>
      </div>

      <Collapse
        ghost
        size="small"
        className="admin-pipeline-settings__advanced"
        items={[
          {
            key: 'json',
            label: '高级：fields JSON',
            children: (
              <Input.TextArea
                rows={6}
                size="small"
                value={fieldsJsonText}
                onChange={(e) => setFieldsJsonText(e.target.value)}
                onBlur={() => {
                  try {
                    const parsed = JSON.parse(fieldsJsonText) as unknown;
                    if (Array.isArray(parsed)) {
                      patchParams({ fields: parsed });
                    }
                  } catch {
                    /* keep text */
                  }
                }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function WarpWebSearchStepSettings({
  step,
  phase,
  onChange,
}: {
  step: PipelineStepDraft;
  phase?: PipelineAdminPhase;
  textOptions?: TextBusinessOption[];
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const patch = (next: Record<string, unknown>) =>
    onChange({ params: { ...params, ...next } });
  const defaultTarget = phase === 'enrich' ? 'enrich_search.result' : 'sources.websource';
  const target = String(params.target ?? defaultTarget).trim();
  const builder = String(params.queryBuilder ?? '').trim();
  const isIndustryTrend = builder === 'industryTrend';

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">查询策略 queryBuilder</div>
        <Select
          size="small"
          allowClear
          className="admin-pipeline-settings__control"
          placeholder="通用（queryTemplate / queryFrom）"
          value={builder || undefined}
          options={[
            { value: 'industryTrend', label: 'industryTrend（行业趋势插件）' },
          ]}
          onChange={(v) => patch({ queryBuilder: v || undefined })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          业务专用拼查询请用命名插件或下方模板，勿改核心代码。
        </Typography.Text>
      </div>
      {isIndustryTrend ? (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
          已选 industryTrend：查询由插件根据行业/日期等表单字段生成（优先于模板）。
        </Typography.Text>
      ) : null}
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">查询模板 queryTemplate</div>
        <Input
          size="small"
          disabled={isIndustryTrend}
          placeholder="${params.industry} ${params.industry_custom} 行业热点"
          value={(params.queryTemplate as string | undefined) ?? ''}
          onChange={(e) =>
            patch({
              queryTemplate: e.target.value || undefined,
              query: undefined,
            })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">查询来源 queryFrom</div>
        <Input
          size="small"
          disabled={isIndustryTrend}
          placeholder="params.topic / contract.enrich_search.query"
          value={(params.queryFrom as string | undefined) ?? ''}
          onChange={(e) => patch({ queryFrom: e.target.value || undefined, query: undefined })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">列表查询 queriesFrom（副线）</div>
        <Input
          size="small"
          disabled={isIndustryTrend}
          placeholder="contract.selection.topics"
          value={(params.queriesFrom as string | undefined) ?? ''}
          onChange={(e) => patch({ queriesFrom: e.target.value || undefined })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          从数组/分号串拆多 query；可配 excludeQueryFrom 排除主线、querySuffix、maxQueries
        </Typography.Text>
      </div>
      {(params.queriesFrom as string | undefined) ? (
        <>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">排除主线 excludeQueryFrom</div>
            <Input
              size="small"
              placeholder="contract.basic.main_topic"
              value={(params.excludeQueryFrom as string | undefined) ?? ''}
              onChange={(e) => patch({ excludeQueryFrom: e.target.value || undefined })}
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">querySuffix</div>
            <Input
              size="small"
              placeholder="最新进展 数据 简讯"
              value={(params.querySuffix as string | undefined) ?? ''}
              onChange={(e) => patch({ querySuffix: e.target.value || undefined })}
            />
          </div>
        </>
      ) : null}
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">固定查询 query（可选，优先）</div>
        <Input
          size="small"
          placeholder="留空则用 queryBuilder / queryTemplate / queryFrom"
          value={(params.query as string | undefined) ?? ''}
          onChange={(e) => patch({ query: e.target.value || undefined })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">写入目标 target</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={(params.target as string | undefined) ?? defaultTarget}
          options={[
            { value: 'sources.websource', label: 'sources.websource（pre）' },
            { value: 'enrich_search.result', label: 'enrich_search.result（enrich）' },
          ]}
          onChange={(v) => patch({ target: v })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">检索深度</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={(params.depth as string | undefined) ?? 'standard'}
          options={[
            { value: 'quick', label: '快速' },
            { value: 'standard', label: '标准' },
            { value: 'deep', label: '深度' },
          ]}
          onChange={(v) => patch({ depth: v })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">最多结果数</div>
        <Input
          size="small"
          type="number"
          value={String(params.maxResults ?? 6)}
          onChange={(e) => patch({ maxResults: Number(e.target.value) || 6 })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">结果截断字数</div>
        <Input
          size="small"
          type="number"
          value={String(params.resultMaxChars ?? 2500)}
          onChange={(e) => patch({ resultMaxChars: Number(e.target.value) || 2500 })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">结果清洗 resultClean</div>
        <Select
          size="small"
          allowClear
          className="admin-pipeline-settings__control"
          placeholder={isIndustryTrend ? 'industryTrend 默认开启' : '默认关闭'}
          value={
            params.resultClean === true
              ? 'on'
              : params.resultClean === false
                ? 'off'
                : undefined
          }
          options={[
            { value: 'on', label: '开启（剔低质域名/样板文/去重）' },
            { value: 'off', label: '关闭' },
          ]}
          onChange={(v) =>
            patch({
              resultClean: v === 'on' ? true : v === 'off' ? false : undefined,
            })
          }
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          剔除 reddit/x 等低质源、剥离导航样板、按 URL 去重。industryTrend 未设时默认开启。
        </Typography.Text>
      </div>
      {!isIndustryTrend ? (
        <>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">维度 dimensions</div>
            <Select
              mode="multiple"
              allowClear
              size="small"
              className="admin-pipeline-settings__control"
              placeholder="默认 news + general"
              value={
                Array.isArray(params.dimensions)
                  ? (params.dimensions as string[])
                  : typeof params.dimensions === 'string' && params.dimensions
                    ? String(params.dimensions)
                        .split(/[,，\s]+/)
                        .filter(Boolean)
                    : undefined
              }
              options={[
                { value: 'news', label: 'news' },
                { value: 'general', label: 'general' },
                { value: 'finance', label: 'finance' },
                { value: 'academic', label: 'academic' },
                { value: 'forum', label: 'forum' },
                { value: 'social', label: 'social' },
                { value: 'video', label: 'video' },
                { value: 'official', label: 'official' },
              ]}
              onChange={(v) => patch({ dimensions: v.length ? v : undefined })}
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">时间窗 timeRange</div>
            <Select
              size="small"
              allowClear
              className="admin-pipeline-settings__control"
              placeholder="不限"
              value={(params.timeRange as string | undefined) || undefined}
              options={[
                { value: 'day', label: 'day' },
                { value: 'week', label: 'week' },
                { value: 'month', label: 'month' },
                { value: 'year', label: 'year' },
              ]}
              onChange={(v) => patch({ timeRange: v || undefined })}
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">startDate / endDate</div>
            <Input
              size="small"
              placeholder="YYYY-MM-DD"
              value={(params.startDate as string | undefined) ?? ''}
              onChange={(e) => patch({ startDate: e.target.value || undefined })}
              style={{ marginBottom: 4 }}
            />
            <Input
              size="small"
              placeholder="YYYY-MM-DD"
              value={(params.endDate as string | undefined) ?? ''}
              onChange={(e) => patch({ endDate: e.target.value || undefined })}
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">域名白名单 includeDomains</div>
            <Input
              size="small"
              placeholder="逗号分隔，如 reuters.com,bloomberg.com"
              value={
                Array.isArray(params.includeDomains)
                  ? (params.includeDomains as string[]).join(',')
                  : ((params.includeDomains as string | undefined) ?? '')
              }
              onChange={(e) => patch({ includeDomains: e.target.value || undefined })}
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">language</div>
            <Select
              size="small"
              allowClear
              className="admin-pipeline-settings__control"
              placeholder="引擎默认"
              value={(params.language as string | undefined) || undefined}
              options={[
                { value: 'all', label: 'all' },
                { value: 'zh', label: 'zh' },
                { value: 'en', label: 'en' },
              ]}
              onChange={(v) => patch({ language: v || undefined })}
            />
          </div>
        </>
      ) : null}
      {target === 'sources.websource' || target === '' ? (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          大批量检索请另加「热点提取」步骤，把结果收成少量话题 chips；勿把上百条检索直接给用户选。
        </Typography.Text>
      ) : null}
    </div>
  );
}

function PickMainTopicStepSettings({
  step,
  onChange,
}: {
  step: PipelineStepDraft;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const patch = (next: Record<string, unknown>) =>
    onChange({ params: { ...params, ...next } });
  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">源字段 sourceField</div>
        <Input
          size="small"
          placeholder="core_topic"
          value={(params.sourceField as string | undefined) ?? 'core_topic'}
          onChange={(e) => patch({ sourceField: e.target.value || undefined })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">目标字段 targetField</div>
        <Input
          size="small"
          placeholder="main_topic"
          value={(params.targetField as string | undefined) ?? 'main_topic'}
          onChange={(e) => patch({ targetField: e.target.value || undefined })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">chipsPath</div>
        <Input
          size="small"
          placeholder="sources.websource.topicChips"
          value={(params.chipsPath as string | undefined) ?? 'sources.websource.topicChips'}
          onChange={(e) => patch({ chipsPath: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

function ExtractHotTopicsStepSettings({
  step,
  textOptions,
  onChange,
}: {
  step: PipelineStepDraft;
  textOptions: TextBusinessOption[];
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const textKey =
    String(params.textKey ?? step.nestedTextTaskKey ?? 'text/expert/industry-hot-topics').trim() ||
    'text/expert/industry-hot-topics';
  const patch = (next: Record<string, unknown>) => {
    onChange({ params: { ...params, ...next } });
  };
  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">热点提取 text 业务</div>
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          className="admin-pipeline-settings__control"
          value={textKey}
          options={textOptions.map((o) => ({
            value: o.value,
            label: o.label || o.shortLabel || o.value,
          }))}
          onChange={(v) => patch({ textKey: String(v || '').trim() || 'text/expert/industry-hot-topics' })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">发现池提炼条数</div>
        <Input
          size="small"
          type="number"
          value={String(params.maxTopics ?? 40)}
          onChange={(e) => patch({ maxTopics: Number(e.target.value) || 40 })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          整池提炼后供用户「换一批」翻页选用；不再由用户填热点条数。默认 textKey 仅作缺省，业务应显式配置。
        </Typography.Text>
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">送模候选上限</div>
        <Input
          size="small"
          type="number"
          value={String(params.maxInputItems ?? 80)}
          onChange={(e) => patch({ maxInputItems: Number(e.target.value) || 80 })}
        />
      </div>
    </div>
  );
}

function MarkdownToPdfStepSettings({
  step,
  onChange,
}: {
  step: PipelineStepDraft;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const storageMode = String(params.storageMode ?? 'sidecar') === 'overwrite' ? 'overwrite' : 'sidecar';
  const includeCover = params.includeCover !== false;
  const includeToc = params.includeToc !== false;
  const useLayoutLlm = params.useLayoutLlm === true;
  const patch = (next: Record<string, unknown>) => onChange({ params: { ...params, ...next } });

  return (
    <div className="admin-pipeline-settings">
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        主存默认 Markdown；PDF 供写作模块阅读。失败不阻断任务，接口返回 warnings。
      </Typography.Paragraph>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">存储模式</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={storageMode}
          options={[
            { value: 'sidecar', label: '独立存储（推荐，地址写入 meta.pdfStorage）' },
            { value: 'overwrite', label: '覆盖主 storageInfo（慎用）' },
          ]}
          onChange={(v) => patch({ storageMode: v })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">封面页</div>
        <Switch size="small" checked={includeCover} onChange={(v) => patch({ includeCover: v })} />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">目录页</div>
        <Switch size="small" checked={includeToc} onChange={(v) => patch({ includeToc: v })} />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">LLM 版式编排</div>
        <Switch
          size="small"
          checked={useLayoutLlm}
          onChange={(v) => patch({ useLayoutLlm: v })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          关闭时直接 Markdown 渲染（含封面/目录）；开启需配置 layoutTaskKey
        </Typography.Text>
      </div>
      {useLayoutLlm ? (
        <div className="admin-pipeline-settings__field">
          <div className="admin-pipeline-settings__label">layoutTaskKey</div>
          <Input
            size="small"
            className="admin-pipeline-settings__control"
            value={String(params.layoutTaskKey ?? step.layoutTaskKey ?? '')}
            placeholder="text/layout/document-render-spec"
            onChange={(e) =>
              onChange({
                layoutTaskKey: e.target.value.trim() || undefined,
                params: {
                  ...params,
                  layoutTaskKey: e.target.value.trim() || undefined,
                  useLayoutLlm: true,
                },
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function PolishManuscriptStepSettings({
  step,
  textOptions,
  onChange,
}: {
  step: PipelineStepDraft;
  textOptions: TextBusinessOption[];
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const params = step.params ?? {};
  const polishKey =
    String(params.nestedTextTaskKey ?? 'text/transform/prose-deai').trim() || 'text/transform/prose-deai';
  const languageFrom = String(params.languageFrom ?? '').trim();
  const deterministicPolish = params.deterministicPolish !== false;
  const customInstruction =
    typeof params.instruction === 'string' && params.instruction.trim()
      ? String(params.instruction)
      : '';
  const patch = (next: Record<string, unknown>) =>
    onChange({ params: { ...params, ...next } });

  const transformOptions = textOptions.filter((o) => o.value.startsWith('text/transform/'));
  const fallbackOptions = [
    { value: 'text/transform/prose-deai', label: 'prose-deai（四语去 AI 感）' },
  ];

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">润色 text 子业务</div>
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          className="admin-pipeline-settings__control"
          value={polishKey}
          options={(transformOptions.length ? transformOptions : fallbackOptions).map((o) => ({
            value: o.value,
            label: o.label || o.shortLabel || o.value,
          }))}
          onChange={(v) => patch({ nestedTextTaskKey: String(v || '').trim() || 'text/transform/prose-deai' })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          默认调 text/transform/prose-deai（四语去 AI 感改写）。如挂其它 transform 子业务，请确认其入参是 input/instruction。
        </Typography.Text>
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">语言来源 languageFrom</div>
        <Input
          size="small"
          placeholder="留空：coreArtifact.metadata.language → params.language → contract.basic.language → zh"
          value={languageFrom}
          onChange={(e) => patch({ languageFrom: e.target.value || undefined })}
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">确定性抛光</div>
        <Switch
          size="small"
          checked={deterministicPolish}
          onChange={(v) => patch({ deterministicPolish: v })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          关闭后只跑 LLM 改写；建议保留开启（去 AI workshop 套话 + 标点归一）
        </Typography.Text>
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">高级 · 自定义 instruction（可选）</div>
        <Input.TextArea
          size="small"
          rows={4}
          value={customInstruction}
          placeholder="留空：按语言生成 de-AI 指令"
          onChange={(e) => patch({ instruction: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

function BuildVideoEditTimelineStepSettings({
  step,
  onChange,
}: {
  step: PipelineStepDraft;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const strategy = (step.params?.segmentStrategy as string | undefined) ?? 'voiceover-subtitles';
  const fieldMapping = step.fieldMapping ?? {};

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">分段策略 segmentStrategy</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={strategy}
          options={[
            { value: 'voiceover-subtitles', label: '口播句级字幕' },
            { value: 'fixed-chunk', label: '固定时长切分' },
            { value: 'shot-list', label: '镜头列表 JSON' },
            { value: 'image-sequence', label: '图片序列 JSON' },
            { value: 'document-sections', label: '文档章节 JSON' },
          ]}
          onChange={(v) =>
            onChange({ params: { ...(step.params ?? {}), segmentStrategy: v } })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">时长字段 duration</div>
        <Input
          size="small"
          placeholder="${params.audio_duration_seconds}"
          value={fieldMapping.duration ?? ''}
          onChange={(e) =>
            onChange({
              fieldMapping: { ...fieldMapping, duration: e.target.value },
            })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">分段数据 segments</div>
        <Input
          size="small"
          placeholder="${params.voiceover_subtitles_json}"
          value={fieldMapping.segments ?? ''}
          onChange={(e) =>
            onChange({
              fieldMapping: { ...fieldMapping, segments: e.target.value },
            })
          }
        />
      </div>
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">promptTemplate（可选）</div>
        <Input.TextArea
          rows={2}
          size="small"
          value={(step.params?.promptTemplate as string | undefined) ?? ''}
          onChange={(e) =>
            onChange({ params: { ...(step.params ?? {}), promptTemplate: e.target.value } })
          }
        />
      </div>
    </div>
  );
}

function PipelineStepWhenSettings({
  step,
  formSchema,
  onChange,
}: {
  step: PipelineStepDraft;
  formSchema: JsonSchema | undefined;
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const clauses = readPipelineWhenClauses(step);
  const mode = readPipelineWhenMode(step);
  const fieldOptions = useMemo(() => collectFormParamFieldOptions(formSchema), [formSchema]);

  const patchClauses = (next: PipelineWhenClause[], nextMode: PipelineWhenMode = mode) => {
    onChange(writePipelineWhenClauses(step, next, nextMode));
  };

  return (
    <div className="admin-pipeline-settings">
      <Typography.Paragraph type="secondary" style={{ fontSize: 11, margin: '0 0 8px' }}>
        未配置条件时始终执行。配置后按下方模式判断是否运行本步骤。
      </Typography.Paragraph>
      <div className="admin-pipeline-settings__label">条件关系</div>
      <Radio.Group
        size="small"
        value={mode}
        style={{ marginBottom: 8 }}
        onChange={(e) => patchClauses(clauses, e.target.value as PipelineWhenMode)}
        options={[
          { value: 'all', label: '全部满足（AND）' },
          { value: 'any', label: '任一满足（OR）' },
        ]}
      />
      {clauses.map((clause, index) => (
        <div key={`when-${index}`} className="admin-pipeline-settings__when-row">
          <Select
            size="small"
            className="admin-pipeline-settings__control"
            showSearch
            optionFilterProp="label"
            placeholder="表单字段"
            value={clause.field || undefined}
            options={fieldOptions}
            onChange={(v) => {
              const next = [...clauses];
              next[index] = { ...next[index], field: v };
              patchClauses(next);
            }}
          />
          <Select
            size="small"
            className="admin-pipeline-settings__control"
            value={clause.op}
            options={PIPELINE_WHEN_OP_OPTIONS}
            onChange={(v) => {
              const next = [...clauses];
              next[index] = { ...next[index], op: v };
              patchClauses(next);
            }}
          />
          {(clause.op === 'eq' || clause.op === 'neq') && (
            <Input
              size="small"
              placeholder="比较值"
              value={clause.value == null ? '' : String(clause.value)}
              onChange={(e) => {
                const next = [...clauses];
                next[index] = { ...next[index], value: e.target.value };
                patchClauses(next);
              }}
            />
          )}
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除条件"
            onClick={() => patchClauses(clauses.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        type="dashed"
        size="small"
        block
        icon={<PlusOutlined />}
        onClick={() =>
          patchClauses([
            ...clauses,
            { field: fieldOptions[0]?.value ?? 'params.', op: 'falsy' },
          ])
        }
      >
        添加执行条件
      </Button>
    </div>
  );
}

import {
  defaultNestedTextInputMapping,
  parseTextV2TypeFromNestedKey,
  TEXT_V2_INPUT_KEYS,
} from './admin-text-v2';

function NestedTextStepSettings({
  step,
  formSchema,
  phase,
  textOptions,
  onChange,
}: {
  step: PipelineStepDraft;
  formSchema: JsonSchema | undefined;
  phase: PipelineAdminPhase;
  textOptions: TextBusinessOption[];
  onChange: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const outputTarget = (step.params?.outputTarget as string | undefined) ?? '';
  const afterPromptRender = step.params?.afterPromptRender === true;
  const taskKey = step.nestedTextTaskKey ?? textOptions[0]?.value;
  const textType = taskKey ? parseTextV2TypeFromNestedKey(taskKey) : null;
  const fixedKeys = textType ? TEXT_V2_INPUT_KEYS[textType] : null;

  const patchParams = (patch: Record<string, unknown>) => {
    const nextParams = { ...(step.params ?? {}), ...patch };
    if (!nextParams.outputTarget) delete nextParams.outputTarget;
    onChange({ params: nextParams });
  };

  const mapping = step.inputMapping ?? {};
  const claimPaths = Array.isArray(step.params?.claimPaths)
    ? (step.params!.claimPaths as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const commitPaths = Array.isArray(step.params?.commitPaths)
    ? (step.params!.commitPaths as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const evidenceKeys = Array.isArray(step.params?.evidenceKeys)
    ? (step.params!.evidenceKeys as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const evidenceMaxChars =
    typeof step.params?.evidenceMaxChars === 'number' ? step.params.evidenceMaxChars : undefined;
  const claimOptions = collectContractClaimPathOptions(formSchema);
  const commitOptions = collectContractCommitPathOptions(formSchema, step.params?.field_specs);
  const showClaimUi = textType === 'expert' || textType === 'plan' || textType === 'validation';

  return (
    <div className="admin-pipeline-settings">
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">文本子业务</div>
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          className="admin-pipeline-settings__control"
          placeholder={textOptions.length ? '选择 text 业务' : '暂无可用 text 业务'}
          disabled={textOptions.length === 0}
          value={taskKey || undefined}
          options={textOptions.map((o) => ({
            value: o.value,
            label: o.label || o.shortLabel || o.value,
          }))}
          onChange={(v) => {
            const t = parseTextV2TypeFromNestedKey(v);
            onChange({
              nestedTextTaskKey: v,
              inputMapping: t ? defaultNestedTextInputMapping(t) : step.inputMapping,
            });
          }}
        />
        {textType ? (
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            {textType} 固定入参：{TEXT_V2_INPUT_KEYS[textType].join(' · ')}
            {textType === 'expert' ? '（field_specs 可留空，运行时自动生成）' : ''}
          </Typography.Text>
        ) : null}
      </div>
      {phase === 'pre' ? (
        <div className="admin-pipeline-settings__field">
          <div className="admin-pipeline-settings__label">模板渲染后执行</div>
          <Switch
            size="small"
            checked={afterPromptRender}
            onChange={(checked) => patchParams({ afterPromptRender: checked })}
          />
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            音乐/口播：先渲染 unifiedTemplate 得到曲风描述，再跑 text 子业务
          </Typography.Text>
        </div>
      ) : null}
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">子业务输出目标</div>
        <Select
          size="small"
          className="admin-pipeline-settings__control"
          value={outputTarget}
          options={NESTED_TEXT_OUTPUT_TARGET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => patchParams({ outputTarget: v || undefined })}
        />
      </div>
      {showClaimUi ? (
        <>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">领取字段 claimPaths</div>
            <Select
              mode="multiple"
              size="small"
              showSearch
              optionFilterProp="label"
              allowClear
              className="admin-pipeline-settings__control"
              placeholder="从合同 schema / 系统键联想选择"
              value={claimPaths}
              options={claimOptions}
              onChange={(v) =>
                patchParams({ claimPaths: Array.isArray(v) && v.length ? v : undefined })
              }
            />
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              本步只把选中路径拼成迷你合同给 LLM；配置后忽略整包合同占位
            </Typography.Text>
          </div>
          {textType === 'expert' ? (
            <div className="admin-pipeline-settings__field">
              <div className="admin-pipeline-settings__label">写回字段 commitPaths</div>
              <Select
                mode="multiple"
                size="small"
                showSearch
                optionFilterProp="label"
                allowClear
                className="admin-pipeline-settings__control"
                placeholder="默认=上方 field_specs 名；可显式收窄"
                value={commitPaths}
                options={commitOptions}
                onChange={(v) =>
                  patchParams({ commitPaths: Array.isArray(v) && v.length ? v : undefined })
                }
              />
            </div>
          ) : null}
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">证据仓 evidenceKeys</div>
            <Select
              mode="multiple"
              size="small"
              showSearch
              optionFilterProp="label"
              allowClear
              className="admin-pipeline-settings__control"
              placeholder="有 claim 时未选则不挂证据"
              value={evidenceKeys}
              options={SYSTEM_EVIDENCE_KEY_OPTIONS}
              onChange={(v) =>
                patchParams({ evidenceKeys: Array.isArray(v) && v.length ? v : undefined })
              }
            />
          </div>
          <div className="admin-pipeline-settings__field">
            <div className="admin-pipeline-settings__label">证据预算（字符）</div>
            <InputNumber
              size="small"
              min={500}
              max={24000}
              step={500}
              className="admin-pipeline-settings__control"
              placeholder="默认平台限额"
              value={evidenceMaxChars}
              onChange={(v) =>
                patchParams({
                  evidenceMaxChars: typeof v === 'number' && v > 0 ? v : undefined,
                })
              }
            />
          </div>
        </>
      ) : null}
      <div className="admin-pipeline-settings__field">
        <div className="admin-pipeline-settings__label">inputMapping（仅固定键）</div>
        {(fixedKeys ? [...fixedKeys] : Object.keys(mapping)).map((key) => (
          <div key={key} style={{ marginBottom: 6, minWidth: 0 }}>
            <Typography.Text code style={{ fontSize: 11 }}>
              {key}
            </Typography.Text>
            <Input.TextArea
              rows={2}
              size="small"
              value={mapping[key] ?? ''}
              placeholder={
                key === 'field_specs'
                  ? '可留空 → 运行时按 business 空字段自动生成'
                  : claimPaths.length
                    ? '已配置 claimPaths 时 contract 占位可忽略'
                    : `\${state.contract} 等`
              }
              style={{ width: '100%' }}
              onChange={(e) =>
                onChange({
                  inputMapping: { ...mapping, [key]: e.target.value },
                })
              }
            />
          </div>
        ))}
        {!fixedKeys && Object.keys(mapping).length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            请选择合法 text v2 业务（text/plan|transform|expert|validation/…）
          </Typography.Text>
        ) : null}
      </div>
      <Collapse
        ghost
        size="small"
        className="admin-pipeline-settings__advanced"
        items={[
          {
            key: 'when',
            label: '执行条件',
            children: (
              <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onChange} />
            ),
          },
        ]}
      />
    </div>
  );
}

function StepSettingsPopover({
  item,
  formSchema,
  phase,
  textOptions,
  sensitiveLists,
  sensitiveHint,
  onUpdateStep,
}: {
  item: PipelineDisplayItem;
  formSchema: JsonSchema | undefined;
  phase: PipelineAdminPhase;
  textOptions: TextBusinessOption[];
  sensitiveLists: SensitiveList[];
  sensitiveHint: string | null;
  onUpdateStep: (patch: Partial<PipelineStepDraft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const step = item.step;

  let title = '步骤设置';
  let content: ReactNode = null;

  if (step.step === 'sensitiveCheck') {
    title = '敏感词检查';
    content = (
      <>
        <SensitiveStepSettings
          step={step}
          formSchema={formSchema}
          lists={sensitiveLists}
          hint={sensitiveHint}
          onChange={onUpdateStep}
        />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'webSearch') {
    title = '联网检索';
    content = (
      <>
        <WarpWebSearchStepSettings step={step} phase={phase} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          defaultActiveKey={readPipelineWhenClauses(step).length > 0 ? ['when'] : undefined}
          items={[
            {
              key: 'when',
              label: readPipelineWhenClauses(step).length
                ? `执行条件（已配 ${readPipelineWhenClauses(step).length} 条）`
                : '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'pickMainTopic') {
    title = '选主话题';
    content = (
      <>
        <PickMainTopicStepSettings step={step} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'pruneToSelection') {
    title = '选题后剪枝';
    content = (
      <>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
          按已选话题裁剪 websource；未选题材料（含 topicPool）直接抛弃。默认不归档发现池；仅调试可开
          archiveDiscovery → websource_discovery。
        </Typography.Paragraph>
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'extractHotTopics') {
    title = '热点提取';
    content = (
      <>
        <ExtractHotTopicsStepSettings
          step={step}
          textOptions={textOptions}
          onChange={onUpdateStep}
        />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'manualReview') {
    title = '人工审核';
    content = (
      <>
        <ManualReviewStepSettings step={step} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'interactiveCard') {
    title = '交互卡 / 分步 basic';
    content = (
      <>
        <InteractiveCardStepSettings step={step} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'nestedText' && !isGraphPreFormatStep(step)) {
    title = '文本子业务';
    content = (
      <NestedTextStepSettings
        step={step}
        formSchema={formSchema}
        phase={phase}
        textOptions={textOptions}
        onChange={onUpdateStep}
      />
    );
  } else if (step.step === 'buildVideoEditTimeline' || step.step === 'buildSciencePopTimeline') {
    title = '视频分镜构建';
    content = (
      <>
        <BuildVideoEditTimelineStepSettings step={step} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'markdownToPdf' || step.step === 'renderDocumentPdf') {
    title = 'Markdown → PDF';
    content = (
      <>
        <MarkdownToPdfStepSettings step={step} onChange={onUpdateStep} />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (step.step === 'polishManuscript') {
    title = '文本润色';
    content = (
      <>
        <PolishManuscriptStepSettings
          step={step}
          textOptions={textOptions}
          onChange={onUpdateStep}
        />
        <Collapse
          ghost
          size="small"
          className="admin-pipeline-settings__advanced"
          items={[
            {
              key: 'when',
              label: '执行条件',
              children: (
                <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />
              ),
            },
          ]}
        />
      </>
    );
  } else if (item.kind === 'manual') {
    title = '执行条件';
    content = <PipelineStepWhenSettings step={step} formSchema={formSchema} onChange={onUpdateStep} />;
  }

  if (!content) return null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      title={title}
      content={content}
      overlayClassName="admin-pipeline-settings-popover"
    >
      <Button
        type="text"
        size="small"
        className="admin-pipeline-step-card__action-btn"
        icon={<SettingOutlined />}
        aria-label="设置"
      />
    </Popover>
  );
}

function StepCard({
  item,
  formSchema,
  phase,
  textOptions,
  sensitiveLists,
  sensitiveHint,
  canMoveUp,
  canMoveDown,
  onRemove,
  onUpdateStep,
  onMoveUp,
  onMoveDown,
}: {
  item: PipelineDisplayItem;
  formSchema: TaskTemplateDraft['formSchema'];
  phase: PipelineAdminPhase;
  textOptions: TextBusinessOption[];
  sensitiveLists: SensitiveList[];
  sensitiveHint: string | null;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onRemove?: () => void;
  onUpdateStep?: (patch: Partial<PipelineStepDraft>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const field = item.kind === 'contextField' ? item.field : undefined;
  const label = formatPipelineStepLabel(item.step, field, textOptions);
  const summary = formatPipelineStepSummary(item.step, {
    formSchema,
    field,
    sensitiveLists,
  });
  const tooltip = formatPipelineStepTooltip(item.step, textOptions);
  const badge = stepTypeBadge(item.step);
  const hasSettings =
    item.kind === 'manual' &&
    onUpdateStep &&
    !(item.step.step === 'nestedText' && isGraphPreFormatStep(item.step));
  const showActions = hasSettings || (!item.auto && (onMoveUp || onMoveDown || onRemove));

  const titleNode = tooltip ? (
    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{tooltip}</span>} placement="topLeft">
      <div className="admin-pipeline-step-card__name">{label}</div>
    </Tooltip>
  ) : (
    <div className="admin-pipeline-step-card__name">{label}</div>
  );

  return (
    <div
      className={`admin-pipeline-step-card${item.auto ? ' admin-pipeline-step-card--auto' : ''} admin-pipeline-step-card--kind-${item.step.step}`}
    >
      <div className="admin-pipeline-step-card__rail" aria-hidden />
      <div className="admin-pipeline-step-card__main">
        <div className="admin-pipeline-step-card__lead">
          {item.auto ? (
            <span className="admin-pipeline-step-card__lead-icon" aria-hidden>
              <LockOutlined />
            </span>
          ) : badge ? (
            <span
              className={`admin-pipeline-step-card__badge admin-pipeline-step-card__badge--${item.step.step}`}
            >
              {badge}
            </span>
          ) : (
            <span className="admin-pipeline-step-card__badge">步骤</span>
          )}
        </div>
        <div className="admin-pipeline-step-card__body">
          {titleNode}
          {summary ? <div className="admin-pipeline-step-card__desc">{summary}</div> : null}
        </div>
        {showActions ? (
          <div className="admin-pipeline-step-card__actions">
            {hasSettings ? (
              <StepSettingsPopover
                item={item}
                formSchema={formSchema}
                phase={phase}
                textOptions={textOptions}
                sensitiveLists={sensitiveLists}
                sensitiveHint={sensitiveHint}
                onUpdateStep={onUpdateStep!}
              />
            ) : null}
            {!item.auto && onMoveUp ? (
              <Button
                type="text"
                size="small"
                className="admin-pipeline-step-card__action-btn"
                icon={<ArrowUpOutlined />}
                disabled={!canMoveUp}
                aria-label="上移"
                onClick={onMoveUp}
              />
            ) : null}
            {!item.auto && onMoveDown ? (
              <Button
                type="text"
                size="small"
                className="admin-pipeline-step-card__action-btn"
                icon={<ArrowDownOutlined />}
                disabled={!canMoveDown}
                aria-label="下移"
                onClick={onMoveDown}
              />
            ) : null}
            {!item.auto && onRemove ? (
              <Button
                type="text"
                size="small"
                className="admin-pipeline-step-card__action-btn admin-pipeline-step-card__action-btn--danger"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除步骤"
                onClick={onRemove}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GraphFormatConfig({
  taskKey,
  textOptions,
  onChange,
}: {
  taskKey?: string;
  textOptions: TextBusinessOption[];
  onChange: (key: string | undefined) => void;
}) {
  return (
    <div className="admin-pipeline-step-card admin-pipeline-step-card--config">
      <div className="admin-pipeline-step-card__rail" aria-hidden />
      <div className="admin-pipeline-step-card__main admin-pipeline-step-card__main--stack">
        <div className="admin-pipeline-step-card__lead">
          <span className="admin-pipeline-step-card__badge admin-pipeline-step-card__badge--nestedText">
            文本
          </span>
        </div>
        <div className="admin-pipeline-step-card__body">
          <div className="admin-pipeline-step-card__name">Prompt 格式化</div>
          <div className="admin-pipeline-step-card__desc">生图前将模板稿转为生图 prompt</div>
        </div>
      </div>
      <Select
        className="admin-pipeline-step-card__config-control"
        size="small"
        showSearch
        allowClear
        placeholder="选择 text 子业务"
        optionFilterProp="label"
        value={taskKey}
        options={textOptions.map((o) => ({ value: o.value, label: o.shortLabel || o.label }))}
        onChange={(v) => onChange(v)}
      />
    </div>
  );
}

type PipelineSegmentProps = {
  phase: PipelineAdminPhase;
  draft: TaskTemplateDraft;
  unifiedTemplate: string;
  manualSteps: PipelineStepDraft[];
  textOptions: { value: string; label: string }[];
  graphPreFormatKey?: string;
  showGraphFormat?: boolean;
  preNestedTextAfterRender?: boolean;
  businessScope?: string;
  sensitiveLists: SensitiveList[];
  sensitiveHint: string | null;
  onPatchManual: (steps: PipelineStepDraft[]) => void;
  onGraphFormatChange?: (key: string | undefined) => void;
};

function schemaPhaseOf(phase: PipelineAdminPhase): 'pre' | 'post' | null {
  if (phase === 'enrich') return null;
  return phase;
}

function PipelineSegment({
  phase,
  draft,
  unifiedTemplate,
  manualSteps,
  textOptions,
  graphPreFormatKey,
  showGraphFormat,
  preNestedTextAfterRender,
  businessScope,
  sensitiveLists,
  sensitiveHint,
  onPatchManual,
  onGraphFormatChange,
}: PipelineSegmentProps) {
  const formSchema = draft.contractSchema ?? draft.formSchema;
  const meta = WARP_STAGE_META[phase];
  const schemaPhase = schemaPhaseOf(phase);

  const visibleManual = useMemo(
    () =>
      manualSteps
        .map((step, manualIndex) => ({ step, manualIndex }))
        .filter(({ step }) => {
          if (phase === 'pre' && isGraphPreFormatStep(step)) return false;
          if (!schemaPhase) return true;
          return !isRedundantManualStep(step, formSchema, schemaPhase);
        }),
    [manualSteps, formSchema, phase, schemaPhase]
  );

  const autoItems = useMemo(() => {
    if (!schemaPhase) return [];
    return deriveAutoPipelineDisplayItems(formSchema, unifiedTemplate, schemaPhase, draft);
  }, [formSchema, unifiedTemplate, schemaPhase, draft]);

  const uncoveredAutoItems = useMemo(
    () =>
      autoItems.filter((auto) => {
        if (auto.kind !== 'contextField' || !schemaPhase) return true;
        return !visibleManual.some(({ step }) =>
          manualStepCoversContextField(step, auto.field, schemaPhase)
        );
      }),
    [autoItems, visibleManual, schemaPhase]
  );

  const manualItems: PipelineDisplayItem[] = useMemo(
    () => visibleManual.map(({ step, manualIndex }) => ({ kind: 'manual' as const, step, manualIndex })),
    [visibleManual]
  );

  const displayItems = useMemo(
    () => [...manualItems, ...uncoveredAutoItems],
    [manualItems, uncoveredAutoItems]
  );

  const stepCount = displayItems.length + (showGraphFormat ? 1 : 0);

  const existingIds = useMemo(
    () => new Set(visibleManual.map(({ step }) => pipelineStepIdentity(step))),
    [visibleManual]
  );

  const isVideo = businessScope === 'video';

  const addStepOptions = useMemo((): PipelineAddStepOption[] => {
    const addStep = (nextStep: PipelineStepDraft) => {
      if (schemaPhase && isRedundantManualStep(nextStep, formSchema, schemaPhase)) return;
      const id = pipelineStepIdentity(nextStep);
      if (existingIds.has(id)) return;
      onPatchManual([...manualSteps, nextStep]);
    };

    const opts: PipelineAddStepOption[] = [];

    for (const p of PIPELINE_PLATFORM_STEPS) {
      const candidate =
        p.kind === 'sensitiveCheck'
          ? buildSensitiveCheckStep()
          : buildPlatformPipelineStep(p.kind, phase, draft);
      const redundant =
        p.kind !== 'sensitiveCheck' &&
        p.kind !== 'webSearch' &&
        !!schemaPhase &&
        isRedundantManualStep(candidate, formSchema, schemaPhase);
      opts.push({
        key: `platform:${p.kind}`,
        title: p.label,
        description: redundant ? '表单已自动包含此步骤' : p.description,
        disabled: redundant,
        group: '平台步骤',
        onClick: () => {
          if (p.kind === 'sensitiveCheck') addStep(buildSensitiveCheckStep());
          else addStep(buildPlatformPipelineStep(p.kind, phase, draft));
        },
      });
    }

    if (phase === 'pre') {
      opts.push({
        key: 'resolveVoiceoverAudio',
        title: '口播音频解析（resolveVoiceoverAudio）',
        description: 'ffprobe 探测时长，写入 audio_duration_seconds',
        group: '口播 / 视频',
        onClick: () => addStep(buildResolveVoiceoverAudioStep()),
      });
      opts.push({
        key: 'transcribeVoiceoverAudio',
        title: 'ASR 语音识别（transcribeVoiceoverAudio）',
        description: '上传音频转写字幕；MiniMax TTS 有字幕时自动跳过',
        group: '口播 / 视频',
        onClick: () => addStep(buildTranscribeVoiceoverAudioStep()),
      });

      if (isVideo) {
        opts.push(
          {
            key: 'buildVideoEditTimeline-voiceover',
            title: '视频分镜构建 · 口播字幕',
            description: 'buildVideoEditTimeline / voiceover-subtitles',
            group: '视频分镜',
            onClick: () => addStep(buildVideoEditTimelineStep('voiceover-subtitles')),
          },
          {
            key: 'buildVideoEditTimeline-images',
            title: '视频分镜构建 · 图片序列',
            description: 'buildVideoEditTimeline / image-sequence',
            group: '视频分镜',
            onClick: () => addStep(buildVideoEditTimelineStep('image-sequence')),
          },
          {
            key: 'buildVideoEditTimeline-document',
            title: '视频分镜构建 · 文档章节',
            description: 'buildVideoEditTimeline / document-sections',
            group: '视频分镜',
            onClick: () => addStep(buildVideoEditTimelineStep('document-sections')),
          },
          {
            key: 'buildVideoEditTimeline-shots',
            title: '视频分镜构建 · 镜头列表',
            description: 'buildVideoEditTimeline / shot-list',
            group: '视频分镜',
            onClick: () => addStep(buildVideoEditTimelineStep('shot-list')),
          }
        );
      }
    }

    opts.push({
      key: 'manualReview',
      title: '人工审核',
      description: '暂停管线，展示草稿供用户确认后继续',
      group: '审核',
      onClick: () => addStep(buildManualReviewStep(phase)),
    });

    if (phase === 'pre' || phase === 'enrich') {
      opts.push({
        key: 'extractHotTopics',
        title: '热点提取',
        description: '联网检索后提炼少量话题 chips，避免把上百条检索直接给用户',
        group: '检索',
        onClick: () => addStep(buildExtractHotTopicsStep()),
      });
      opts.push({
        key: 'pickMainTopic',
        title: '选主话题',
        description: '按 topicChips 热度从多选源字段回填主话题',
        group: '检索',
        onClick: () => addStep(buildPickMainTopicStep()),
      });
      opts.push({
        key: 'pruneToSelection',
        title: '选题后剪枝',
        description: '抛弃未选题的发现池材料，仅保留与已选话题相关的检索',
        group: '检索',
        onClick: () => addStep(buildPruneToSelectionStep()),
      });
    }

    if (phase === 'pre' || phase === 'enrich') {
      opts.push({
        key: 'interactiveCard',
        title: '交互卡',
        description: 'pre/enrich 闸门：采集关键字段后继续（如选行业）',
        group: '审核',
        onClick: () => addStep(buildInteractiveCardStep(phase, 'interactive-card')),
      });
      opts.push({
        key: 'interactiveCard-basic',
        title: '分步 basic 表单',
        description: '闸门：分步采集日期/话题/风格；可带话题 chips',
        group: '审核',
        onClick: () => addStep(buildInteractiveCardStep(phase, 'basic-form')),
      });
    }

    if (phase === 'post') {
      opts.push({
        key: 'polishManuscript',
        title: '文本润色（polishManuscript）',
        description: 'post 阶段对 coreArtifact.text 调一次 text/transform/*，多语去 AI 感',
        group: '文本',
        onClick: () =>
          addStep({
            step: 'polishManuscript',
            params: { nestedTextTaskKey: 'text/transform/prose-deai' },
          }),
      });
      if (isVideo) {
        opts.push({
          key: 'videoTimelineClipRender',
          title: '逐段生成片段',
          description: '并发渲染各 clip（静图/GSAP/AI），不拼接，供成片审核',
          group: '视频',
          onClick: () => addStep(buildVideoTimelineClipRenderStep()),
        });
        opts.push({
          key: 'videoTimelineConcat',
          title: '成片拼接',
          description: '将已渲染 clip 拼接为成片',
          group: '视频',
          onClick: () => addStep(buildVideoTimelineConcatStep()),
        });
        opts.push({
          key: 'videoTimelineManualReview',
          title: '成片人工审核',
          description: '审核拼接结果',
          group: '视频',
          onClick: () => addStep(buildVideoTimelineManualReviewStep()),
        });
      }
      opts.push({
        key: 'markdownToPdf',
        title: 'Markdown → PDF',
        description: 'Post 产出阅读用 PDF（默认独立存储；失败不阻断）',
        group: '文档',
        onClick: () => addStep(buildMarkdownToPdfStep()),
      });
    }

    if (textOptions.length === 0) {
      opts.push({
        key: 'nestedText:empty',
        title: '文本子业务',
        description: '暂无可用 text 业务，请先在业务列表启用 text 子业务',
        group: '文本',
        disabled: true,
        onClick: () => undefined,
      });
    } else {
      const mapPhase = phase === 'post' ? 'post' : 'pre';
      for (const opt of textOptions) {
        const candidate: PipelineStepDraft = {
          step: 'nestedText',
          nestedTextTaskKey: opt.value,
          inputMapping: defaultNestedTextMapping(mapPhase),
          params:
            preNestedTextAfterRender && phase === 'pre' ? { afterPromptRender: true } : undefined,
        };
        const id = pipelineStepIdentity(candidate);
        const already = existingIds.has(id);
        opts.push({
          key: `nestedText:${opt.value}`,
          title: opt.label || opt.shortLabel || opt.value,
          description: already
            ? `已添加 · ${opt.value}`
            : `nestedText · ${opt.value}`,
          disabled: already,
          group: '文本',
          onClick: () => addStep(candidate),
        });
      }
    }

    return opts;
  }, [
    draft,
    existingIds,
    formSchema,
    isVideo,
    manualSteps,
    onPatchManual,
    phase,
    preNestedTextAfterRender,
    schemaPhase,
    textOptions,
  ]);

  const removeManualAt = (manualIndex: number) => {
    onPatchManual(manualSteps.filter((_, i) => i !== manualIndex));
  };

  const updateManualAt = (manualIndex: number, patch: Partial<PipelineStepDraft>) => {
    onPatchManual(manualSteps.map((s, i) => (i === manualIndex ? { ...s, ...patch } : s)));
  };

  const moveManual = (manualIndex: number, dir: -1 | 1) => {
    const next = [...manualSteps];
    const target = manualIndex + dir;
    if (target < 0 || target >= next.length) return;
    [next[manualIndex], next[target]] = [next[target], next[manualIndex]];
    onPatchManual(next);
  };

  const manualIndexList = visibleManual.map((v) => v.manualIndex);
  const firstManualIdx = manualIndexList[0];
  const lastManualIdx = manualIndexList[manualIndexList.length - 1];

  return (
    <div className={`admin-pipeline-segment admin-pipeline-segment--${phase}`}>
      <div className="admin-pipeline-segment__header">
        <span className="admin-pipeline-segment__title">
          {meta.title}
          <span className="admin-pipeline-segment__key">{meta.key}</span>
        </span>
        <span className="admin-pipeline-segment__count">
          {stepCount} 步 · 可配置
        </span>
      </div>
      <div className="admin-pipeline-segment__hint">{meta.hint}</div>

      <div className="admin-pipeline-segment__body">
        {displayItems.length === 0 && !showGraphFormat ? (
          <div className="admin-pipeline-empty">暂无步骤，可点击下方添加</div>
        ) : (
          displayItems.map((item, idx) => {
            const manualIndex = item.kind === 'manual' ? item.manualIndex : undefined;
            return (
              <StepCard
                key={`${item.kind}-${pipelineStepIdentity(item.step)}-${idx}`}
                item={item}
                formSchema={formSchema}
                phase={phase}
                textOptions={textOptions}
                sensitiveLists={sensitiveLists}
                sensitiveHint={sensitiveHint}
                canMoveUp={manualIndex !== undefined && manualIndex > firstManualIdx}
                canMoveDown={manualIndex !== undefined && manualIndex < lastManualIdx}
                onRemove={manualIndex !== undefined ? () => removeManualAt(manualIndex) : undefined}
                onUpdateStep={
                  manualIndex !== undefined
                    ? (patch) => updateManualAt(manualIndex, patch)
                    : undefined
                }
                onMoveUp={manualIndex !== undefined ? () => moveManual(manualIndex, -1) : undefined}
                onMoveDown={manualIndex !== undefined ? () => moveManual(manualIndex, 1) : undefined}
              />
            );
          })
        )}

        {showGraphFormat && onGraphFormatChange ? (
          <GraphFormatConfig
            taskKey={graphPreFormatKey}
            textOptions={textOptions}
            onChange={onGraphFormatChange}
          />
        ) : null}
      </div>

      <div className="admin-pipeline-segment__footer">
        <PipelineAddStepDropdown options={addStepOptions}>
          <Button size="small" icon={<PlusOutlined />}>
            添加步骤 <DownOutlined style={{ fontSize: 9, marginLeft: 2 }} />
          </Button>
        </PipelineAddStepDropdown>
      </div>
    </div>
  );
}

function PipelineConnector() {
  return (
    <div className="admin-pipeline-connector" aria-hidden>
      <span className="admin-pipeline-connector__chevron">
        <ArrowDownOutlined />
      </span>
    </div>
  );
}

function PlatformLockedStage({
  stage,
  children,
}: {
  stage: 'input' | 'output';
  children: ReactNode;
}) {
  const meta = WARP_STAGE_META[stage];
  return (
    <div className={`admin-pipeline-segment admin-pipeline-segment--${stage} admin-pipeline-segment--locked`}>
      <div className="admin-pipeline-segment__header">
        <span className="admin-pipeline-segment__title">
          {meta.title}
          <span className="admin-pipeline-segment__key">{meta.key}</span>
        </span>
        <span className="admin-pipeline-segment__lock">
          <LockOutlined /> 平台
        </span>
      </div>
      <div className="admin-pipeline-segment__hint">{meta.hint}</div>
      <div className="admin-pipeline-segment__body admin-pipeline-segment__body--locked">{children}</div>
    </div>
  );
}

export function AdminBusinessPipelineTab({
  draft,
  selected,
  textBusinessOptions,
  sensitiveLists,
  sensitiveHint,
  onDraftChange,
  onNavigateToPrompt,
}: AdminBusinessPipelineTabProps) {
  const unified = draft?.prompt?.unifiedTemplate ?? '';
  const textOptions = useMemo(() => toTextBusinessSelectOptions(textBusinessOptions), [textBusinessOptions]);
  const graphPreFormatKey = draft ? readGraphPreFormatTaskKey(draft) : undefined;
  const isGraph = selected?.scope === 'graph';
  const isVideo = selected?.scope === 'video';
  const preNestedTextAfterRender = selected?.scope === 'audio' || selected?.scope === 'music';

  const manualPre = draft?.pipeline?.pre ?? [];
  const manualEnrich = draft?.pipeline?.enrich ?? [];
  const manualPost = draft?.pipeline?.post ?? [];

  const patchPipeline = (phase: PipelineAdminPhase, steps: PipelineStepDraft[]) => {
    if (!draft) return;
    const next = ensurePipeline(draft);
    if (phase === 'pre') next.pipeline!.pre = steps;
    else if (phase === 'enrich') next.pipeline!.enrich = steps;
    else next.pipeline!.post = steps;
    onDraftChange(next);
  };

  const handleGraphFormat = (key: string | undefined) => {
    if (!draft) return;
    onDraftChange(stripLegacyFromPipeline(setGraphPreFormatTaskKey(draft, key)));
  };

  if (!draft) {
    return <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>请先选择业务</span>;
  }

  const promptPreview = (unified || '').trim().slice(0, 120);

  return (
    <div className="admin-business-pipeline">
      <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
        竖排五段：pre → input → enrich → output → post。pre / enrich / post 可增删改步骤；input /
        output 为平台固定节点。
      </Typography.Paragraph>

      <div className="admin-pipeline-rail admin-pipeline-rail--warp">
        <PipelineSegment
          phase="pre"
          draft={draft}
          unifiedTemplate={unified}
          manualSteps={manualPre}
          textOptions={textOptions}
          graphPreFormatKey={isGraph ? graphPreFormatKey : undefined}
          showGraphFormat={isGraph}
          preNestedTextAfterRender={preNestedTextAfterRender}
          businessScope={isVideo ? 'video' : selected?.scope}
          sensitiveLists={sensitiveLists}
          sensitiveHint={sensitiveHint}
          onPatchManual={(steps) => patchPipeline('pre', steps)}
          onGraphFormatChange={isGraph ? handleGraphFormat : undefined}
        />

        <PipelineConnector />

        <PlatformLockedStage stage="input">
          <div className="admin-pipeline-locked-card">
            <div className="admin-pipeline-locked-card__title">简单回填 basic</div>
            <div className="admin-pipeline-locked-card__desc">
              按合同字段 description 回填 basic；可写入 enrich_search 方案。不做角色与高复杂字段。
            </div>
          </div>
        </PlatformLockedStage>

        <PipelineConnector />

        <PipelineSegment
          phase="enrich"
          draft={draft}
          unifiedTemplate={unified}
          manualSteps={manualEnrich}
          textOptions={textOptions}
          businessScope={isVideo ? 'video' : selected?.scope}
          sensitiveLists={sensitiveLists}
          sensitiveHint={sensitiveHint}
          onPatchManual={(steps) => patchPipeline('enrich', steps)}
        />

        <PipelineConnector />

        <PlatformLockedStage stage="output">
          <div className="admin-pipeline-locked-card">
            <div className="admin-pipeline-locked-card__title">角色 Prompt + 完整合同</div>
            <div className="admin-pipeline-locked-card__desc">
              {promptPreview ? (
                <>
                  {promptPreview}
                  {unified.trim().length > 120 ? '…' : ''}
                </>
              ) : (
                '尚未编写 Output Prompt'
              )}
            </div>
            {onNavigateToPrompt ? (
              <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={onNavigateToPrompt}>
                编辑 Output Prompt →
              </Button>
            ) : null}
          </div>
        </PlatformLockedStage>

        <PipelineConnector />

        <PipelineSegment
          phase="post"
          draft={draft}
          unifiedTemplate={unified}
          manualSteps={manualPost}
          textOptions={textOptions}
          businessScope={isVideo ? 'video' : selected?.scope}
          sensitiveLists={sensitiveLists}
          sensitiveHint={sensitiveHint}
          onPatchManual={(steps) => patchPipeline('post', steps)}
        />
      </div>
    </div>
  );
}
