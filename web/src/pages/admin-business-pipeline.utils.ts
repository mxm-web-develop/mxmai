import type {
  JsonSchema,
  PipelineAdminPhase,
  PipelineStepDraft,
  TaskTemplateDraft,
} from './AdminBusiness.types';

export type DerivedContextField = {
  fieldName: string;
  kind: 'kbRecall' | 'webSearch';
  phase: 'pre' | 'post';
  maxItems: number;
  referencedInPrompt: boolean;
};

export type PipelineDisplayItem =
  | {
      kind: 'contextField';
      step: PipelineStepDraft;
      auto: true;
      field: DerivedContextField;
    }
  | {
      kind: 'manual';
      step: PipelineStepDraft;
      auto?: false;
      /** 在 pipeline.pre/post 数组中的索引，用于排序 */
      manualIndex?: number;
    };

export type PipelinePlatformStepKind =
  | 'webSearch'
  | 'kbRecall'
  | 'sensitiveCheck'
  | 'pickMainTopic'
  | 'pruneToSelection';

/** 业务管线可手动添加的平台步骤（knowledgeRetrieve 保留给 Smartflow） */
export const PIPELINE_PLATFORM_STEPS: {
  kind: PipelinePlatformStepKind;
  label: string;
  description: string;
}[] = [
  {
    kind: 'sensitiveCheck',
    label: '敏感词检查',
    description: '检查指定字段是否命中挂载词库；未挂载词库时使用业务路由绑定或平台默认词表',
  },
  {
    kind: 'webSearch',
    label: '联网检索（合同节点）',
    description:
      '查询配在节点上；pre 结果 → sources.websource；enrich 结果 → enrich_search.result；可用 queryBuilder 插件',
  },
  {
    kind: 'pickMainTopic',
    label: '选主话题',
    description: '按 topicChips 热度从多选源字段回填主话题；字段名可配',
  },
  {
    kind: 'pruneToSelection',
    label: '选题后剪枝',
    description:
      '用户选定话题后，抛弃发现池中未选题材料；仅保留相关检索条目供后续深挖/成稿（确定性，无 LLM）',
  },
  {
    kind: 'kbRecall',
    label: '知识库召回（Schema 字段）',
    description:
      '解析 Schema 中 kbRecall 字段。若 Schema 已有该字段，会自动出现在流程中，通常无需手动添加',
  },
];

export function buildPickMainTopicStep(): PipelineStepDraft {
  return {
    step: 'pickMainTopic',
    params: {
      sourceField: 'core_topic',
      targetField: 'main_topic',
      chipsPath: 'sources.websource.topicChips',
    },
  };
}

export function buildPruneToSelectionStep(): PipelineStepDraft {
  return {
    step: 'pruneToSelection',
    params: {
      sourceFields: ['core_topic', 'main_topic'],
      evidenceKey: 'websource',
      archiveDiscovery: false,
    },
  };
}
/** Graph 专用：Prompt 模板渲染后的格式化 nestedText（Admin 管线中隐藏，由 graphFormat 区块单独配置） */
export function isGraphPreFormatStep(step: PipelineStepDraft): boolean {
  return step.step === 'nestedText' && step.params?.graphPreFormat === true;
}

/** Audio/Music 等：模板渲染后执行的前置 nestedText（Admin 管线「前置」中展示、可配 taskKey 与 inputMapping） */
export function isAfterPromptRenderNestedText(step: PipelineStepDraft): boolean {
  return step.step === 'nestedText' && step.params?.afterPromptRender === true;
}

export function readGraphPreFormatTaskKey(draft: TaskTemplateDraft): string | undefined {
  const pre = draft.pipeline?.pre ?? [];
  const hit = pre.find(
    (s) =>
      s.step === 'nestedText' &&
      s.params?.graphPreFormat === true &&
      s.nestedTextTaskKey?.startsWith('text/')
  );
  return hit?.nestedTextTaskKey;
}

/** 打开业务时：legacy extra.promptTextTaskKey → pipeline.pre nestedText */
export function migrateLegacyPromptTextTaskKeyToPipeline(
  draft: TaskTemplateDraft,
  legacyKey?: string
): TaskTemplateDraft {
  const key = legacyKey?.trim();
  if (!key || !key.startsWith('text/')) return draft;
  if (readGraphPreFormatTaskKey(draft)) return draft;
  const pre = [...(draft.pipeline?.pre ?? [])];
  return {
    ...draft,
    pipeline: {
      pre: [
        ...pre.filter((s) => !isGraphPreFormatStep(s)),
        {
          step: 'nestedText',
          nestedTextTaskKey: key,
          params: { graphPreFormat: true, afterPromptRender: true },
          inputMapping: { prompt: '${state.finalPrompt}' },
        },
      ],
      post: draft.pipeline?.post ?? [],
    },
  };
}

export function setGraphPreFormatTaskKey(
  draft: TaskTemplateDraft,
  taskKey: string | undefined
): TaskTemplateDraft {
  const pre = [...(draft.pipeline?.pre ?? [])].filter((s) => !isGraphPreFormatStep(s));
  const key = taskKey?.trim();
  if (key && key.startsWith('text/')) {
    pre.push({
      step: 'nestedText',
      nestedTextTaskKey: key,
      params: { graphPreFormat: true, afterPromptRender: true },
      inputMapping: { prompt: '${state.finalPrompt}' },
    });
  }
  return {
    ...draft,
    pipeline: {
      pre,
      post: draft.pipeline?.post ?? [],
    },
  };
}

