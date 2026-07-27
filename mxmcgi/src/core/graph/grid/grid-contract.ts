import { createHash } from 'node:crypto';

/** 生产维度：规划器与 directive 不得暗示改写 */
export const FUC_PRESERVE_KEYS = [
  'output_grid',
  'aspect_ratio',
  'scenes',
  'grid_cell_constraint_preset',
  'clothing_material',
  'environment_images',
  'model_images',
  'clothing_images',
  'product_images',
] as const;

export interface ParsedOutputGrid {
  outputGrid: string;
  gridN: number;
  totalCells: number;
}

export function parseOutputGrid(raw: unknown): ParsedOutputGrid | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const k = raw.trim().toLowerCase();
  const map: Record<string, number> = {
    '1x1': 1,
    '2x2': 2,
    '3x3': 3,
    '4x4': 4,
  };
  const gridN = map[k];
  if (!gridN) return null;
  return {
    outputGrid: k,
    gridN,
    totalCells: gridN * gridN,
  };
}

export function isMultiCellGrid(params: Record<string, unknown>): boolean {
  const p = parseOutputGrid(params.output_grid);
  return p != null && p.gridN > 1;
}

export function buildFrozenUserContract(params: Record<string, unknown>): Record<string, unknown> {
  const fuc: Record<string, unknown> = {};
  for (const key of FUC_PRESERVE_KEYS) {
    if (key in params && params[key] !== undefined && params[key] !== '') {
      fuc[key] = params[key];
    }
  }
  if (typeof params.prompt === 'string' && params.prompt.trim()) {
    fuc.prompt = params.prompt;
  }
  return fuc;
}

export function hashFrozenParams(fuc: Record<string, unknown>): string {
  const stable = JSON.stringify(fuc, Object.keys(fuc).sort());
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/** 场景 enum 与 directive 冲突检测（粗粒度关键词） */
const SCENE_CONFLICT_HINTS: Record<string, string[]> = {
  indoor_studio: ['outdoor', 'street', 'beach', 'sunset exterior', 'night city'],
  outdoor_street: ['white cyclorama', 'seamless white studio', 'indoor studio backdrop'],
  outdoor_beach: ['office interior', 'studio cyclorama', 'urban alley'],
};

export function assertDirectiveRespectsFuc(
  directiveEn: string,
  fuc: Record<string, unknown>
): { ok: boolean; reason?: string } {
  const d = directiveEn.toLowerCase();
  const scenes = typeof fuc.scenes === 'string' ? fuc.scenes.trim() : '';
  if (scenes && SCENE_CONFLICT_HINTS[scenes]) {
    for (const bad of SCENE_CONFLICT_HINTS[scenes]) {
      if (d.includes(bad.toLowerCase())) {
        return { ok: false, reason: `directive conflicts with frozen scenes=${scenes}` };
      }
    }
  }
  const ar = typeof fuc.aspect_ratio === 'string' ? fuc.aspect_ratio : '';
  const grid = typeof fuc.output_grid === 'string' ? fuc.output_grid : '';
  if (ar === '9:16' && /\b16\s*:\s*9\b|landscape\s+16/i.test(directiveEn)) {
    return { ok: false, reason: 'directive contradicts frozen aspect_ratio 9:16' };
  }
  if (ar === '16:9' && /\b9\s*:\s*16\b|tall\s+portrait\s+9/i.test(directiveEn)) {
    return { ok: false, reason: 'directive contradicts frozen aspect_ratio 16:9' };
  }
  if (grid && /\b3\s*x\s*3\b|nine[- ]?panel/i.test(d) && grid === '2x2') {
    return { ok: false, reason: 'directive contradicts frozen output_grid 2x2' };
  }
  return { ok: true };
}

export function readParallelIndex(params: Record<string, unknown>, metadata?: Record<string, unknown>): number {
  if (typeof metadata?.parallelIndex === 'number' && metadata.parallelIndex >= 0) {
    return metadata.parallelIndex;
  }
  const fromParams = params.parallel_index;
  if (typeof fromParams === 'number' && fromParams >= 0) return Math.floor(fromParams);
  if (typeof fromParams === 'string') {
    const n = Number(fromParams);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}
