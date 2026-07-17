/**
 * Provider 物理模型模态（输入/输出能力）归一化工具
 *
 * 背景：
 *   provider_models.capabilities 是 JSONB 自由结构，老 seed 写入的是嵌套对象：
 *     { input: { text: true, image: true, ... }, output: { ... } }
 *   本次新引入"拍平数组"形态（与 AtlasCloud 官方 *-to-* 归类对齐）：
 *     { supported_inputs: ['text', 'image', 'video', 'audio'],
 *       supported_outputs: ['video', 'audio'],
 *       modes: ['text-to-video', 'reference-to-video'] }
 *
 *   双写并存：seed 同步写入两套；运行时优先读新字段，回退旧字段。Admin 表单可双向编辑。
 *
 * 6 个枚举值（与 AtlasCloud 官方对齐）：
 *   text / image / audio / video / 3d / embed
 */

export type Modality =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | '3d'
  | 'embed';

export const ALL_MODALITIES: readonly Modality[] = [
  'text',
  'image',
  'audio',
  'video',
  '3d',
  'embed',
] as const;

/** Admin UI 展示用的中文标签 */
export const MODALITY_LABELS: Record<Modality, string> = {
  text: '文本',
  image: '图片',
  audio: '语音/音频',
  video: '视频',
  '3d': '3D 模型',
  embed: '向量（embedding）',
};

/** Modality 解析白名单（防止 Admin 误填） */
const VALID = new Set<string>(ALL_MODALITIES);

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim());
}

function coerceBoolMap(v: unknown): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val === true)
    .map(([k]) => String(k).trim());
}

/**
 * 从 capabilities JSONB 解析"支持的输入模态"。
 * 优先读新字段 supported_inputs[]，回退到老嵌套 input{...}。
 */
export function getSupportedInputs(capabilities: unknown): Modality[] {
  const caps =
    capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
      ? (capabilities as Record<string, unknown>)
      : null;
  if (!caps) return [];

  const arr = coerceStringArray(caps.supported_inputs);
  if (arr.length > 0) return arr.filter((m): m is Modality => VALID.has(m));

  const legacy = coerceBoolMap(caps.input);
  return legacy.filter((m): m is Modality => VALID.has(m));
}

/**
 * 从 capabilities JSONB 解析"支持的输出模态"。
 * 优先读新字段 supported_outputs[]，回退到老嵌套 output{...}。
 */
export function getSupportedOutputs(capabilities: unknown): Modality[] {
  const caps =
    capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
      ? (capabilities as Record<string, unknown>)
      : null;
  if (!caps) return [];

  const arr = coerceStringArray(caps.supported_outputs);
  if (arr.length > 0) return arr.filter((m): m is Modality => VALID.has(m));

  const legacy = coerceBoolMap(caps.output);
  return legacy.filter((m): m is Modality => VALID.has(m));
}

/**
 * 从 capabilities JSONB 解析"模型支持的 *-to-* 模式"（atlascloud 风格）：
 *   text-to-image / image-to-video / reference-to-video / embedding / chat ...
 * 旧 seed 未写则返回空数组。
 */
export function getProviderModes(capabilities: unknown): string[] {
  const caps =
    capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
      ? (capabilities as Record<string, unknown>)
      : null;
  if (!caps) return [];
  return coerceStringArray(caps.modes);
}

/**
 * 把 {input:{text:true},output:{image:true}} 转换为拍平数组。
 * 用于老 seed 数据无 supported_inputs/outputs 时生成补全。
 */
export function legacyToFlatModality(
  input: Record<string, boolean> | null | undefined,
  output: Record<string, boolean> | null | undefined,
): { supported_inputs: Modality[]; supported_outputs: Modality[] } {
  return {
    supported_inputs: coerceBoolMap(input).filter((m): m is Modality => VALID.has(m)),
    supported_outputs: coerceBoolMap(output).filter((m): m is Modality => VALID.has(m)),
  };
}

/**
 * 校验给定的模态数组：去空、去重、过滤白名单外值。
 */
export function normalizeModalityList(arr: string[] | null | undefined): Modality[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<Modality>();
  const out: Modality[] = [];
  for (const raw of arr) {
    const m = String(raw).trim();
    if (!VALID.has(m)) continue;
    if (seen.has(m as Modality)) continue;
    seen.add(m as Modality);
    out.push(m as Modality);
  }
  return out;
}
