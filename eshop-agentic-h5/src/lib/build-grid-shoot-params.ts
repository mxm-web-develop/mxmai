import type { JsonSchema, PublishedApiManifest } from '@/adapters/types';
import { resolveEnumOptions } from '@/lib/enum-display';
import type { GridShootLine } from '@/catalog/grid-shoot-lines';
import {
  type OutputGridLayout,
  isOutputGridLayout,
} from '@/lib/output-grid';
import type { StartDraftImage } from '@/lib/start-draft';

function buildFullDefaults(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  for (const [key, def] of Object.entries(props)) {
    if (def.default !== undefined) {
      out[key] = def.default;
    } else if (def.type === 'array') {
      out[key] = [];
    } else if (def.type === 'boolean') {
      out[key] = false;
    } else if (def.type === 'number' || def.type === 'integer') {
      out[key] = def.minimum ?? 1;
    }
  }
  if (!('parallel_count' in out)) out.parallel_count = 1;
  return out;
}

/**
 * unifiedTemplate 依赖的隐藏字段（x-user-visible: false），开放 API manifest 可能未下发，须补默认
 */
function applyEshopHiddenGridParams(
  params: Record<string, unknown>,
  manifest: PublishedApiManifest,
  outputGrid: OutputGridLayout
): void {
  const props = manifest.inputSchema.properties ?? {};

  if (params.grid_cell_constraint_preset === undefined) {
    const def = props.grid_cell_constraint_preset?.default;
    params.grid_cell_constraint_preset =
      def ?? (outputGrid === '1x1' ? 'none' : 'strict_seamless');
  }

  if (params.aspect_ratio === undefined) {
    const def = props.aspect_ratio?.default;
    params.aspect_ratio = def ?? (outputGrid === '1x1' ? '3:4' : '1:1');
  }
}

export type GridShootSubmitOptions = {
  images: StartDraftImage[];
  outputGrid: OutputGridLayout;
  parallelCount: 1 | 2 | 3;
  shootPreset?: string;
  /** 展示方式：default 模特穿拍 / no_model 无模特挂拍平铺 */
  modelParticipation?: string;
  prompt?: string;
};

/**
 * 围绕 Open API：output_grid 1×1/2×2/3×3 + parallel_count 1～3
 */
export function buildGridShootParams(
  line: GridShootLine,
  manifest: PublishedApiManifest,
  opts: GridShootSubmitOptions
): Record<string, unknown> {
  const refs = opts.images.map((img) => ({
    content: img.content,
    type: img.type === 'outfits' ? 'outfits' : 'main-subject',
  }));

  const params = buildFullDefaults(manifest.inputSchema);
  params[line.productField] = refs.length ? refs : [];
  params.output_grid = opts.outputGrid;
  params.parallel_count = opts.parallelCount;
  applyEshopHiddenGridParams(params, manifest, opts.outputGrid);

  if (opts.shootPreset) params.shoot_preset = opts.shootPreset;
  if (opts.modelParticipation) params.model_participation = opts.modelParticipation;
  if (opts.prompt?.trim()) params.prompt = opts.prompt.trim();

  if (line.productField === 'garment_images') {
    if (params.model_participation === 'no_model' || !params.model_images) {
      params.model_images = [];
    }
  }

  return params;
}

/** 从 manifest 提取 output_grid（默认 3×3） */
export function getOutputGridOptions(
  manifest: PublishedApiManifest
): OutputGridLayout[] {
  const def = manifest.inputSchema.properties?.output_grid;
  const allowed: OutputGridLayout[] = ['1x1', '2x2', '3x3'];
  if (!def?.enum?.length) return allowed;
  return def.enum.filter((v): v is OutputGridLayout => isOutputGridLayout(v));
}

export function resolveDefaultOutputGrid(manifest: PublishedApiManifest): OutputGridLayout {
  const options = getOutputGridOptions(manifest);
  const raw = String(manifest.inputSchema.properties?.output_grid?.default ?? '');
  if (isOutputGridLayout(raw) && options.includes(raw)) return raw;
  if (options.includes('3x3')) return '3x3';
  return options[0] ?? '3x3';
}

/** 从 manifest 提取展示方式 model_participation（女装/男装等） */
export function getModelParticipationOptions(
  manifest: PublishedApiManifest
): Array<{ value: string; label: string; description?: string }> {
  const def = manifest.inputSchema.properties?.model_participation;
  if (!def?.enum?.length) return [];
  return resolveEnumOptions(def, {
    fieldKey: 'model_participation',
    fieldHints: manifest.inputDoc?.fieldHints,
  });
}

export function resolveDefaultModelParticipation(manifest: PublishedApiManifest): string {
  const options = getModelParticipationOptions(manifest);
  const raw = String(manifest.inputSchema.properties?.model_participation?.default ?? '');
  if (options.some((o) => o.value === raw)) return raw;
  return options[0]?.value ?? 'default';
}

/** 从 manifest 提取可选拍摄场景（若有 shoot_preset） */
export function getShootPresetOptions(
  manifest: PublishedApiManifest
): Array<{ value: string; label: string }> {
  const def = manifest.inputSchema.properties?.shoot_preset;
  if (!def?.enum?.length) return [];
  return resolveEnumOptions(def, {
    fieldKey: 'shoot_preset',
    fieldHints: manifest.inputDoc?.fieldHints,
  });
}
