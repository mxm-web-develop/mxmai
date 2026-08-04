/**
 * 写作新建 UX：按 createUx / createGuide **能力**判定，不绑定具体业务名。
 * 业务由 Admin 动态上架；core 只认配置信号，禁止 industry-daily / seek 等业务键硬编码分支。
 */

export type WritingCreateGuideCardLike = {
  label?: string;
  hint?: string;
  /** pre 结束后进 basic 前的提示（可选）；缺省用通用文案 */
  postPreHint?: string;
  fields?: Array<{ name?: string } | null> | null;
} | null;

export type WritingCreateGuideLike = {
  interactiveCard?: WritingCreateGuideCardLike;
  followUpInteractiveCard?: WritingCreateGuideCardLike;
  nestedTextPreview?: {
    nestedTextTaskKey?: string;
    clientPreview?: boolean;
    loadingHint?: string;
  } | null;
  webSearch?: {
    /**
     * 显式：pre 完成后在 C 端跑话题预览检索。
     * 未写时：若存在 topicCount 或 topicExtractTextKey 也视为需要客户端预览。
     * 若配置 midPreAfterField，则改为「答完该字段后」中途检索（如话题写作 voice_id→topic）。
     */
    clientPreview?: boolean;
    topicExtractTextKey?: string;
    topicCount?: unknown;
    maxResults?: number;
    /** 中途触发：答完该字段后检索推荐话题（如 voice_id） */
    midPreAfterField?: string;
    /** 推荐写入的字段名，默认 topic */
    topicField?: string;
  } | null;
  /** 答完结构后预生成可编辑大纲 */
  outlinePreview?: {
    clientPreview?: boolean;
    midPreAfterField?: string;
    outlineField?: string;
    textKey?: string;
    loadingHint?: string;
  } | null;
} | null;

export type WritingSchemaLike = {
  properties?: Record<string, unknown>;
  'x-createUx'?: string;
  [k: string]: unknown;
} | null;

function guideFieldNamesFromCard(card?: WritingCreateGuideCardLike): Set<string> {
  const fields = card?.fields;
  if (!Array.isArray(fields)) return new Set();
  return new Set(
    fields
      .map((f) => (f && typeof f.name === 'string' ? f.name.trim() : ''))
      .filter(Boolean)
  );
}

function guideFieldNames(createGuide?: WritingCreateGuideLike): Set<string> {
  return new Set([
    ...guideFieldNamesFromCard(createGuide?.interactiveCard),
    ...guideFieldNamesFromCard(createGuide?.followUpInteractiveCard),
  ]);
}

function schemaPreCollectNames(schema?: WritingSchemaLike): Set<string> {
  const out = new Set<string>();
  const props = schema?.properties ?? {};
  for (const [name, prop] of Object.entries(props)) {
    if (prop && typeof prop === 'object' && (prop as Record<string, unknown>)['x-collect'] === 'pre') {
      out.add(name);
    }
  }
  return out;
}

/** schema / createUx 标明走分步引导（相对长 Schema 表单） */
export function indicatesWarpGatesCreate(opts: {
  createUx?: string | null;
  schema?: WritingSchemaLike;
  createGuide?: WritingCreateGuideLike;
}): boolean {
  if (opts.createUx === 'warp-gates') return true;
  if (opts.schema?.['x-createUx'] === 'warp-gates') return true;
  if (opts.createGuide?.interactiveCard?.fields?.length) return true;
  return false;
}

/**
 * @deprecated 使用 indicatesWarpGatesCreate；保留别名以免旧 import 断裂
 */
export function schemaIndicatesWarpGuidedCreate(schema?: WritingSchemaLike): boolean {
  return indicatesWarpGatesCreate({ schema });
}

