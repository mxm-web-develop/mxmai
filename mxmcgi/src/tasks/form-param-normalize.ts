import type { JsonSchemaV2 } from './types';

/** 与前端 prepareSubmitParams.flattenTextFileOrPasteForSubmit 对齐：表单对象 → 纯文本 */
export function flattenTextFileOrPasteParams(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  if (!props || typeof props !== 'object') return params;

  const next = { ...params };
  for (const [key, defRaw] of Object.entries(props)) {
    if (!(key in next)) continue;
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    if (def['x-ui-type'] !== 'textFileOrPaste') continue;

    const v = next[key];
    if (typeof v === 'string') {
      next[key] = v.trim();
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const text = (v as { text?: string }).text;
      next[key] = typeof text === 'string' ? text.trim() : '';
    } else {
      next[key] = '';
    }
  }
  return next;
}

/** 校验前通用归一化（textFileOrPaste、管线模板注入的字符串数字等） */
export function coerceSchemaTypedParams(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[] }>;
  if (!props || typeof props !== 'object') return params;

  const next = { ...params };
  for (const [key, def] of Object.entries(props)) {
    const raw = next[key];
    if (raw === '' || raw === undefined || raw === null) continue;
    const types = Array.isArray(def?.type) ? def.type : def?.type ? [def.type] : [];
    if (types.includes('boolean') && typeof raw === 'string') {
      const s = raw.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on') next[key] = true;
      else if (s === 'false' || s === '0' || s === 'no' || s === 'off') next[key] = false;
      continue;
    }
    if (types.includes('array') && typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (Array.isArray(parsed)) {
            next[key] = parsed;
          }
        } catch {
          /* keep string for validate error */
        }
      }
      continue;
    }
    if (!types.includes('number') && !types.includes('integer')) continue;
    if (typeof raw === 'string') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        next[key] = types.includes('integer') ? Math.floor(n) : n;
      }
    }
  }
  // 主观分析关闭时清立场，避免脏 enum
  if (
    props.subjective_analysis &&
    props.analysis_stance &&
    next.subjective_analysis !== true &&
    next.subjective_analysis !== 'true'
  ) {
    delete next.analysis_stance;
  }
  return next;
}

/**
 * 引导「自定义」曾把自由文本写进带 enum 的字段（如 industry=「储能」），
 * 校验前收成「其他」+ *_custom，与下游 resolveIndustrySearchStrategy 约定对齐。
 */
export function coerceOtherEnumCustomParams(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema.properties ?? {}) as Record<
    string,
    { enum?: unknown[]; type?: string | string[] }
  >;
  if (!props || typeof props !== 'object') return params;

  const pairs: Array<{ field: string; custom: string }> = [
    { field: 'industry', custom: 'industry_custom' },
    { field: 'style', custom: 'style_custom' },
    { field: 'article_structure', custom: 'article_structure_custom' },
  ];

  const next = { ...params };
  for (const { field, custom } of pairs) {
    const def = props[field];
    if (!def || !Array.isArray(def.enum) || def.enum.length === 0) continue;
    const allowed = def.enum.map((x) => String(x));
    if (!allowed.includes('其他') && !allowed.includes('其它')) continue;

    const otherLabel = allowed.includes('其他') ? '其他' : '其它';
    const raw = String(next[field] ?? '').trim();
    if (!raw) continue;
    if (allowed.includes(raw)) continue;

    const existingCustom = String(next[custom] ?? '').trim();
    if (!existingCustom) next[custom] = raw;
    next[field] = otherLabel;
  }
  return next;
}

export function normalizeParamsBeforeSchemaValidate(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>
): Record<string, unknown> {
  return coerceSchemaTypedParams(
    schema,
    coerceOtherEnumCustomParams(schema, flattenTextFileOrPasteParams(schema, params))
  );
}

/** 与前端 buildDefaultsFromSchema 对齐：schema 含 uid 时服务端 nested 调用也补全 */
export function ensureTaskUidFromSchema(
  params: Record<string, unknown>,
  schema: JsonSchemaV2 | undefined
): void {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(props, 'uid')) return;
  const cur = params.uid;
  if (cur !== undefined && cur !== null && String(cur).trim()) return;
  params.uid = `task_${Date.now()}`;
}

/**
 * Admin / 表单控件常把 integer enum 存成 ["5","8"]，与 type:integer 互斥导致永远校验失败。
 * 加载定义时把可解析的数字字符串 enum 收回 number。
 */
export function sanitizeNumericEnumsInJsonSchema(schema: JsonSchemaV2 | undefined): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  const props = schema.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return;

  for (const defRaw of Object.values(props as Record<string, unknown>)) {
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as { type?: string | string[]; enum?: unknown[]; default?: unknown };
    const types = Array.isArray(def.type) ? def.type : def.type ? [def.type] : [];
    const numeric = types.includes('integer') || types.includes('number');
    if (!numeric || !Array.isArray(def.enum) || def.enum.length === 0) continue;

    const asInt = types.includes('integer');
    let changed = false;
    const nextEnum = def.enum.map((x) => {
      if (typeof x === 'number' && Number.isFinite(x)) return asInt ? Math.trunc(x) : x;
      if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) {
        changed = true;
        const n = Number(x);
        return asInt ? Math.trunc(n) : n;
      }
      return x;
    });
    if (changed) def.enum = nextEnum;

    if (typeof def.default === 'string' && def.default.trim() !== '' && Number.isFinite(Number(def.default))) {
      const n = Number(def.default);
      def.default = asInt ? Math.trunc(n) : n;
    }
  }
}
