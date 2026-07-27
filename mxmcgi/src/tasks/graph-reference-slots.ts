/**
 * Graph 任务：将表单中多个 x-ui-type=referenceImages 槽位合并为 referenceImage，
 * 以及从合并后的 referenceImage 按 groupKey 拆回各槽位（供模板插值与 graph-service 一致）。
 */

import type { JsonSchemaV2 } from './types';
import { isUsableReferenceImageContent } from '../task/reference-image';
import { extractParallelCount, PARALLEL_COUNT_KEY } from './platform-fields';

/** 参考图组件写入的槽位元数据（merge/hydrate 会补全） */
const REFERENCE_IMAGE_SLOT_ITEM_PROPERTIES: Record<string, Record<string, unknown>> = {
  groupKey: {
    type: 'string',
    title: '槽位键',
    description: '与 formSchema 字段名一致，由参考图组件写入',
  },
  groupTitle: {
    type: 'string',
    title: '分组标题',
  },
  groupDesc: {
    type: 'string',
    title: '分组说明（可选）',
  },
};

/**
 * 为 referenceImages 槽位的 items.properties 补全 groupKey/groupTitle/groupDesc，
 * 避免前端提交后 JSON Schema additionalProperties:false 校验失败。
 */
export function enrichReferenceImagesFormSchema(formSchema: JsonSchemaV2 | undefined): void {
  const props = formSchema?.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return;
  for (const field of Object.values(props)) {
    if (!field || typeof field !== 'object' || field['x-ui-type'] !== 'referenceImages') continue;
    const items = field.items as Record<string, unknown> | undefined;
    if (!items || typeof items !== 'object') continue;
    const itemProps = items.properties as Record<string, Record<string, unknown>> | undefined;
    if (!itemProps) continue;
    for (const [k, def] of Object.entries(REFERENCE_IMAGE_SLOT_ITEM_PROPERTIES)) {
      if (!itemProps[k]) itemProps[k] = def;
    }
  }
}

export function cloneFormSchemaWithReferenceImageEnrichment(
  formSchema: JsonSchemaV2 | undefined
): JsonSchemaV2 | undefined {
  if (!formSchema) return formSchema;
  const clone =
    typeof globalThis.structuredClone === 'function'
      ? (globalThis.structuredClone(formSchema) as JsonSchemaV2)
      : (JSON.parse(JSON.stringify(formSchema)) as JsonSchemaV2);
  enrichReferenceImagesFormSchema(clone);
  return clone;
}

/**
 * 将 JSON Schema `properties.*.default` 写入 params（仅当请求体未带该键）。
 * 用于宫格约束等配置驱动文案，避免在代码里硬编码。
 */
/** 判断是否为 referenceImages 槽位数组（含 content 的对象列表） */
export function isReferenceImagesSlotArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0];
  return !!first && typeof first === 'object' && 'content' in (first as object);
}

/**
 * Graph Task V2：与 task-engine 一致的参考图合并 / hydrate / 默认值（多份子任务共享预处理时使用）
 */
/** eshop/clothes 用 garment_images；与 photograph/taobaonvzhuang 的 clothing_images 兼容 */
const GARMENT_IMAGES_LEGACY_KEYS = ['clothing_images'] as const;

function normalizeGarmentImagesParamAliases(p: Record<string, any>): void {
  const props = p as Record<string, unknown>;
  const hasGarment = Object.prototype.hasOwnProperty.call(props, 'garment_images');
  if (!hasGarment) {
    for (const legacyKey of GARMENT_IMAGES_LEGACY_KEYS) {
      if (Array.isArray(props[legacyKey]) && (props[legacyKey] as unknown[]).length > 0) {
        p.garment_images = props[legacyKey];
        break;
      }
    }
  }
  const ref = Array.isArray(p.referenceImage) ? (p.referenceImage as any[]) : [];
  for (const row of ref) {
    if (!row || typeof row !== 'object') continue;
    const gk = String((row as { groupKey?: string }).groupKey || '').trim();
    if (gk === 'clothing_images') {
      (row as { groupKey: string }).groupKey = 'garment_images';
    }
  }
}

export function prepareGraphTaskParams(
  params: Record<string, unknown>,
  formSchema: { properties?: Record<string, unknown> } | undefined,
  opts?: { taskKey?: string; subtype?: string | null }
): Record<string, unknown> {
  const p = (
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(params)
      : (JSON.parse(JSON.stringify(params)) as Record<string, unknown>)
  ) as Record<string, any>;
  normalizeGarmentImagesParamAliases(p);
  if (Object.prototype.hasOwnProperty.call(p, PARALLEL_COUNT_KEY)) {
    p[PARALLEL_COUNT_KEY] = extractParallelCount(p);
  }
  if (!formSchema) return p;
  applyFormSchemaDefaults(p, formSchema);
  if (opts?.subtype && p.type === undefined && opts.taskKey !== 'design') {
    p.type = opts.subtype;
  }
  repairSanitizedReferenceSlots(p, formSchema);
  mergeGraphReferenceImageFromFormSlots(p, formSchema);
  hydrateGraphImageSlotParamsFromReferenceImage(p, formSchema);
  mergeGraphReferenceImageFromFormSlots(p, formSchema);
  applyFormSchemaDefaults(p, formSchema);
  return p;
}