/** 是否走抽屉内分步引导 */
export function shouldUseWritingWarpGuidedCreate(opts: {
  createUx?: string | null;
  schema?: WritingSchemaLike;
  createGuide?: WritingCreateGuideLike;
  /** @deprecated 忽略：不得用业务键判定 */
  taskKey?: string | null;
  subtype?: string | null;
  subtypeLabel?: string | null;
}): boolean {
  return indicatesWarpGatesCreate(opts);
}

/**
 * pre 完成后是否需要 C 端「检索预览 + 话题 chips」。
 * 信号来自 createGuide.webSearch，与具体业务名无关。
 */
export function needsCreateGuideClientWebSearchPreview(opts: {
  createGuide?: WritingCreateGuideLike;
  /** @deprecated 忽略 */
  schema?: WritingSchemaLike;
  taskKey?: string | null;
  subtype?: string | null;
  subtypeLabel?: string | null;
}): boolean {
  const ws = opts.createGuide?.webSearch;
  if (!ws || typeof ws !== 'object') return false;
  if (ws.clientPreview === false) return false;
  // 中途检索（voice_id→topic）不算 pre 结束后的行业日报式预览
  if (String(ws.midPreAfterField ?? '').trim()) return false;
  if (ws.clientPreview === true) return true;
  if (typeof ws.topicExtractTextKey === 'string' && ws.topicExtractTextKey.trim().startsWith('text/')) {
    return true;
  }
  if (typeof ws.topicCount !== 'undefined' && ws.topicCount !== null && ws.topicCount !== '') {
    return true;
  }
  return false;
}

/** 答完某 pre 字段后立刻检索推荐话题（话题写作：风格→话题） */
export function getCreateGuideMidPreTopicRecommend(opts: {
  createGuide?: WritingCreateGuideLike;
}): {
  afterField: string;
  topicField: string;
  topicExtractTextKey?: string;
  topicCount: number;
  maxResults: number;
} | null {
  const ws = opts.createGuide?.webSearch;
  if (!ws || typeof ws !== 'object') return null;
  if (ws.clientPreview === false) return null;
  const afterField = String(ws.midPreAfterField ?? '').trim();
  if (!afterField) return null;
  const topicCountRaw = Number(ws.topicCount);
  const maxResultsRaw = Number(ws.maxResults);
  return {
    afterField,
    topicField: String(ws.topicField ?? 'topic').trim() || 'topic',
    topicExtractTextKey:
      typeof ws.topicExtractTextKey === 'string' && ws.topicExtractTextKey.trim().startsWith('text/')
        ? ws.topicExtractTextKey.trim()
        : undefined,
    topicCount:
      Number.isFinite(topicCountRaw) && topicCountRaw > 0
        ? Math.min(48, Math.floor(topicCountRaw))
        : 32,
    maxResults:
      Number.isFinite(maxResultsRaw) && maxResultsRaw > 0
        ? Math.min(200, Math.floor(maxResultsRaw))
        : 80,
  };
}

/** 答完某 pre 字段后立刻生成可编辑大纲（话题写作：结构→大纲） */
export function getCreateGuideMidPreOutline(opts: {
  createGuide?: WritingCreateGuideLike;
}): {
  afterField: string;
  outlineField: string;
  textKey: string;
  loadingHint: string;
} | null {
  const op = opts.createGuide?.outlinePreview;
  if (!op || typeof op !== 'object') return null;
  if (op.clientPreview === false) return null;
  const afterField = String(op.midPreAfterField ?? 'structure_id').trim() || 'structure_id';
  const textKey =
    typeof op.textKey === 'string' && op.textKey.trim().startsWith('text/')
      ? op.textKey.trim()
      : 'text/expert/topic-article-outline';
  return {
    afterField,
    outlineField: String(op.outlineField ?? 'outline').trim() || 'outline',
    textKey,
    loadingHint:
      String(op.loadingHint ?? '').trim() || '正在根据话题与结构生成简要大纲，请稍候…',
  };
}

