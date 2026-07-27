/**
 * 从 formSchema grid_cell_constraint_preset.x-enum-prompt-append 解析英文 seam 条款
 */

export function resolveGridSeamAppendEn(args: {
  formSchema?: { properties?: Record<string, unknown> };
  presetValue: unknown;
  gridN: number;
  totalCells: number;
}): string {
  const { presetValue, gridN, totalCells } = args;
  if (presetValue == null || presetValue === 'none') return '';

  const appendMap = findEnumPromptAppendMap(args.formSchema);
  if (!appendMap) return '';

  const key = String(presetValue).trim();
  const template = appendMap[key];
  if (typeof template !== 'string' || !template.trim()) return '';

  return template
    .replace(/\$\{grid_n\}/gi, String(gridN))
    .replace(/\$\{total_cells\}/gi, String(totalCells))
    .trim();
}

function findEnumPromptAppendMap(
  formSchema?: { properties?: Record<string, unknown> }
): Record<string, string> | null {
  const props = formSchema?.properties as Record<string, Record<string, unknown>> | undefined;
  const field = props?.grid_cell_constraint_preset;
  if (!field) return null;
  const append = field['x-enum-prompt-append'];
  if (!append || typeof append !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(append)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