export function applyFormSchemaDefaults(
  params: Record<string, any>,
  formSchema: { properties?: Record<string, unknown> } | undefined
): void {
  const props = formSchema?.properties as Record<string, any> | undefined;
  if (!props) return;
  for (const [key, sch] of Object.entries(props)) {
    if (Object.prototype.hasOwnProperty.call(params, key)) continue;
    if (!sch || typeof sch !== 'object') continue;
    if (!('default' in sch)) continue;
    const d = (sch as { default?: unknown }).default;
    if (d === undefined) continue;
    params[key] = d;
  }
}

/**
 * Worker 落库后槽位常为 sanitize 占位符，而 referenceImage 内可能仍保留 URL。
 * 按 groupKey 将可用参考图写回各槽位，避免 merge 时服饰/模特图丢失。
 */
export function repairSanitizedReferenceSlots(
  params: Record<string, any>,
  formSchema: { properties?: Record<string, unknown> } | undefined
): void {
  const ref = Array.isArray(params.referenceImage) ? (params.referenceImage as any[]) : [];
  const usableRef = ref.filter((r) => r && isUsableReferenceImageContent(r.content));
  if (usableRef.length === 0) return;

  const props = ((formSchema?.properties ?? {}) as Record<string, any>) ?? {};
  for (const [fieldKey, fieldSchema] of Object.entries(props)) {
    if (!fieldSchema || typeof fieldSchema !== 'object') continue;
    if (fieldSchema['x-ui-type'] !== 'referenceImages') continue;

    const arr = Array.isArray(params[fieldKey]) ? (params[fieldKey] as any[]) : [];
    const fromSlot = arr.filter((item) => item && isUsableReferenceImageContent(item.content));
    const fromRef = usableRef.filter((r) => {
      const gk = String(r.groupKey || '').trim();
      const t = String(r.type || '').trim();
      if (gk === fieldKey || t === fieldKey) return true;
      if (
        fieldKey === 'garment_images' &&
        (GARMENT_IMAGES_LEGACY_KEYS as readonly string[]).includes(gk)
      ) {
        return true;
      }
      return false;
    });

    if (fromSlot.length > 0) {
      params[fieldKey] = fromSlot;
      continue;
    }
    if (fromRef.length > 0) {
      params[fieldKey] = fromRef.map((r) => ({ ...r, groupKey: fieldKey }));
    }
  }
}