/**
 * pre 第一张交互卡后是否需要 C 端跑 nestedText，再展示第二张卡。
 * 信号来自 createGuide.nestedTextPreview + followUpInteractiveCard。
 */
export function needsCreateGuideNestedTextPreview(opts: {
  createGuide?: WritingCreateGuideLike;
}): boolean {
  const nt = opts.createGuide?.nestedTextPreview;
  const follow = opts.createGuide?.followUpInteractiveCard;
  if (!nt || typeof nt !== 'object') return false;
  if (nt.clientPreview === false) return false;
  const key = String(nt.nestedTextTaskKey ?? '').trim();
  if (!key.startsWith('text/')) return false;
  if (!Array.isArray(follow?.fields) || follow.fields.length === 0) return false;
  return true;
}

/**
 * @deprecated 使用 needsCreateGuideClientWebSearchPreview
 */
export function needsIndustryTrendPreview(opts: {
  createGuide?: WritingCreateGuideLike;
  schema?: WritingSchemaLike;
  taskKey?: string | null;
  subtype?: string | null;
  subtypeLabel?: string | null;
}): boolean {
  return needsCreateGuideClientWebSearchPreview(opts);
}

/** 从 createGuide / schema 收集已在 pre 阶段采集的字段名 */
export function collectPreFieldNames(
  createGuide?: WritingCreateGuideLike,
  schema?: WritingSchemaLike
): Set<string> {
  return new Set([...guideFieldNames(createGuide), ...schemaPreCollectNames(schema)]);
}

/**
 * basic 队列：去掉本业务 pre 已采字段；只保留当前 schema 里存在的字段。
 * 不做「某业务专属字段」名单——隔离靠会话钉死的 schema。
 */
export function filterBasicFieldsByCreateGuide<T extends { name: string }>(
  fields: T[],
  opts: {
    schema?: WritingSchemaLike;
    createGuide?: WritingCreateGuideLike;
  }
): T[] {
  const preNames = collectPreFieldNames(opts.createGuide, opts.schema);
  const schemaNames = new Set(Object.keys(opts.schema?.properties ?? {}));
  return fields.filter((f) => {
    if (preNames.has(f.name)) return false;
    if (schemaNames.size > 0 && !schemaNames.has(f.name)) return false;
    return true;
  });
}

/**
 * @deprecated 使用 filterBasicFieldsByCreateGuide
 */
export function filterBasicFieldsForBusiness<T extends { name: string }>(
  fields: T[],
  opts: {
    schema?: WritingSchemaLike;
    createGuide?: WritingCreateGuideLike;
    taskKey?: string | null;
    subtype?: string | null;
    subtypeLabel?: string | null;
  }
): T[] {
  return filterBasicFieldsByCreateGuide(fields, opts);
}

/** pre 结束后的助手提示：优先第二张卡 / 通用句；勿把第一张卡的 loading 文案当结束语 */
export function resolvePostPreAssistantHint(opts: {
  createGuide?: WritingCreateGuideLike;
  usedClientWebSearchPreview: boolean;
  topicChipCount?: number;
}): string {
  const followHint = opts.createGuide?.followUpInteractiveCard?.postPreHint?.trim();
  if (followHint) return followHint;
  // 双卡 + nestedText：第一张 postPreHint 是 loading，不能当结束提示
  if (opts.createGuide?.nestedTextPreview?.nestedTextTaskKey) {
    return '推荐已就绪。请继续确认后生成。';
  }
  const custom = opts.createGuide?.interactiveCard?.postPreHint?.trim();
  if (custom) return custom;
  if (opts.usedClientWebSearchPreview && (opts.topicChipCount ?? 0) > 0) {
    return `已提炼 ${opts.topicChipCount} 条候选话题（可多选，可换一批）。请继续填写剩余项。`;
  }
  if (opts.usedClientWebSearchPreview) {
    return '检索预览已完成。请继续填写剩余项。';
  }
  return '基础信息已确认。请继续填写剩余项。';
}
