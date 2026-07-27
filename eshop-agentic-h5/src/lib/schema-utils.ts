'use client';

import type { JsonSchema, JsonSchemaProperty } from '@/adapters/types';

export type SchemaFormValue = Record<string, unknown>;

export function isUserVisible(def: JsonSchemaProperty): boolean {
  return def['x-user-visible'] !== false;
}

export function buildDefaultsFromSchema(schema: JsonSchema): SchemaFormValue {
  const out: SchemaFormValue = {};
  const props = schema.properties ?? {};
  for (const [key, def] of Object.entries(props)) {
    if (!isUserVisible(def)) continue;
    const ui = def['x-ui-type'];
    if (ui === 'referenceImages' || ui === 'eshopGarmentBatch') {
      out[key] = [];
    } else if (ui === 'gridStoryboardImages' && def.default && typeof def.default === 'object') {
      out[key] = { ...(def.default as object) };
    } else if (def.default !== undefined) {
      out[key] = def.default;
    } else if (def.type === 'number' || def.type === 'integer') {
      out[key] = def.minimum ?? 0;
    } else if (def.type === 'boolean') {
      out[key] = false;
    } else if (def.type === 'string') {
      out[key] = '';
    }
  }
  return out;
}

export function getVisibleSchemaFields(
  schema: JsonSchema
): Array<{ key: string; def: JsonSchemaProperty }> {
  const props = schema.properties ?? {};
  return Object.entries(props)
    .filter(([, def]) => isUserVisible(def))
    .map(([key, def]) => ({ key, def }));
}

export type FormSection = {
  id: string;
  title: string;
  subtitle?: string;
  fieldKeys: string[];
};

const UPLOAD_UI = new Set(['referenceImages', 'eshopGarmentBatch', 'gridStoryboardImages', 'image']);

export function buildFormSections(schema: JsonSchema): FormSection[] {
  const fields = getVisibleSchemaFields(schema);
  const uploads = fields.filter((f) => UPLOAD_UI.has(f.def['x-ui-type'] ?? ''));
  const settings = fields.filter((f) => !UPLOAD_UI.has(f.def['x-ui-type'] ?? ''));

  const sections: FormSection[] = [];
  if (uploads.length) {
    sections.push({
      id: 'uploads',
      title: '参考素材',
      subtitle: '支持相册选择与现场拍摄，大图将自动压缩',
      fieldKeys: uploads.map((f) => f.key),
    });
  }
  if (settings.length) {
    sections.push({
      id: 'settings',
      title: '拍摄与输出',
      fieldKeys: settings.map((f) => f.key),
    });
  }
  if (!sections.length) {
    sections.push({ id: 'all', title: '参数', fieldKeys: fields.map((f) => f.key) });
  }
  return sections;
}

/** Smartflow 电商批量：维护 _planning_images 与默认 SKU 行 */
export function syncEshopBatchDerivedFields(value: SchemaFormValue): SchemaFormValue {
  const next = { ...value };
  const garments = Array.isArray(next.garments) ? [...next.garments] : [];
  if (garments.length === 0) {
    next.garments = [{ label: 'SKU-1', images: [] }];
  }
  const modelImages = Array.isArray(next.model_images) ? next.model_images : [];
  if (next.parallel_count == null || next.parallel_count === '') {
    next.parallel_count = 1;
  }
  const planning: Array<{ content: string; type: string; purpose?: string }> = [];
  for (const row of modelImages) {
    if (row && typeof row === 'object' && typeof (row as { content?: string }).content === 'string') {
      const c = (row as { content: string }).content.trim();
      if (c) planning.push(row as { content: string; type: string; purpose?: string });
    }
  }
  for (const garment of garments) {
    if (!garment || typeof garment !== 'object') continue;
    const images = (garment as { images?: unknown }).images;
    if (Array.isArray(images) && images[0] && typeof images[0] === 'object') {
      const img = images[0] as { content?: string; type?: string };
      if (typeof img.content === 'string' && img.content.trim()) {
        planning.push({ content: img.content, type: img.type || 'outfits' });
      }
    }
  }
  next._planning_images = planning;
  return next;
}

export function hasEshopGarmentBatch(schema: JsonSchema): boolean {
  return schema.properties?.garments?.['x-ui-type'] === 'eshopGarmentBatch';
}

export function validateRequired(schema: JsonSchema, values: SchemaFormValue): string | null {
  const required = schema.required ?? [];
  for (const key of required) {
    const def = schema.properties?.[key];
    if (def && !isUserVisible(def)) continue;
    const v = values[key];
    if (v == null || v === '') return `请填写：${def?.title ?? key}`;
    if (Array.isArray(v) && v.length === 0) return `请上传：${def?.title ?? key}`;
    if (def?.['x-ui-type'] === 'referenceImages') {
      const filled = (v as unknown[]).filter(
        (r) => r && typeof r === 'object' && String((r as { content?: string }).content ?? '').trim()
      );
      const min = def.minItems ?? 1;
      if (filled.length < min) return `请至少上传 ${min} 张：${def.title ?? key}`;
    }
  }
  return null;
}
