/**
 * 写作新建 UX：按 createUx / createGuide **能力**判定，不绑定具体业务名。
 * 业务由 Admin 动态上架；core 只认配置信号，禁止 industry-daily / seek 等业务键硬编码分支。
 */

export type WritingCreateGuideLike = {
  interactiveCard?: {
    label?: string;
    hint?: string;
    /** pre 结束后进 basic 前的提示（可选）；缺省用通用文案 */
    postPreHint?: string;
    fields?: Array<{ name?: string } | null> | null;
  } | null;
  webSearch?: {
    /**
     * 显式：pre 完成后在 C 端跑话题预览检索。
     * 未写时：若存在 topicCount 或 topicExtractTextKey 也视为需要客户端预览。
     */
    clientPreview?: boolean;
    topicExtractTextKey?: string;
    topicCount?: unknown;
    maxResults?: number;
  } | null;
} | null;

export type WritingSchemaLike = {
  properties?: Record<string, unknown>;
  'x-createUx'?: string;
  [k: string]: unknown;
} | null;

function guideFieldNames(createGuide?: WritingCreateGuideLike): Set<string> {
  const fields = createGuide?.interactiveCard?.fields;
  if (!Array.isArray(fields)) return new Set();
  return new Set(
    fields
      .map((f) => (f && typeof f.name === 'string' ? f.name.trim() : ''))
      .filter(Boolean)
  );
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
  if (ws.clientPreview === true) return true;
  if (typeof ws.topicExtractTextKey === 'string' && ws.topicExtractTextKey.trim().startsWith('text/')) {
    return true;
  }
  if (typeof ws.topicCount !== 'undefined' && ws.topicCount !== null && ws.topicCount !== '') {
    return true;
  }
  return false;
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

/** pre 结束后的助手提示：优先 createGuide，否则通用句，禁止写死某业务话术 */
export function resolvePostPreAssistantHint(opts: {
  createGuide?: WritingCreateGuideLike;
  usedClientWebSearchPreview: boolean;
  topicChipCount?: number;
}): string {
  const custom = opts.createGuide?.interactiveCard?.postPreHint?.trim();
  if (custom) return custom;
  if (opts.usedClientWebSearchPreview && (opts.topicChipCount ?? 0) > 0) {
    return `已提炼 ${opts.topicChipCount} 条候选话题（可多选）。请继续填写剩余项。`;
  }
  if (opts.usedClientWebSearchPreview) {
    return '检索预览已完成。请继续填写剩余项。';
  }
  return '基础信息已确认。请继续填写剩余项。';
}
