/**
 * 电商服装批量 Smartflow：运行前规范化 input_data（与 web SmartflowStartSchemaForm 一致）
 */

export function hasEshopGarmentBatchFormSchema(formSchema: unknown): boolean {
  if (!formSchema || typeof formSchema !== 'object') return false;
  const props = (formSchema as { properties?: Record<string, Record<string, unknown>> }).properties;
  return props?.garments?.['x-ui-type'] === 'eshopGarmentBatch';
}

/** 由 model_images + 各 SKU 首图组装规划参考图（供 plan_garments） */
export function buildPlanningImages(input: Record<string, unknown>): Array<{ content: string; type: string; purpose?: string }> {
  const planning: Array<{ content: string; type: string; purpose?: string }> = [];
  const modelImages = Array.isArray(input.model_images) ? input.model_images : [];
  for (const row of modelImages) {
    if (row && typeof row === 'object' && typeof (row as { content?: string }).content === 'string') {
      const c = (row as { content: string }).content.trim();
      if (c) planning.push(row as { content: string; type: string; purpose?: string });
    }
  }
  const garments = Array.isArray(input.garments) ? input.garments : [];
  for (const garment of garments) {
    if (!garment || typeof garment !== 'object') continue;
    const images = (garment as { images?: unknown }).images;
    if (Array.isArray(images) && images[0] && typeof images[0] === 'object') {
      const img = images[0] as { content?: string; type?: string };
      if (typeof img.content === 'string' && img.content.trim()) {
        planning.push({ content: img.content.trim(), type: img.type || 'outfits' });
      }
    }
  }
  return planning;
}

export function normalizeEshopBatchInputData(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input };
  const garments = Array.isArray(next.garments) ? [...next.garments] : [];
  if (garments.length === 0) {
    next.garments = [{ label: 'SKU-1', images: [] }];
  } else {
    next.garments = garments;
  }
  if (next.parallel_count == null || next.parallel_count === '') {
    next.parallel_count = 1;
  }
  if (typeof next.parallel_count === 'string') {
    const n = parseInt(String(next.parallel_count), 10);
    if (Number.isFinite(n) && n > 0) next.parallel_count = n;
  }
  next._planning_images = buildPlanningImages(next);
  return next;
}
