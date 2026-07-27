/**
 * 分镜 scriptType（writing）→ video Task V2 taskKey 映射。
 * 与 docs/BUSINESS_INTERFACE_SPEC.md 中 video-* 业务命名对齐。
 */
const SCRIPT_TYPE_TO_VIDEO_TASK_KEY: Record<string, string> = {
  'short-video-storyboard': 'short',
  'movie-storyboard': 'movie',
  'animation-storyboard': 'animation',
  'music-video-storyboard': 'music-video',
  'commercial-storyboard': 'commercial',
  'documentary-storyboard': 'documentary',
  'motion-graphics-storyboard': 'motion-graphics',
  'educational-storyboard': 'educational',
  'game-cg-storyboard': 'game-cg',
};

/** 未传 taskKey / scriptType 时的默认视频业务 */
export const DEFAULT_VIDEO_TASK_KEY = 'short';

export function resolveVideoTaskKeyFromScriptType(scriptType?: string | null): string | undefined {
  if (!scriptType || typeof scriptType !== 'string') return undefined;
  const key = SCRIPT_TYPE_TO_VIDEO_TASK_KEY[scriptType.trim()];
  return key || undefined;
}

export function resolveVideoTaskKey(input: {
  taskKey?: string | null;
  scriptType?: string | null;
}): string {
  const fromBody = input.taskKey?.trim();
  if (fromBody) return fromBody;
  const fromScript = resolveVideoTaskKeyFromScriptType(input.scriptType);
  if (fromScript) return fromScript;
  return DEFAULT_VIDEO_TASK_KEY;
}