export function collectDerivedContextFields(
  formSchema: JsonSchema | undefined,
  unifiedTemplate: string
): DerivedContextField[] {
  const props = (formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const out: DerivedContextField[] = [];
  for (const [fieldName, def] of Object.entries(props)) {
    if (!def || typeof def !== 'object') continue;
    const ui = String(def['x-ui-type'] ?? '');
    if (ui !== 'kbRecall' && ui !== 'webSearch') continue;
    const phase = def['x-resolve-phase'] === 'post' ? 'post' : 'pre';
    const maxItems =
      typeof def['x-max-items'] === 'number' && def['x-max-items'] > 0
        ? Math.floor(def['x-max-items'] as number)
        : 5;
    const ref = unifiedTemplate.includes(`\${${fieldName}}`);
    out.push({
      fieldName,
      kind: ui as 'kbRecall' | 'webSearch',
      phase,
      maxItems,
      referencedInPrompt: ref,
    });
  }
  return out;
}

export function newSensitiveCheckStepUid(): string {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSensitiveCheckStep(
  opts?: { paths?: string[]; listIds?: string[] }
): PipelineStepDraft {
  const paths = opts?.paths?.length ? opts.paths : ['prompt'];
  const listIds = opts?.listIds?.filter(Boolean);
  return {
    step: 'sensitiveCheck',
    params: {
      paths,
      ...(listIds?.length ? { listIds } : {}),
      _uid: newSensitiveCheckStepUid(),
    },
  };
}

export const SENSITIVE_PATH_PRESETS: { value: string; label: string }[] = [
  { value: 'prompt', label: '用户 prompt（params.prompt）' },
  { value: 'finalPrompt', label: '模板渲染结果（state.finalPrompt）' },
];

export function collectSensitivePathOptions(formSchema: JsonSchema | undefined): { value: string; label: string }[] {
  const props = (formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fieldOpts: { value: string; label: string }[] = [];
  for (const [name, def] of Object.entries(props)) {
    if (!def || typeof def !== 'object') continue;
    const t = String(def.type ?? 'string');
    if (t !== 'string') continue;
    fieldOpts.push({
      value: name,
      label: `表单字段 · ${String(def.title ?? name)}（params.${name}）`,
    });
  }
  return [...SENSITIVE_PATH_PRESETS, ...fieldOpts];
}

/** 从 pipeline 读取首个敏感词步骤的词库 id（兼容路由绑定迁移） */
export function readSensitiveListIdsFromPipeline(draft: TaskTemplateDraft): string[] {
  const pre = draft.pipeline?.pre ?? [];
  for (const step of pre) {
    if (step.step !== 'sensitiveCheck') continue;
    const ids = step.params?.listIds;
    if (Array.isArray(ids) && ids.length > 0) {
      return ids.map((id) => String(id).trim()).filter(Boolean);
    }
  }
  return [];
}

/** 打开业务时：路由/绑定词库 id → pipeline 首条 sensitiveCheck */
export function migrateSensitiveBindingToPipeline(
  draft: TaskTemplateDraft,
  bindingListIds: string[]
): TaskTemplateDraft {
  const ids = bindingListIds.map((id) => String(id).trim()).filter(Boolean);
  const pre = [...(draft.pipeline?.pre ?? [])];
  const firstIdx = pre.findIndex((s) => s.step === 'sensitiveCheck');

  if (firstIdx >= 0) {
    const existing = pre[firstIdx];
    const existingIds = existing.params?.listIds;
    if (Array.isArray(existingIds) && existingIds.length > 0) return draft;
    if (ids.length === 0) return draft;
    pre[firstIdx] = {
      ...existing,
      params: { ...(existing.params ?? {}), listIds: ids },
    };
    return { ...draft, pipeline: { pre, post: draft.pipeline?.post ?? [] } };
  }

  if (ids.length === 0) return draft;
  return {
    ...draft,
    pipeline: {
      pre: [buildSensitiveCheckStep({ listIds: ids }), ...pre],
      post: draft.pipeline?.post ?? [],
    },
  };
}

export function isDefaultSensitiveCheckDisabled(draft: TaskTemplateDraft): boolean {
  const extra = (draft.extra ?? {}) as Record<string, unknown>;
  const pd = extra.pipelineDefaults as Record<string, unknown> | undefined;
  return pd?.sensitiveCheck === false || extra.disableDefaultSensitiveCheck === true;
}

/** @deprecated 默认敏感词自动注入已移除，保留读取以清理旧 draft 字段 */
export function setDefaultSensitiveCheckDisabled(draft: TaskTemplateDraft, disabled: boolean): TaskTemplateDraft {
  const extra = { ...((draft.extra ?? {}) as Record<string, unknown>) };
  const pd = { ...((extra.pipelineDefaults as Record<string, unknown> | undefined) ?? {}) };
  if (disabled) pd.sensitiveCheck = false;
  else delete pd.sensitiveCheck;
  extra.pipelineDefaults = pd;
  return { ...draft, extra };
}

export type TextBusinessOption = { value: string; label: string; shortLabel: string };

/** 去掉 subtypeLabel 中的技术说明尾巴，供卡片标题使用 */
export function sanitizeBusinessDisplayLabel(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  s = (s.split(/[；;\n]/)[0] ?? s).trim();
  s = s.replace(/\s*（[^）]*(?:nestedText|管线|audio\/|text\/)[^）]*）/gi, '').trim();
  s = s.replace(/\s*\([^)]*(?:nestedText|pipeline)[^)]*\)/gi, '').trim();
  s = s.replace(/\s*→.+$/u, '').trim();
  s = s.replace(/\s*可挂载.+$/u, '').trim();
  if (s.length > 24) return `${s.slice(0, 22)}…`;
  return s;
}

function humanizeTaskKeySegment(seg: string): string {
  const known: Record<string, string> = {
    'voice-script-draft': '口播稿撰写',
    'tts-markup': 'TTS 润色',
  };
  if (known[seg]) return known[seg];
  if (/^[\u4e00-\u9fff]/.test(seg)) return seg;
  return seg.replace(/-/g, ' ');
}

export function lookupTextBusinessLabel(
  taskKey: string | undefined,
  textOptions: TextBusinessOption[]
): string | undefined {
  if (!taskKey) return undefined;
  return textOptions.find((o) => o.value === taskKey)?.label;
}

export function lookupTextBusinessShortLabel(
  taskKey: string | undefined,
  textOptions: TextBusinessOption[]
): string {
  if (!taskKey) return '文本子业务';
  const opt = textOptions.find((o) => o.value === taskKey);
  if (opt?.shortLabel) return opt.shortLabel;
  const seg = taskKey.split('/').pop() ?? taskKey;
  return humanizeTaskKeySegment(seg);
}

function friendlySensitivePathLabel(path: string, formSchema?: JsonSchema): string {
  if (path === 'prompt') return '用户输入';
  if (path === 'finalPrompt') return '模板渲染结果';
  const props = (formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const def = props[path];
  if (def && typeof def === 'object') {
    const title = String(def.title ?? path);
    return `表单 · ${title}`;
  }
  return path;
}

const MANUAL_REVIEW_KIND_LABELS: Record<string, string> = {
  text: '文本',
  json: 'JSON',
  image: '图片',
  composite: '组合预览',
};

export function defaultNestedTextMapping(phase: 'pre' | 'post'): Record<string, string> {
  if (phase === 'pre') return { prompt: '${params.prompt}' };
  return { prompt: '${state.coreArtifact.text}' };
}

/** 与 mxmcgi pipeline-step-when 对齐 */
export type PipelineWhenOp = 'eq' | 'neq' | 'empty' | 'notEmpty' | 'truthy' | 'falsy';

export type PipelineWhenClause = {
  field: string;
  op: PipelineWhenOp;
  value?: unknown;
};

export const PIPELINE_WHEN_OP_OPTIONS: { value: PipelineWhenOp; label: string }[] = [
  { value: 'falsy', label: '为假 / 未勾选（falsy）' },
  { value: 'truthy', label: '为真 / 已勾选（truthy）' },
  { value: 'empty', label: '为空（empty）' },
  { value: 'notEmpty', label: '非空（notEmpty）' },
  { value: 'eq', label: '等于（eq）' },
  { value: 'neq', label: '不等于（neq）' },
];

export const NESTED_TEXT_OUTPUT_TARGET_OPTIONS = [
  { value: '', label: '默认（expert→合并 business；其它→覆盖 finalPrompt）' },
  { value: 'business', label: '合并进合同 business（expert）' },
  { value: 'lyrics', label: '写入 lyrics 字段（音乐歌词，不覆盖 prompt）' },
] as const;

export type PipelineWhenMode = 'all' | 'any';

export function readPipelineWhenMode(step: PipelineStepDraft): PipelineWhenMode {
  const any = step.when?.any;
  if (Array.isArray(any) && any.length > 0) return 'any';
  return 'all';
}

export function readPipelineWhenClauses(step: PipelineStepDraft): PipelineWhenClause[] {
  const mode = readPipelineWhenMode(step);
  const raw = mode === 'any' ? step.when?.any : step.when?.all;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is PipelineWhenClause => !!c && typeof c === 'object' && typeof (c as PipelineWhenClause).field === 'string')
    .map((c) => ({
      field: String(c.field),
      op: (c.op as PipelineWhenOp) ?? 'truthy',
      value: c.value,
    }));
}

export function writePipelineWhenClauses(
  step: PipelineStepDraft,
  clauses: PipelineWhenClause[],
  mode: PipelineWhenMode = readPipelineWhenMode(step)
): PipelineStepDraft {
  const normalized = clauses
    .map((c) => ({
      field: c.field.trim(),
      op: c.op,
      ...(c.op === 'eq' || c.op === 'neq' ? { value: c.value } : {}),
    }))
    .filter((c) => c.field.length > 0);
  if (normalized.length === 0) {
    const next = { ...step };
    delete next.when;
    return next;
  }
  return { ...step, when: mode === 'any' ? { any: normalized } : { all: normalized } };
}

/** 系统默认 claim / evidence 键（与 mxmcgi claim-commit 对齐） */
export const SYSTEM_CLAIM_PATH_OPTIONS: { value: string; label: string }[] = [
  { value: 'basic', label: '整区 basic' },
  { value: 'business', label: '整区 business' },
  { value: 'selection', label: 'selection（选题剪枝）' },
  { value: 'selection.topics', label: 'selection.topics' },
  { value: 'assets', label: '整区 assets' },
  { value: 'assets.cards', label: 'assets.cards' },
  { value: 'assets.media', label: 'assets.media' },
  { value: 'sources.websource', label: 'sources.websource（指针）' },
  { value: 'enrich_search.query', label: 'enrich_search.query' },
];

export const SYSTEM_EVIDENCE_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'websource', label: 'websource' },
  { value: 'enrich_result', label: 'enrich_result' },
  { value: 'enrich_supplement', label: 'enrich_supplement' },
  { value: 'enrich_result_side', label: 'enrich_result_side（副线）' },
];

