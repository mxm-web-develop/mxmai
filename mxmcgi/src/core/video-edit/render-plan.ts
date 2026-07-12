import type { MxmRenderMode } from './types';
import { ACTIVE_RENDER_MODES, normalizeMxmRenderMode } from './render-mode';

export type RenderPlanInput = string | string[] | undefined;

const ALL_MODES: MxmRenderMode[] = [...ACTIVE_RENDER_MODES];

const LEGACY_PLAN_ALIASES: Record<string, MxmRenderMode> = {
  'gsap-only': 'static-image',
  'gsap-html-animation': 'static-image',
  'static-image-only': 'static-image',
  'ai-only': 'ai-video-gen',
  'material-only': 'static-image',
  'hybrid-balanced': 'static-image', // 特殊：见 normalize
};

/** 表单 / 管线：归一化为两种活跃 mxmRenderMode */
export function normalizeRenderPlanInput(input: unknown): MxmRenderMode[] {
  const modes: MxmRenderMode[] = [];

  const push = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (t === 'hybrid-balanced') return;
    if (LEGACY_PLAN_ALIASES[t]) {
      modes.push(LEGACY_PLAN_ALIASES[t]!);
      return;
    }
    const normalized = normalizeMxmRenderMode(t);
    if (ALL_MODES.includes(normalized)) {
      modes.push(normalized);
    }
  };

  if (input == null || input === '') {
    return [...ALL_MODES];
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') push(item);
    }
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        return normalizeRenderPlanInput(JSON.parse(trimmed) as unknown);
      } catch {
        /* fall through */
      }
    }
    if (trimmed === 'hybrid-balanced') {
      return [...ALL_MODES];
    }
    push(trimmed);
  }

  const uniq = [...new Set(modes)];
  return uniq.length > 0 ? uniq : [...ALL_MODES];
}

/** 无 LLM 指定 mxmRenderMode 时，按用户勾选方案轮替分配 */
export function resolveRenderModeFromPlan(
  renderPlan: RenderPlanInput,
  index: number,
  _total: number
): MxmRenderMode {
  const modes = normalizeRenderPlanInput(renderPlan);
  if (modes.length === 1) return modes[0]!;
  return modes[index % modes.length]!;
}

export const RENDER_PLAN_FORM_SCHEMA = {
  type: 'array',
  title: '剪辑方案',
  description:
    '可多选：素材引入（图库/视频库）与 AI 生成（文生/图生/参考生视频）。多选时各镜在选中方案间分配。文字/转场等动效由 OpenReel overlay 轨叠加，不在此选择。',
  minItems: 1,
  uniqueItems: true,
  items: {
    type: 'string',
    enum: ALL_MODES,
  },
  'x-enum-labels': ['素材引入', 'AI 生成'],
  default: [...ALL_MODES],
  'x-user-visible': true,
} as const;
