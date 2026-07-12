import type { MxmRenderMode } from './types';

/** 用户可见的两种分镜画面类型 */
export const ACTIVE_RENDER_MODES: MxmRenderMode[] = ['static-image', 'ai-video-gen'];

export const RENDER_MODE_USER_LABEL: Record<MxmRenderMode, string> = {
  'static-image': '素材引入',
  'ai-video-gen': 'AI 生成',
  'gsap-html-animation': '素材引入', // 遗留：等同素材 + overlay
};

/** 将分镜/旧脚本中的 mxmRenderMode 归一为两种活跃模式 */
export function normalizeMxmRenderMode(raw?: string | null): MxmRenderMode {
  const mode = raw?.trim();
  if (mode === 'ai-video-gen') return 'ai-video-gen';
  if (mode === 'gsap-html-animation') return 'static-image';
  return 'static-image';
}

export function isLegacyGsapRenderMode(raw?: string | null): boolean {
  return raw?.trim() === 'gsap-html-animation';
}