export function mergeGraphReferenceImageFromFormSlots(
  params: Record<string, any>,
  formSchema: { properties?: Record<string, unknown> } | undefined
): void {
  const p = params;
  const ref = p.referenceImage;
  const refEmpty =
    ref == null || (Array.isArray(ref) && ref.length === 0) || (typeof ref === 'string' && String(ref).trim() === '');

  const props = ((formSchema?.properties ?? {}) as Record<string, any>) ?? {};
  const merged: any[] = [];

  const pickSchemaType = (fieldSchema: any): string | undefined => {
    try {
      const d = fieldSchema?.items?.properties?.type?.default;
      if (typeof d === 'string' && d.trim()) return d.trim();
    } catch {
      // ignore
    }
    return undefined;
  };

  for (const [fieldKey, fieldSchema] of Object.entries(props)) {
    if (!fieldSchema || typeof fieldSchema !== 'object') continue;
    if (fieldSchema['x-ui-type'] !== 'referenceImages') continue;
    const arr = Array.isArray(p[fieldKey]) ? (p[fieldKey] as any[]) : [];
    if (arr.length === 0) continue;

    const groupTitle =
      typeof fieldSchema.title === 'string' && fieldSchema.title.trim() ? fieldSchema.title.trim() : fieldKey;
    const groupDesc =
      typeof fieldSchema.description === 'string' && fieldSchema.description.trim()
        ? fieldSchema.description.trim()
        : undefined;
    const schemaType = pickSchemaType(fieldSchema);

    const slotEnriched: any[] = [];

    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as any).content;
      if (!isUsableReferenceImageContent(content)) continue;
      const rawType =
        typeof (item as any).type === 'string' && (item as any).type.trim()
          ? String((item as any).type).trim()
          : '';
      // schema 有 items.properties.type.default 时优先；否则用槽位 fieldKey 压过客户端统一的 main-subject。
      const type = schemaType || fieldKey || rawType || 'main-subject';
      const purpose =
        typeof (item as any).purpose === 'string' && (item as any).purpose.trim()
          ? String((item as any).purpose).trim()
          : undefined;
      const enriched = {
        ...item,
        content: String(content).trim(),
        type,
        ...(purpose ? { purpose } : {}),
        groupKey: fieldKey,
        groupTitle,
        ...(groupDesc ? { groupDesc } : {}),
      };
      merged.push(enriched);
      slotEnriched.push(enriched);
    }

    // 回写富化后的元素到原始槽位，保证各 referenceImages 字段（如 ${model_images}）模板插值
    // 拿到正确的 type、groupKey、groupTitle、groupDesc 等元数据。
    if (slotEnriched.length > 0) {
      p[fieldKey] = slotEnriched;
    }
  }

  if (merged.length === 0) return;

  if (refEmpty || !Array.isArray(ref)) {
    p.referenceImage = merged;
    return;
  }

  // 槽位已合并出权威列表：始终以 merged 为准写回 referenceImage（带 groupKey/type 等元数据）。
  // 客户端常同时传「未富化的扁平 referenceImage + 分槽位数组」，若只追加不覆盖，落库与下游会一直是错的 type。
  const refArr: any[] = ref;
  const mergedContents = new Set<string>();
  for (const x of merged) {
    if (x && isUsableReferenceImageContent((x as { content?: unknown }).content)) {
      mergedContents.add(String((x as { content: string }).content).trim());
    }
  }
  const orphans: any[] = [];
  for (const row of refArr) {
    if (!row || typeof row !== 'object') continue;
    const c = (row as { content?: unknown }).content;
    if (!isUsableReferenceImageContent(c)) continue;
    const key = String(c).trim();
    if (!mergedContents.has(key)) {
      orphans.push(row);
      mergedContents.add(key);
    }
  }
  p.referenceImage = orphans.length > 0 ? [...merged, ...orphans] : merged;
}

/**
 * 按 formSchema 中 `x-ui-type: referenceImages` 字段在 `properties` 里的声明顺序，生成槽位 → 排序权重。
 * 与 `mergeGraphReferenceImageFromFormSlots` 遍历顺序一致，不写死具体业务字段名。
 */
export function buildReferenceImagesSlotOrderMap(
  formSchema: { properties?: Record<string, unknown> } | undefined
): Map<string, number> {
  const map = new Map<string, number>();
  const props = (formSchema?.properties ?? {}) as Record<string, unknown>;
  let order = 0;
  for (const [fieldKey, fieldSchema] of Object.entries(props)) {
    if (!fieldSchema || typeof fieldSchema !== 'object' || Array.isArray(fieldSchema)) continue;
    const fs = fieldSchema as Record<string, unknown>;
    if (fs['x-ui-type'] !== 'referenceImages') continue;
    map.set(fieldKey, order++);
  }
  return map;
}

/**
 * Atlas / OpenAI 类多图编辑：与表单槽位语义一致的稳定顺序。
 *
 * - **有 formSchema**：按 schema 中 referenceImages 槽位的声明顺序排列（动态业务）；同槽多张保持
 *   请求数组中的相对顺序（以 idx 为次关键字）。
 * - **无 formSchema**：不改变 refs 与 urls 的一一对应顺序（按原始 idx）。
 * - 上游若另有「主图」单字段（如仅 images[0] 同步到 image），只有排序后的**第一张**会当主图；
 *   其余张仍在 `images` 里，是否参与推理取决于 Atlas / gpt-image 能力，本函数不丢图。
 */
export function orderGraphReferenceImageUrlsForEdit(
  refs: Array<{ groupKey?: string; type?: string }>,
  urls: string[],
  formSchema?: { properties?: Record<string, unknown> }
): string[] {
  const n = Math.min(refs.length, urls.length);
  const pairs: { ref: { groupKey?: string; type?: string }; url: string; idx: number }[] = [];
  for (let i = 0; i < n; i++) {
    const url = urls[i];
    if (typeof url !== 'string' || !url.trim()) continue;
    pairs.push({ ref: refs[i] ?? {}, url: url.trim(), idx: i });
  }

  const slotOrder = buildReferenceImagesSlotOrderMap(formSchema);
  /** 无 schema 或 groupKey 不在 schema 槽位内时，排在所有「已知槽」之后，组内仍按 idx */
  const UNKNOWN_SLOT_BASE = 10_000;

  const slotRank = (ref: { groupKey?: string; type?: string }, idx: number): number => {
    if (slotOrder.size === 0) {
      return idx;
    }
    const gk = String(ref.groupKey || '').trim();
    if (gk && slotOrder.has(gk)) {
      return slotOrder.get(gk)!;
    }
    return UNKNOWN_SLOT_BASE + idx;
  };

  pairs.sort((a, b) => {
    const d = slotRank(a.ref, a.idx) - slotRank(b.ref, b.idx);
    if (d !== 0) return d;
    return a.idx - b.idx;
  });

  return pairs.map((p) => p.url);
}