/**
 * 从合同 schema 收集可 claim 路径（basic.* / business.* + 系统键）。
 * 供 Admin nestedText 显性联想多选。
 */
export function collectContractClaimPathOptions(
  contractSchema?: JsonSchema
): { value: string; label: string }[] {
  const props = (contractSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fromSchema: { value: string; label: string }[] = [];
  for (const [key, def] of Object.entries(props)) {
    if (!def || typeof def !== 'object') continue;
    const zone = def['x-zone'] === 'basic' ? 'basic' : 'business';
    const title = String(def.title ?? key);
    fromSchema.push({
      value: `${zone}.${key}`,
      label: `${title}（${zone}.${key}）`,
    });
  }
  const seen = new Set(fromSchema.map((o) => o.value));
  const system = SYSTEM_CLAIM_PATH_OPTIONS.filter((o) => !seen.has(o.value));
  return [...fromSchema, ...system];
}

/** 可写回 business 的字段：schema business 区 + 可选 field_specs 名 */
export function collectContractCommitPathOptions(
  contractSchema?: JsonSchema,
  fieldSpecs?: unknown
): { value: string; label: string }[] {
  const props = (contractSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const out: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const [key, def] of Object.entries(props)) {
    if (!def || typeof def !== 'object') continue;
    if (def['x-zone'] === 'basic') continue;
    const title = String(def.title ?? key);
    out.push({ value: key, label: `${title}（business.${key}）` });
    seen.add(key);
  }
  if (Array.isArray(fieldSpecs)) {
    for (const it of fieldSpecs) {
      if (!it || typeof it !== 'object') continue;
      const name = String((it as { name?: unknown }).name ?? '').trim();
      if (!name || seen.has(name)) continue;
      const desc = String((it as { description?: unknown }).description ?? '').trim();
      out.push({
        value: name,
        label: desc ? `${name} · ${desc.slice(0, 40)}` : name,
      });
      seen.add(name);
    }
  }
  return out;
}

export function collectFormParamFieldOptions(formSchema?: JsonSchema): { value: string; label: string }[] {
  const props = (formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(props).map(([key, def]) => ({
    value: `params.${key}`,
    label: `${String(def.title ?? key)} (params.${key})`,
  }));
}

export function formatPipelineWhenSummary(step: PipelineStepDraft, formSchema?: JsonSchema): string | null {
  const clauses = readPipelineWhenClauses(step);
  if (clauses.length === 0) return null;
  const mode = readPipelineWhenMode(step);
  const fieldOptions = collectFormParamFieldOptions(formSchema);
  const parts = clauses.slice(0, 2).map((c) => {
    const label = fieldOptions.find((o) => o.value === c.field)?.label ?? c.field;
    const opLabel = PIPELINE_WHEN_OP_OPTIONS.find((o) => o.value === c.op)?.label ?? c.op;
    if (c.op === 'eq' || c.op === 'neq') {
      return `${label} ${opLabel} ${String(c.value ?? '')}`;
    }
    return `${label} · ${opLabel}`;
  });
  const suffix = clauses.length > 2 ? ` 等 ${clauses.length} 条` : '';
  const modeHint = mode === 'any' ? '任一满足' : '全部满足';
  return `条件执行（${modeHint}）· ${parts.join(mode === 'any' ? ' 或 ' : '；')}${suffix}`;
}

export function formatNestedTextOutputTargetSummary(step: PipelineStepDraft): string | null {
  if (step.step !== 'nestedText') return null;
  const parts: string[] = [];
  const claim = Array.isArray(step.params?.claimPaths) ? step.params.claimPaths.length : 0;
  if (claim > 0) parts.push(`领取 ${claim} 字段`);
  const ev = Array.isArray(step.params?.evidenceKeys) ? step.params.evidenceKeys.length : 0;
  if (ev > 0) parts.push(`证据 ${ev}`);
  const target = step.params?.outputTarget;
  if (target === 'lyrics') parts.push('输出 → lyrics');
  if (isAfterPromptRenderNestedText(step)) parts.push('模板渲染后 · 覆盖 finalPrompt');
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export function pipelineStepIdentity(step: PipelineStepDraft): string {
  if (step.step === 'sensitiveCheck') {
    const uid = step.params?._uid as string | undefined;
    if (uid) return `sensitiveCheck:${uid}`;
    const paths = (step.params?.paths as string[] | undefined)?.join(',') ?? 'prompt';
    const listIds = (step.params?.listIds as string[] | undefined)?.join(',') ?? '';
    return `sensitiveCheck:${paths}:${listIds}`;
  }
  if (step.step === 'webSearch') {
    const q = (step.params?.queryFrom as string | undefined) ?? (step.params?.query as string | undefined) ?? '';
    const target = (step.params?.target as string | undefined) ?? '';
    return `webSearch:${q}:${target}`;
  }
  if (step.step === 'extractHotTopics') {
    const key =
      (step.params?.textKey as string | undefined) ??
      step.nestedTextTaskKey ??
      'text/expert/industry-hot-topics';
    return `extractHotTopics:${key}`;
  }
  if (step.step === 'resolveContextFields') {
    const kinds = (step.params?.kinds as string[] | undefined)?.join(',') ?? 'all';
    return `resolveContextFields:${kinds}:${step.params?.phase ?? ''}`;
  }
  if (step.step === 'nestedText') return `nestedText:${step.nestedTextTaskKey ?? ''}`;
  if (step.step === 'manualReview') {
    const id = (step.params?.id as string | undefined) ?? '';
    const kind = (step.params?.kind as string | undefined) ?? 'text';
    return `manualReview:${id}:${kind}:${step.params?.phase ?? ''}`;
  }
  if (step.step === 'interactiveCard') {
    const id = (step.params?.id as string | undefined) ?? '';
    const kind = (step.params?.kind as string | undefined) ?? 'interactive-card';
    return `interactiveCard:${id}:${kind}`;
  }
  if (step.step === 'markdownToPdf' || step.step === 'renderDocumentPdf') {
    const mode = (step.params?.storageMode as string | undefined) ?? 'sidecar';
    return `markdownToPdf:${mode}`;
  }
  if (step.step === 'transcribeVoiceoverAudio') {
    const audioFrom = (step.params?.audioUrlFrom as string | undefined) ?? '';
    return `transcribeVoiceoverAudio:${audioFrom}`;
  }
  if (step.step === 'resolveVoiceoverAudio') {
    const audioFrom = (step.params?.audioUrlFrom as string | undefined) ?? '';
    return `resolveVoiceoverAudio:${audioFrom}`;
  }
  if (step.step === 'buildVideoEditTimeline' || step.step === 'buildSciencePopTimeline') {
    const strategy = (step.params?.segmentStrategy as string | undefined) ?? '';
    return `buildVideoEditTimeline:${strategy}`;
  }
  if (step.step === 'videoTimelineRender' || step.step === 'nestedVideo') {
    return 'videoTimelineRender';
  }
  if (step.step === 'polishManuscript') {
    const key =
      (step.params?.nestedTextTaskKey as string | undefined) ?? 'text/transform/prose-deai';
    return `polishManuscript:${key}`;
  }
  return step.step;
}

export function buildTranscribeVoiceoverAudioStep(): PipelineStepDraft {
  return {
    step: 'transcribeVoiceoverAudio',
    params: {
      audioUrlFrom: '${params.voiceover_audio_url}',
      skipWhenTtsSubtitles: true,
      skipWhenScriptPresent: true,
      language: 'zh',
    },
  };
}

export function buildResolveVoiceoverAudioStep(): PipelineStepDraft {
  return {
    step: 'resolveVoiceoverAudio',
    params: {
      audioUrlFrom: '${params.voiceover_audio_url}',
      durationField: 'audio_duration_seconds',
      sourceTaskIdFrom: '${params.voiceover_source_task_id}',
    },
  };
}

/** 视频剪辑：确定性生成 OpenReel 分镜 JSON（Admin 可改 segmentStrategy / fieldMapping） */
export function buildVideoEditTimelineStep(
  strategy: 'voiceover-subtitles' | 'fixed-chunk' | 'shot-list' | 'image-sequence' | 'document-sections'
): PipelineStepDraft {
  const base: PipelineStepDraft = {
    step: 'buildVideoEditTimeline',
    params: {
      segmentStrategy: strategy,
      chunkSeconds: 8,
      promptTemplate:
        '${styleHint}主题「${title}」，本段内容：「${segmentText}」。画面语义须与旁白一致。${supplement}',
      defaultStyleHint: '专业视频画面，',
      videoTrackName: '片段',
      audioTrackName: '口播',
    },
    fieldMapping: {
      duration: '${params.target_duration_seconds}',
      title: '${params.topic}',
      aspectRatio: '${params.aspectRatio}',
      renderPlan: '${params.render_plan}',
      editStyle: '${params.edit_style}',
      supplement: '${params.supplement}',
    },
  };

  if (strategy === 'voiceover-subtitles') {
    return {
      ...base,
      params: {
        ...base.params,
        segmentsStatePath: 'voiceoverSubtitles.segments',
        segmentsFrom: '${params.voiceover_subtitles_json}',
        styleHints: {
          'science-minimal': '深色极简科普画面，克制留白与柔和光效，',
          documentary: '纪实纪录片镜头感，自然光影与真实质感，',
          'motion-infographic': '动感信息图风格，清晰图形与数据可视化元素，',
          classroom: '课堂白板教学风格，简洁图示与板书感，',
        },
      },
      fieldMapping: {
        duration: '${params.audio_duration_seconds}',
        title: '${params.topic}',
        audioUrl: '${params.voiceover_audio_url}',
        segments: '${params.voiceover_subtitles_json}',
        aspectRatio: '${params.aspectRatio}',
        renderPlan: '${params.render_plan}',
        editStyle: '${params.edit_style}',
        supplement: '${params.supplement}',
      },
    };
  }

  if (strategy === 'image-sequence') {
    return {
      ...base,
      fieldMapping: {
        ...base.fieldMapping,
        duration: '${params.target_duration_seconds}',
        segments: '${params.image_sequence_json}',
      },
    };
  }

  if (strategy === 'document-sections') {
    return {
      ...base,
      fieldMapping: {
        ...base.fieldMapping,
        duration: '${params.target_duration_seconds}',
        segments: '${params.document_sections_json}',
      },
    };
  }

  if (strategy === 'shot-list') {
    return {
      ...base,
      fieldMapping: {
        ...base.fieldMapping,
        duration: '${params.target_duration_seconds}',
        segments: '${state.shotList}',
      },
    };
  }

  return base;
}

export type VideoTimelineRenderMode = 'clips' | 'concat' | 'concat-only' | 'render-and-concat';

/** 从 renderOptions 推断管线渲染阶段（同 step 类型，不同职责） */
export function inferVideoTimelineRenderMode(step: PipelineStepDraft): VideoTimelineRenderMode {
  const opts = step.params?.renderOptions as
    | { concatFinal?: boolean; skipReadyClips?: boolean; concatOnly?: boolean }
    | undefined;
  if (opts?.concatOnly === true) return 'concat-only';
  if (opts?.concatFinal === false) return 'clips';
  if (opts?.concatFinal === true && opts?.skipReadyClips === true) return 'concat';
  return 'render-and-concat';
}

const VIDEO_TIMELINE_RENDER_MODE_LABELS: Record<VideoTimelineRenderMode, string> = {
  clips: '逐段生成片段',
  concat: '拼接成片',
  'concat-only': '仅拼接成片',
  'render-and-concat': '渲染并拼接',
};

export function formatVideoTimelineRenderLabel(step: PipelineStepDraft): string {
  return VIDEO_TIMELINE_RENDER_MODE_LABELS[inferVideoTimelineRenderMode(step)];
}

export function buildVideoTimelineClipRenderStep(): PipelineStepDraft {
  return {
    step: 'videoTimelineRender',
    params: {
      renderOptions: { concatFinal: false },
    },
    inputMapping: {
      videoEditScriptJson: '${state.videoEditScriptJson}',
      label: '${params.topic}',
    },
  };
}

/** 第二次渲染：跳过已就绪 clip，只做 concat */
export function buildVideoTimelineConcatStep(): PipelineStepDraft {
  return {
    step: 'videoTimelineRender',
    params: {
      renderOptions: { concatFinal: true, skipReadyClips: true },
    },
    inputMapping: {
      videoEditScriptJson: '${state.videoEditScriptJson}',
      label: '${params.topic}',
    },
  };
}

/** @deprecated 使用 buildVideoTimelineClipRenderStep */
export function buildVideoTimelineRenderStep(): PipelineStepDraft {
  return buildVideoTimelineClipRenderStep();
}

/** @deprecated 使用 buildVideoTimelineClipRenderStep */
export function buildNestedVideoRenderStep(): PipelineStepDraft {
  return buildVideoTimelineClipRenderStep();
}

export function buildVideoTimelineManualReviewStep(): PipelineStepDraft {
  return {
    step: 'manualReview',
    params: {
      id: `video-timeline-review-${Date.now()}`,
      label: '视频分镜审核（时间轴）',
      hint: '检查时间轴各段模式与素材，通过后继续渲染成片。',
      kind: 'video-timeline',
      draftFrom: '${state.finalArtifact.text}',
      applyMapping: {
        'state.videoEditScriptJson': '${review.json}',
        'state.videoEditScriptMetadata': '${review.metadata}',
      },
      editable: true,
    },
  };
}

export function buildMarkdownToPdfStep(): PipelineStepDraft {
  return {
    step: 'markdownToPdf',
    params: {
      storageMode: 'sidecar',
      includeCover: true,
      includeToc: true,
      useLayoutLlm: false,
      fallbackRenderer: 'markdown',
      maxRetries: 2,
    },
    inputMapping: {
      markdown: '${state.coreArtifact.text}',
      title: '${params.title}',
    },
  };
}

/** @deprecated 使用 buildMarkdownToPdfStep */
export function buildRenderDocumentPdfStep(): PipelineStepDraft {
  return buildMarkdownToPdfStep();
}

export function buildManualReviewStep(phase: PipelineAdminPhase): PipelineStepDraft {
  const label =
    phase === 'pre' ? '前置审核' : phase === 'enrich' ? 'Enrich 审核' : '产出审核';
  return {
    step: 'manualReview',
    params: {
      phase,
      id: `${phase}-review-${Date.now()}`,
      label,
      kind: phase === 'post' ? 'image' : 'text',
      draftFrom: phase === 'post' ? '${state.coreArtifact.mediaUrls}' : '${state.finalPrompt}',
      applyMapping: phase === 'post' ? undefined : { prompt: '${review.text}' },
    },
  };
}

/** mxm-warp pre 交互卡 / 分步 basic 闸门 */
export function buildInteractiveCardStep(
  phase: PipelineAdminPhase,
  kind: 'interactive-card' | 'basic-form' = 'interactive-card'
): PipelineStepDraft {
  const isBasic = kind === 'basic-form';
  return {
    step: 'interactiveCard',
    params: {
      id: `${phase}-${isBasic ? 'basic' : 'card'}-${Date.now()}`,
      label: isBasic ? '完善基础信息' : '交互卡',
      hint: isBasic ? '分步采集；可含话题推荐 chips' : '先采集关键字段再继续管线',
      kind,
      fields: isBasic
        ? [
            { name: 'core_topic', type: 'string', title: '核心话题', required: false, 'x-ui': 'topic-chips' },
          ]
        : [{ name: 'topic', type: 'string', title: '主题', required: true }],
      skippable: isBasic,
      editable: true,
    },
  };
}

/** mxm-warp 网络检索节点（非 Schema resolveContextFields） */
export function buildWarpWebSearchStep(phase: PipelineAdminPhase): PipelineStepDraft {
  const isEnrich = phase === 'enrich';
  return {
    step: 'webSearch',
    params: {
      queryFrom: isEnrich ? 'contract.enrich_search.query' : 'params.topic',
      target: isEnrich ? 'enrich_search.result' : 'sources.websource',
      depth: isEnrich ? 'standard' : 'quick',
      maxResults: isEnrich ? 8 : 5,
      resultMaxChars: isEnrich ? 3500 : 2000,
    },
  };
}

/** pre：联网检索后的热点提取（独立 text 业务 → topicChips） */
export function buildExtractHotTopicsStep(): PipelineStepDraft {
  return {
    step: 'extractHotTopics',
    params: {
      textKey: 'text/expert/industry-hot-topics',
      maxTopics: 40,
      maxInputItems: 80,
    },
  };
}

export function isWarpWebSearchStep(step: PipelineStepDraft): boolean {
  if (step.step !== 'webSearch') return false;
  const p = step.params ?? {};
  return (
    typeof p.query === 'string' ||
    typeof p.queryFrom === 'string' ||
    typeof p.target === 'string' ||
    typeof p.depth === 'string' ||
    typeof p.resultMaxChars === 'number'
  );
}

export function buildPlatformPipelineStep(
  kind: PipelinePlatformStepKind,
  phase: PipelineAdminPhase,
  _draft: TaskTemplateDraft
): PipelineStepDraft {
  switch (kind) {
    case 'webSearch':
      return buildWarpWebSearchStep(phase);
    case 'pickMainTopic':
      return buildPickMainTopicStep();
    case 'pruneToSelection':
      return buildPruneToSelectionStep();
    case 'kbRecall':
      return {
        step: 'resolveContextFields',
        params: { phase: phase === 'enrich' ? 'pre' : phase, kinds: ['kbRecall'] },
      };
    case 'sensitiveCheck':
      return buildSensitiveCheckStep();
    default:
      return { step: kind };
  }
}

export function formatPipelineStepLabel(
  step: PipelineStepDraft,
  field?: DerivedContextField,
  textOptions?: TextBusinessOption[]
): string {
  switch (step.step) {
    case 'sensitiveCheck':
      return '敏感词检查';
    case 'webSearch':
      return '联网检索';
    case 'extractHotTopics':
      return '热点提取';
    case 'pickMainTopic':
      return '选主话题';
    case 'pruneToSelection':
      return '选题后剪枝';
    case 'resolveContextFields': {
      if (field) {
        return field.kind === 'webSearch' ? '联网检索' : '知识库召回';
      }
      const kinds = step.params?.kinds as string[] | undefined;
      if (kinds?.includes('webSearch') && kinds.length === 1) return '联网检索';
      if (kinds?.includes('kbRecall') && kinds.length === 1) return '知识库召回';
      return '上下文字段';
    }
    case 'nestedText': {
      const short = lookupTextBusinessShortLabel(step.nestedTextTaskKey, textOptions ?? []);
      if (isGraphPreFormatStep(step)) return short === '文本子业务' ? 'Prompt 格式化' : short;
      return short;
    }
    case 'manualReview': {
      const label = (step.params?.label as string | undefined)?.trim();
      if (label) return label;
      return step.params?.phase === 'post' ? '产出审核' : '前置审核';
    }
    case 'interactiveCard': {
      const label = (step.params?.label as string | undefined)?.trim();
      if (label) return label;
      return step.params?.kind === 'basic-form' ? '分步 basic' : '交互卡';
    }
    case 'markdownToPdf':
    case 'renderDocumentPdf':
      return 'Markdown → PDF';
    case 'transcribeVoiceoverAudio':
      return 'ASR 语音识别';
    case 'resolveVoiceoverAudio':
      return '口播音频解析';
    case 'buildVideoEditTimeline':
    case 'buildSciencePopTimeline': {
      const strategy = (step.params?.segmentStrategy as string | undefined) ?? 'voiceover-subtitles';
      const labels: Record<string, string> = {
        'voiceover-subtitles': '口播字幕分镜',
        'fixed-chunk': '固定时长分镜',
        'shot-list': '镜头列表分镜',
        'image-sequence': '图片序列分镜',
        'document-sections': '文档章节分镜',
      };
      return labels[strategy] ?? '视频分镜构建';
    }
    case 'videoTimelineRender':
    case 'nestedVideo':
      return formatVideoTimelineRenderLabel(step);
    case 'polishManuscript': {
      const key = (step.params?.nestedTextTaskKey as string | undefined) ?? 'text/transform/prose-deai';
      return `文本润色 · ${lookupTextBusinessShortLabel(key, textOptions ?? [])}`;
    }
    case 'groupItemBatch': {
      const hasSearch = !!(step.params as { itemWebSearch?: unknown } | undefined)?.itemWebSearch;
      const hasText = !!(step.params as { itemNestedText?: unknown } | undefined)?.itemNestedText;
      if (hasSearch && hasText) return '分路联网检索 + 成稿策划';
      if (hasSearch) return '分路联网检索';
      if (hasText) return '分路成稿策划';
      return '组内并发回填';
    }
    case 'assembleGroupText':
      return '汇编组成稿';
    case 'dialogueLineTts':
      return '逐句多音色 TTS';
    case 'resolveDialogueTimeline':
      return '展开对话时间轴';
    case 'renderAudioTimeline':
      return '对话时间轴混音';
    default:
      return step.step;
  }
}

/** 步骤卡片一行摘要（不含模板语法） */
export function formatPipelineStepSummary(
  step: PipelineStepDraft,
  opts?: { formSchema?: JsonSchema; field?: DerivedContextField; sensitiveLists?: { id: string; name: string }[] }
): string | null {
  if (step.step === 'sensitiveCheck') {
    const paths = (step.params?.paths as string[] | undefined) ?? ['prompt'];
    const pathText = paths.map((p) => friendlySensitivePathLabel(p, opts?.formSchema)).join('、');
    const listIds = (step.params?.listIds as string[] | undefined) ?? [];
    if (listIds.length > 0) {
      const names = listIds
        .map((id) => opts?.sensitiveLists?.find((l) => l.id === id)?.name ?? id)
        .slice(0, 2);
      const suffix = listIds.length > 2 ? ` 等 ${listIds.length} 个词库` : '';
      return `检查 ${pathText} · ${names.join('、')}${suffix}`;
    }
    return `检查 ${pathText} · 使用业务默认词库`;
  }
  if (step.step === 'webSearch') {
    const queryFrom = (step.params?.queryFrom as string | undefined)?.trim();
    const query = (step.params?.query as string | undefined)?.trim();
    const queryTemplate = (step.params?.queryTemplate as string | undefined)?.trim();
    const queryBuilder = (step.params?.queryBuilder as string | undefined)?.trim();
    const target = (step.params?.target as string | undefined) ?? 'sources.websource';
    const maxResults = step.params?.maxResults ?? 6;
    const src = query
      ? `「${query.slice(0, 24)}」`
      : queryTemplate
        ? `模板「${queryTemplate.slice(0, 28)}」`
        : queryBuilder
          ? `builder:${queryBuilder}`
          : queryFrom || '—';
    return `${src} → ${target}；最多 ${maxResults} 条`;
  }
  if (step.step === 'extractHotTopics') {
    const textKey =
      (step.params?.textKey as string | undefined)?.trim() ||
      step.nestedTextTaskKey ||
      'text/expert/industry-hot-topics';
    const maxTopics = step.params?.maxTopics ?? 40;
    return `${textKey} · 发现池约 ${maxTopics} 条（换一批翻页，不把检索原文当选项）`;
  }
  if (step.step === 'pickMainTopic') {
    const source = (step.params?.sourceField as string | undefined)?.trim() || 'core_topic';
    const target = (step.params?.targetField as string | undefined)?.trim() || 'main_topic';
    return `${source} → ${target}（按 chips 热度）`;
  }
  if (step.step === 'pruneToSelection') {
    const fields = Array.isArray(step.params?.sourceFields)
      ? (step.params!.sourceFields as unknown[]).map(String).join('+')
      : 'core_topic+main_topic';
    return `按 ${fields} 抛弃未选题检索；归档发现池`;
  }
  if (step.step === 'manualReview') {
    const kind = (step.params?.kind as string | undefined) ?? 'text';
    return `暂停等待确认 · ${MANUAL_REVIEW_KIND_LABELS[kind] ?? kind}`;
  }
  if (step.step === 'interactiveCard') {
    const kind = (step.params?.kind as string | undefined) ?? 'interactive-card';
    const n = Array.isArray(step.params?.fields) ? step.params.fields.length : 0;
    return `闸门 · ${kind === 'basic-form' ? '分步 basic' : '交互卡'}${n ? ` · ${n} 字段` : ''}`;
  }
  if (step.step === 'nestedText') {
    if (isGraphPreFormatStep(step)) return '生图前格式化 prompt';
    const outputHint = formatNestedTextOutputTargetSummary(step);
    const whenHint = formatPipelineWhenSummary(step, opts?.formSchema);
    const timing = isAfterPromptRenderNestedText(step) ? '模板渲染后执行' : '核心生成后执行';
    return [timing, outputHint, whenHint].filter(Boolean).join(' · ') || timing;
  }
  if (step.step === 'groupItemBatch') {
    const p = step.params as {
      itemWebSearch?: { queryTemplate?: string };
      itemNestedText?: { nestedTextTaskKey?: string };
      itemsFrom?: string;
    } | undefined;
    const parts: string[] = [];
    if (p?.itemWebSearch) {
      const qt = p.itemWebSearch.queryTemplate?.trim();
      parts.push(qt ? `联网检索「${qt.slice(0, 36)}」` : '分路联网检索');
    }
    if (p?.itemNestedText?.nestedTextTaskKey) {
      parts.push(`策划 ${p.itemNestedText.nestedTextTaskKey}`);
    }
    if (p?.itemsFrom) parts.push(`← ${p.itemsFrom}`);
    return parts.join(' · ') || '组内并发回填';
  }
  if (step.step === 'transcribeVoiceoverAudio') {
    const skipTts = step.params?.skipWhenTtsSubtitles !== false;
    return skipTts ? 'FunASR · TTS 有字幕则跳过' : 'FunASR 中文 ASR';
  }
  if (step.step === 'resolveVoiceoverAudio') {
    return '探测口播时长，并引入 TTS 已持久化字幕（有则跳过听译）';
  }
  if (step.step === 'videoTimelineRender' || step.step === 'nestedVideo') {
    const mode = inferVideoTimelineRenderMode(step);
    if (mode === 'clips') return '并发渲染各段 · 不拼接';
    if (mode === 'concat') return '跳过已就绪 · 拼接导出';
    if (mode === 'concat-only') return '仅拼接已有片段';
    return '渲染并拼接成片';
  }
  if (step.step === 'polishManuscript') {
    const key = (step.params?.nestedTextTaskKey as string | undefined) ?? 'text/transform/prose-deai';
    const deterministic = step.params?.deterministicPolish !== false ? ' · 确定性抛光' : '';
    return `${key}${deterministic}`;
  }
  if (step.step === 'resolveContextFields' && opts?.field) {
    const fieldTitle =
      ((opts.formSchema?.properties ?? {}) as Record<string, Record<string, unknown>>)[opts.field.fieldName]
        ?.title ?? opts.field.fieldName;
    const autoHint = opts.field.referencedInPrompt ? '自动 · 已在 Prompt 引用' : '自动 · 随表单字段';
    return `${autoHint} · ${String(fieldTitle)}`;
  }
  return formatPipelineWhenSummary(step, opts?.formSchema);
}

/** 卡片 Tooltip：完整业务说明（含技术路径） */
export function formatPipelineStepTooltip(
  step: PipelineStepDraft,
  textOptions?: TextBusinessOption[]
): string | null {
  if (step.step === 'nestedText' && step.nestedTextTaskKey) {
    const full = lookupTextBusinessLabel(step.nestedTextTaskKey, textOptions ?? []);
    const key = step.nestedTextTaskKey;
    if (full && full !== lookupTextBusinessShortLabel(key, textOptions ?? [])) {
      return `${full}\n\n子业务：${key}`;
    }
    return `子业务：${key}`;
  }
  if (step.step === 'polishManuscript') {
    const key = (step.params?.nestedTextTaskKey as string | undefined) ?? 'text/transform/prose-deai';
    const langFrom = String(step.params?.languageFrom ?? '').trim();
    const det = step.params?.deterministicPolish === false ? '关闭' : '开启';
    return `post 阶段对 coreArtifact.text 调一次 ${key}（多语去 AI 感改写）\n语言来源：${langFrom || 'coreArtifact.metadata.language → params.language → contract.basic.language → zh'}\n确定性抛光：${det}`;
  }
  return null;
}

/** Schema 驱动、运行时自动注入的步骤（仅 kbRecall/webSearch，不含敏感词） */
export function deriveAutoPipelineDisplayItems(
  formSchema: JsonSchema | undefined,
  unifiedTemplate: string,
  phase: 'pre' | 'post',
  _draft: TaskTemplateDraft
): PipelineDisplayItem[] {
  const items: PipelineDisplayItem[] = [];

  for (const field of collectDerivedContextFields(formSchema, unifiedTemplate).filter(
    (f) => f.phase === phase
  )) {
    items.push({
      kind: 'contextField',
      step: {
        step: 'resolveContextFields',
        params: { phase, kinds: [field.kind] },
      },
      auto: true,
      field,
    });
  }

  return items;
}

export function manualStepCoversContextField(
  step: PipelineStepDraft,
  field: DerivedContextField,
  phase: 'pre' | 'post'
): boolean {
  if (step.step !== 'resolveContextFields') return false;
  const stepPhase = (step.params?.phase as string | undefined) ?? phase;
  if (stepPhase !== phase) return false;
  const kinds = step.params?.kinds as string[] | undefined;
  return kinds?.includes(field.kind) ?? false;
}

/** @deprecated 仅测试/兼容；展示请用 deriveAutoPipelineDisplayItems */
export function deriveAutoPipelineSteps(
  formSchema: JsonSchema | undefined,
  phase: 'pre' | 'post',
  _draft: TaskTemplateDraft
): PipelineStepDraft[] {
  const steps: PipelineStepDraft[] = [];

  const phaseFields = collectDerivedContextFields(formSchema, '').filter((f) => f.phase === phase);
  if (phaseFields.length > 0) {
    const kinds = [...new Set(phaseFields.map((f) => f.kind))];
    steps.push({ step: 'resolveContextFields', params: { phase, kinds } });
  }

  return steps;
}

export function schemaFieldNamesForResolveStep(
  formSchema: JsonSchema | undefined,
  phase: 'pre' | 'post',
  kinds?: string[]
): string[] {
  const kindSet = kinds?.length ? new Set(kinds) : null;
  return collectDerivedContextFields(formSchema, '')
    .filter((f) => f.phase === phase && (!kindSet || kindSet.has(f.kind)))
    .map((f) => f.fieldName);
}

export function isRedundantManualStep(
  step: PipelineStepDraft,
  formSchema: JsonSchema | undefined,
  phase: 'pre' | 'post'
): boolean {
  if (step.step === 'resolveContextFields') {
    const stepPhase = (step.params?.phase as string | undefined) ?? phase;
    if (stepPhase !== phase) return false;
    const kinds = step.params?.kinds as string[] | undefined;
    const fields = schemaFieldNamesForResolveStep(formSchema, phase, kinds);
    return fields.length > 0;
  }
  if (step.step === 'knowledgeRetrieve') {
    return true;
  }
  return false;
}

export function formatPipelineStepDetail(
  step: PipelineStepDraft,
  opts?: { formSchema?: JsonSchema; phase?: PipelineAdminPhase; field?: DerivedContextField }
): string | null {
  if (step.step === 'webSearch') {
    const query = (step.params?.query as string | undefined)?.trim();
    const queryFrom = (step.params?.queryFrom as string | undefined)?.trim();
    const target = (step.params?.target as string | undefined) ?? 'sources.websource';
    const depth = (step.params?.depth as string | undefined) ?? 'standard';
    const maxResults = step.params?.maxResults ?? 6;
    const maxChars = step.params?.resultMaxChars ?? 2500;
    const topicKey = (step.params?.topicExtractTextKey as string | undefined)?.trim();
    const qLabel = query ? `固定查询「${query.slice(0, 40)}」` : `查询来自 ${queryFrom || '—'}`;
    const extract = topicKey ? `；话题提炼 ${topicKey}` : '';
    return `${qLabel} → ${target}；深度 ${depth}；最多 ${maxResults} 条；截断 ${maxChars} 字${extract}`;
  }
  if (step.step === 'sensitiveCheck') {
    const paths = (step.params?.paths as string[] | undefined) ?? ['prompt'];
    const pathLabels = paths
      .map((p) => {
        if (p === 'prompt') return '用户 prompt';
        if (p === 'finalPrompt') return '模板渲染结果';
        return p;
      })
      .join('、');
    const listIds = step.params?.listIds as string[] | undefined;
    const listHint =
      Array.isArray(listIds) && listIds.length > 0
        ? '使用本步挂载词库'
        : '未挂载词库时使用业务路由绑定或平台默认词表';
    return `检查 ${pathLabels}；${listHint}。`;
  }
  if (step.step === 'resolveContextFields') {
    const field = opts?.field;
    if (field?.kind === 'webSearch') {
      const ref = field.referencedInPrompt ? '已在 Prompt 中引用' : 'Prompt 未引用 ${' + field.fieldName + '}';
      return `读取表单字段 ${field.fieldName} 的检索配置，调用搜索引擎获取资料，格式化后供 Prompt 插值。${ref}。`;
    }
    if (field?.kind === 'kbRecall') {
      const ref = field.referencedInPrompt ? '已在 Prompt 中引用' : 'Prompt 未引用 ${' + field.fieldName + '}';
      return `读取表单字段 ${field.fieldName} 的文件夹与问题，从已向量化知识库召回片段，供 Prompt 插值。${ref}。`;
    }
    const phase = step.params?.phase === 'post' ? '核心生成之后' : '核心生成之前';
    const kinds = step.params?.kinds as string[] | undefined;
    const fieldNames = schemaFieldNamesForResolveStep(
      opts?.formSchema,
      (step.params?.phase as 'pre' | 'post' | undefined) ?? opts?.phase ?? 'pre',
      kinds
    );
    const fieldHint = fieldNames.length ? `字段：${fieldNames.join('、')}` : '';
    return `${phase}解析 Schema 中的联网检索 / 知识库召回字段。${fieldHint}`;
  }
  if (step.step === 'nestedText') {
    if (isGraphPreFormatStep(step)) {
      return 'renderPrompt 之后，将 unifiedTemplate 拼好的稿交给 text 子业务做生图 prompt 格式化';
    }
    if (isAfterPromptRenderNestedText(step)) {
      const mapping = step.inputMapping ?? {};
      const lines = Object.entries(mapping).map(([k, v]) => `${k} ← ${v}`);
      const mappingHint = lines.length ? lines.join('；') : '未配置 inputMapping';
      return `模板渲染后调用 ${step.nestedTextTaskKey ?? 'text 子业务'}。${mappingHint}`;
    }
    if (step.inputMapping?.prompt) return `prompt ← ${step.inputMapping.prompt}`;
    const mapping = step.inputMapping ?? {};
    const lines = Object.entries(mapping).map(([k, v]) => `${k} ← ${v}`);
    if (lines.length) return lines.join('；');
  }
  if (step.step === 'manualReview') {
    const kind = (step.params?.kind as string | undefined) ?? 'text';
    const draftFrom = (step.params?.draftFrom as string | undefined) ?? 'state.finalPrompt';
    const phase = step.params?.phase === 'post' ? '后置' : '前置';
    return `${phase}暂停等待人工确认（${kind}）；草稿来源 ${draftFrom}`;
  }
  if (step.step === 'markdownToPdf' || step.step === 'renderDocumentPdf') {
    const mode = (step.params?.storageMode as string | undefined) ?? 'sidecar';
    const cover = step.params?.includeCover !== false ? '封面' : '无封面';
    const toc = step.params?.includeToc !== false ? '目录' : '无目录';
    const modeLabel = mode === 'overwrite' ? '覆盖主存' : '独立 sidecar';
    return `Markdown→PDF（${modeLabel}；${cover}+${toc}）；失败不阻断任务`;
  }
  if (step.step === 'transcribeVoiceoverAudio') {
    const skipTts = step.params?.skipWhenTtsSubtitles !== false;
    const skipScript = step.params?.skipWhenScriptPresent !== false;
    const hints: string[] = [];
    if (skipTts) hints.push('TTS 有字幕则跳过');
    if (skipScript) hints.push('已填文稿则跳过');
    return `FunASR 生成句级字幕${hints.length ? `（${hints.join('；')}）` : ''}`;
  }
  if (step.step === 'resolveVoiceoverAudio') {
    return 'ffprobe 探测口播时长，并写入已持久化的 TTS 字幕到 params.voiceover_subtitles_json';
  }
  if (step.step === 'buildVideoEditTimeline' || step.step === 'buildSciencePopTimeline') {
    const strategy = (step.params?.segmentStrategy as string | undefined) ?? 'voiceover-subtitles';
    const mapping = step.fieldMapping ?? {};
    const mapHint = Object.keys(mapping).length
      ? Object.entries(mapping)
          .slice(0, 4)
          .map(([k, v]) => `${k}←${v}`)
          .join('；')
      : '未配置 fieldMapping';
    return `segmentStrategy=${strategy}；${mapHint}`;
  }
  if (step.step === 'videoTimelineRender' || step.step === 'nestedVideo') {
    const mode = inferVideoTimelineRenderMode(step);
    if (mode === 'clips') {
      return '并发渲染各 clip（静图/GSAP/AI 生成）· 不拼接 · 供成片审核';
    }
    if (mode === 'concat') {
      return '跳过已就绪片段 · ffmpeg 拼接为完整 mp4';
    }
    if (mode === 'concat-only') {
      return '不重新渲染 · 仅按时间轴拼接已有片段';
    }
    return '逐段渲染并拼接为完整 mp4';
  }
  if (step.step === 'polishManuscript') {
    const key =
      (step.params?.nestedTextTaskKey as string | undefined) ?? 'text/transform/prose-deai';
    const langFrom = String(step.params?.languageFrom ?? '').trim();
    const det = step.params?.deterministicPolish === false ? '关闭' : '开启';
    return `调 ${key} 对 coreArtifact.text 做多语去 AI 感改写；写回 coreArtifact/finalArtifact。语言来源：${langFrom || '自动'}；确定性抛光：${det}。`;
  }
  return null;
}
