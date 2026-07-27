'use client';

import type { JsonSchemaProperty, PublishedApiManifest } from '@/adapters/types';
import { OUTPUT_GRID_LABELS } from '@/lib/output-grid';

/** H5 表单：常见 enum 值 → 中文（API 未下发标签时的兜底，勿把参数 key 直接展示给用户） */
const H5_ENUM_LABELS: Record<string, string> = {
  // 展示方式
  default: '模特穿拍',
  no_model: '无模特挂拍/平铺',
  face_hidden: '去模特身份',
  // 宫格
  '1x1': OUTPUT_GRID_LABELS['1x1'],
  '2x2': OUTPUT_GRID_LABELS['2x2'],
  '3x3': OUTPUT_GRID_LABELS['3x3'],
  // 女装拍摄侧重点
  silhouette_drape: '轮廓与垂坠',
  waist_hemline: '腰线与裙裤长',
  neckline_sleeve: '领口与袖型',
  fabric_flow: '面料流动感',
  full_lookbook: '全身 lookbook',
  // 场景模式
  auto: '智能按款识别',
  fixed: '全部固定场景',
  per_garment: '按款分别设置',
  // 视频动效
  gentle_turn: '轻微摆动',
  walk_forward: '向前走动',
  turn_showcase: '转身展示',
  // 拍摄场景（女装 graph/eshop/clothes-women 等）
  studio_soft_gray: '室内 · 浅灰渐变棚',
  studio_warm_beige: '室内 · 暖米杏色棚',
  studio_pastel_backdrop: '室内 · 马卡龙色背景纸',
  studio_window_side_light: '室内 · 落地窗侧光棚',
  indoor_cafe_window: '室内 · 咖啡馆临窗',
  indoor_marble_vanity: '室内 · 大理石梳妆台',
  beach_golden_sunset: '海边 · 日落金色海滩',
  resort_poolside: '海边 · 度假村泳池畔',
  nature_meadow_park: '自然 · 公园草坪',
  urban_rooftop_golden: '城市 · 屋顶天际线黄昏',
  urban_street_day: '城市 · 日景商业街',
  studio_pure_white: '室内 · 纯白无缝棚',
  studio_gray_gradient: '室内 · 浅灰渐变棚',
  studio_cement_industrial: '室内 · 清水泥工业棚',
  studio_corner_two_tone: '室内 · 双色墙角布景',
  studio_minimal_loft: '室内 · 极简 Loft',
  urban_subway_depth: '城市 · 地铁车站纵深',
  urban_glass_reflection: '城市 · 玻璃幕墙倒影',
  urban_street_daytime: '城市 · 日景商业街',
  nature_forest_edge: '自然 · 林缘斑驳光',
  studio_macaron_backdrop: '室内 · 马卡龙色背景纸',
  nature_soft_daylight: '自然 · 柔和日光',
  nature_lawn_park: '自然 · 公园草坪',
  // 材质等
  from_reference: '以参考图为准',
  cotton: '纯棉',
  none: '无',
  strict_seamless: '无缝拼格',
};

type EnumLabelsRaw = string[] | Record<string, string> | undefined;

/** 解析 inputDoc.fieldHints 中 "0: 标签A; 1: 标签B" 格式 */
export function parseIndexedFieldHints(hint: string): string[] {
  if (!hint.trim()) return [];
  return hint
    .split(';')
    .map((part) => {
      const m = part.trim().match(/^\d+\s*:\s*(.+)$/);
      return (m?.[1] ?? part).trim();
    })
    .filter(Boolean);
}

/** 从 x-enum-descriptions 长文案提取短标签（优先 【分类】摘要） */
export function shortLabelFromEnumDescription(desc: string): string {
  const tagged = desc.match(/^【([^】]+)】([^，。；\n]+)/);
  if (tagged) return `${tagged[1]} · ${tagged[2].trim()}`;
  const first = desc.split(/[，。；]/)[0]?.trim() ?? '';
  if (first.length > 0 && first.length <= 28) return first;
  if (first.length > 28) return `${first.slice(0, 26)}…`;
  return desc.slice(0, 28);
}

function labelFromEnumLabelsRaw(raw: EnumLabelsRaw, value: string, index: number): string | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[index]?.trim() || undefined;
  if (typeof raw === 'object') return raw[value]?.trim() || undefined;
  return undefined;
}

export function resolveEnumLabel(
  def: JsonSchemaProperty,
  value: string,
  index: number,
  opts?: { fieldKey?: string; fieldHints?: Record<string, string> }
): string {
  const fromLabels = labelFromEnumLabelsRaw(
    def['x-enum-labels'] as EnumLabelsRaw,
    value,
    index
  );
  if (fromLabels) return fromLabels;

  if (def.enumNames?.[index]?.trim()) return def.enumNames[index].trim();

  const fieldKey = opts?.fieldKey;
  const hints = opts?.fieldHints;
  if (fieldKey && hints?.[fieldKey]) {
    const parsed = parseIndexedFieldHints(hints[fieldKey]);
    if (parsed[index]) return parsed[index];
  }

  const desc = def['x-enum-descriptions']?.[value];
  if (desc) return shortLabelFromEnumDescription(desc);

  if (H5_ENUM_LABELS[value]) return H5_ENUM_LABELS[value];

  return `选项 ${index + 1}`;
}

export function resolveEnumOptions(
  def: JsonSchemaProperty,
  opts?: { fieldKey?: string; fieldHints?: Record<string, string> }
): Array<{ value: string; label: string; description?: string }> {
  const enumValues = def.enum ?? [];
  const descriptions = (def['x-enum-descriptions'] ?? {}) as Record<string, string>;
  return enumValues.map((value, index) => ({
    value,
    label: resolveEnumLabel(def, value, index, opts),
    description: descriptions[value],
  }));
}

/** 为 schema 字段写入 x-enum-labels 数组，供 SelectionField 等直接消费 */
export function normalizePropertyEnumLabels(
  def: JsonSchemaProperty,
  fieldKey: string,
  fieldHints?: Record<string, string>
): JsonSchemaProperty {
  if (!def.enum?.length) return def;
  const labels = def.enum.map((value, index) =>
    resolveEnumLabel(def, value, index, { fieldKey, fieldHints })
  );
  return { ...def, 'x-enum-labels': labels };
}

/** 整份 manifest 的 enum 字段统一中文化（H5 专用） */
export function normalizeManifestForH5Ui(manifest: PublishedApiManifest): PublishedApiManifest {
  const fieldHints = manifest.inputDoc?.fieldHints;
  const props = manifest.inputSchema.properties ?? {};
  const next: Record<string, JsonSchemaProperty> = {};
  for (const [key, def] of Object.entries(props)) {
    next[key] = normalizePropertyEnumLabels(def, key, fieldHints);
  }
  return {
    ...manifest,
    inputSchema: { ...manifest.inputSchema, properties: next },
  };
}

export function getManifestFieldHints(manifest: PublishedApiManifest): Record<string, string> {
  return manifest.inputDoc?.fieldHints ?? {};
}
