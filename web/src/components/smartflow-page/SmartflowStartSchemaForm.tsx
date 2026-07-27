import { useCallback } from 'react';
import { SchemaForm, type SchemaFormValue } from '../SchemaForm';
import type { TaskFormConfig } from '../../api/client';

type Props = {
  schema: TaskFormConfig['schema'];
  uiSchema?: TaskFormConfig['uiSchema'];
  value: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
};

export function hasEshopGarmentBatchUi(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const props = (schema as { properties?: Record<string, Record<string, unknown>> }).properties;
  return props?.garments?.['x-ui-type'] === 'eshopGarmentBatch';
}

/** 电商批量：至少保留一行 SKU 表单，并维护规划用参考图 _planning_images */
export function syncEshopBatchDerivedFields(value: SchemaFormValue): SchemaFormValue {
  const next = { ...value };
  const garments = Array.isArray(next.garments) ? [...next.garments] : [];
  if (garments.length === 0) {
    next.garments = [{ label: 'SKU-1', images: [] }];
  }
  const modelImages = Array.isArray(next.model_images) ? next.model_images : [];
  next.model_images = modelImages;
  if (next.parallel_count == null || next.parallel_count === '') {
    next.parallel_count = 1;
  }
  const planning: Array<{ content: string; type: string; purpose?: string }> = [];
  for (const row of modelImages) {
    if (row && typeof row === 'object' && typeof (row as { content?: string }).content === 'string') {
      planning.push(row as { content: string; type: string; purpose?: string });
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

export function extractStartFormConfig(startNode: unknown): {
  schema: TaskFormConfig['schema'] | null;
  uiSchema: TaskFormConfig['uiSchema'] | null;
} {
  if (!startNode || typeof startNode !== 'object') {
    return { schema: null, uiSchema: null };
  }
  const sn = startNode as { formSchema?: TaskFormConfig['schema']; uiSchema?: TaskFormConfig['uiSchema'] };
  const schema =
    sn.formSchema && typeof sn.formSchema === 'object' && sn.formSchema.properties
      ? sn.formSchema
      : null;
  const uiSchema = sn.uiSchema && typeof sn.uiSchema === 'object' ? sn.uiSchema : null;
  return { schema, uiSchema };
}

/** Smartflow start 节点 formSchema → 与 Task V2 相同的 SchemaForm 渲染 */
export function SmartflowStartSchemaForm({ schema, uiSchema, value, onChange }: Props) {
  const needsDerived = hasEshopGarmentBatchUi(schema);

  const handleChange = useCallback(
    (next: SchemaFormValue) => {
      onChange(needsDerived ? syncEshopBatchDerivedFields(next) : next);
    },
    [needsDerived, onChange]
  );

  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return null;
  }
  return (
    <SchemaForm
      schema={schema}
      uiSchema={uiSchema ?? undefined}
      value={needsDerived ? syncEshopBatchDerivedFields(value) : value}
      onChange={handleChange}
      hydrateDefaults
    />
  );
}
