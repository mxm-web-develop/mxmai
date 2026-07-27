/**
 * 电商批量 Smartflow start.input[] — 与 formSchema 字段类型对齐（禁止用 json 代替业务类型）
 */

export type EshopBatchStartInputItem = {
  name: string;
  type: string;
  content: unknown;
};

/**
 * 电商批量标准 start.input[]（与 formSchema 对齐；无 _planning_images，运行期派生）
 * v1 / v2 工作流共用
 */
export const ESHOP_CLOTHES_BATCH_TYPED_START_INPUT: EshopBatchStartInputItem[] = [
  { name: 'model_images', type: 'referenceImages', content: [] },
  { name: 'garments', type: 'eshopGarmentBatch', content: [] },
  { name: 'model_participation', type: 'selection', content: 'default' },
  { name: 'output_grid', type: 'selection', content: '1x1' },
  { name: 'parallel_count', type: 'number', content: 1 },
  { name: 'shoot_preset_mode', type: 'selection', content: 'auto' },
  { name: 'shoot_preset_fixed', type: 'string', content: 'studio_soft_gray' },
  { name: 'shoot_preset_fallback', type: 'string', content: 'studio_soft_gray' },
  { name: 'garment_material_fallback', type: 'string', content: 'use_reference_only' },
  { name: 'style_images', type: 'referenceImages', content: [] },
  { name: 'environment_images', type: 'referenceImages', content: [] },
  { name: 'prompt', type: 'text', content: '' },
];

/** @deprecated 使用 ESHOP_CLOTHES_BATCH_TYPED_START_INPUT */
export const ESHOP_CLOTHES_BATCH_V2_START_INPUT = ESHOP_CLOTHES_BATCH_TYPED_START_INPUT;