/**
 * 若 schema 声明了 referenceImages 槽位但请求体未填槽位、只传了合并的 referenceImage，
 * 则按 groupKey（优先）或 type（兼容旧客户端）拆回各字段。
 *
 * 完全 schema 驱动：从 formSchema 动态发现所有 `x-ui-type=referenceImages` 槽位，
 * 不硬编码 model_images/clothing_images/environment_images。
 */
export function hydrateGraphImageSlotParamsFromReferenceImage(
  params: Record<string, any>,
  formSchema: { properties?: Record<string, unknown> } | undefined
): void {
  const props = (formSchema?.properties ?? {}) as Record<string, any>;

  // 1. 从 schema 动态发现所有 referenceImages 槽位及其元数据
  const slots: Array<{
    fieldKey: string;
    groupTitle: string;
    groupDesc?: string;
    schemaType?: string;
  }> = [];
  for (const [fieldKey, fieldSchema] of Object.entries(props)) {
    if (!fieldSchema || typeof fieldSchema !== 'object') continue;
    if (fieldSchema['x-ui-type'] !== 'referenceImages') continue;
    const title = typeof fieldSchema.title === 'string' && fieldSchema.title.trim()
      ? fieldSchema.title.trim() : fieldKey;
    const desc = typeof fieldSchema.description === 'string' && fieldSchema.description.trim()
      ? fieldSchema.description.trim() : undefined;
    let st: string | undefined;
    try {
      const d = fieldSchema?.items?.properties?.type?.default;
      if (typeof d === 'string' && d.trim()) st = d.trim();
    } catch { /* ignore */ }
    slots.push({ fieldKey, groupTitle: title, groupDesc: desc, schemaType: st });
  }
  if (slots.length === 0) return;

  // 2. 若各槽位已有「可用」参考图则跳过；仅有 sanitize 占位时仍从 referenceImage 回填
  const hasExistingUsable = slots.some((s) => {
    const arr = params[s.fieldKey];
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some(
      (item: unknown) =>
        item &&
        typeof item === 'object' &&
        isUsableReferenceImageContent((item as { content?: unknown }).content)
    );
  });
  if (hasExistingUsable) return;

  const ref = params.referenceImage;
  if (!Array.isArray(ref) || ref.length === 0) return;

  // 3. 构建 type → fieldKey 反查表（用于无 groupKey 的旧客户端兼容）
  const typeToSlot = new Map<string, string>();
  for (const s of slots) {
    if (s.schemaType && !typeToSlot.has(s.schemaType)) {
      typeToSlot.set(s.schemaType, s.fieldKey);
    }
    // fieldKey 本身也可作为 type 反查（新客户端可能用 fieldKey 作 type）
    if (!typeToSlot.has(s.fieldKey)) {
      typeToSlot.set(s.fieldKey, s.fieldKey);
    }
  }

  // 4. 按 groupKey（优先）或 type（兼容）分桶
  const buckets = new Map<string, any[]>();
  const slotKeys = new Set(slots.map((s) => s.fieldKey));
  for (const item of ref) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.content !== 'string' || !String(row.content).trim()) continue;

    const gk = String(row.groupKey || '').trim();
    const t = String(row.type || '').trim();

    let targetSlot: string | undefined;
    if (gk && slotKeys.has(gk)) {
      targetSlot = gk;
    } else if (t && typeToSlot.has(t)) {
      targetSlot = typeToSlot.get(t);
    } else {
      // 无法匹配：放入 schema 中第一个 referenceImages 槽位（兼容旧客户端）
      targetSlot = slots[0].fieldKey;
    }

    if (targetSlot) {
      if (!buckets.has(targetSlot)) buckets.set(targetSlot, []);
      buckets.get(targetSlot)!.push(item);
    }
  }

  // 5. 富化并写入各槽位（语义由 groupKey / groupTitle / groupDesc 承载，type 仅作兼容保留）
  for (const slot of slots) {
    const items = buckets.get(slot.fieldKey);
    if (!items || items.length === 0) continue;
    params[slot.fieldKey] = items.map((item: any) => {
      const rawType = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : '';
      return {
        ...item,
        groupKey: item.groupKey || slot.fieldKey,
        groupTitle: item.groupTitle || slot.groupTitle,
        ...(slot.groupDesc && !item.groupDesc ? { groupDesc: slot.groupDesc } : {}),
        type: slot.schemaType || slot.fieldKey || rawType || 'main-subject',
      };
    });
  }
}
