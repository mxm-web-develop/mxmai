/**
 * Core Skill 垂直切片名单（首波强制 skillMode）
 * key = `${scope}/${type|taskKey}/${subtype}` — writing/audio 用 taskKey；text 用 type
 */

export type SkillSliceKey = {
  scope: string;
  /** writing/audio/music/video: taskKey；text: type (expert/transform/…) */
  kind: string;
  subtype: string;
};

/** 宿主业务 */
export const CORE_SKILL_HOST_SLICES: SkillSliceKey[] = [
  { scope: 'writing', kind: 'generator', subtype: 'industry-daily' },
  { scope: 'writing', kind: 'group', subtype: 'deck' },
  { scope: 'writing', kind: 'generator', subtype: 'topic-article' },
  { scope: 'audio', kind: 'generator', subtype: 'voice-over-test' },
  { scope: 'audio', kind: 'group', subtype: 'multi-voice' },
];

/** 相关 text 子业务 */
export const CORE_SKILL_TEXT_SLICES: SkillSliceKey[] = [
  // industry-daily
  { scope: 'text', kind: 'expert', subtype: 'industry-search-track' },
  { scope: 'text', kind: 'expert', subtype: 'industry-daily-structure' },
  { scope: 'text', kind: 'expert', subtype: 'industry-daily-body' },
  { scope: 'text', kind: 'transform', subtype: 'md-polish-daily' },
  { scope: 'text', kind: 'transform', subtype: 'md-format' },
  // deck（演示文稿）
  { scope: 'text', kind: 'expert', subtype: 'deck-plan-recommend' },
  { scope: 'text', kind: 'expert', subtype: 'deck-visual-plan' },
  { scope: 'text', kind: 'expert', subtype: 'deck-slide-fill' },
  { scope: 'text', kind: 'transform', subtype: 'writing-review-summary' },
  // voice-over
  { scope: 'text', kind: 'transform', subtype: 'voice-script-draft' },
  { scope: 'text', kind: 'expert', subtype: 'voice-persona-sketch' },
  { scope: 'text', kind: 'transform', subtype: 'voice-script-tts-markup' },
  // multi-voice
  { scope: 'text', kind: 'expert', subtype: 'dialogue-content-scan' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-script-draft' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-tts-markup' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-timeline-cues' },
];

export const CORE_SKILL_ALL_SLICES: SkillSliceKey[] = [
  ...CORE_SKILL_HOST_SLICES,
  ...CORE_SKILL_TEXT_SLICES,
];

export function skillSliceId(s: SkillSliceKey): string {
  return `${s.scope}/${s.kind}/${s.subtype}`;
}

export function isCoreSkillSlice(args: {
  scope: string;
  taskKey?: string | null;
  type?: string | null;
  subtype?: string | null;
}): boolean {
  const subtype = String(args.subtype ?? '').trim();
  if (!subtype) return false;
  const scope = String(args.scope ?? '').trim();
  if (scope === 'text') {
    const kind = String(args.type ?? args.taskKey ?? '').trim();
    return CORE_SKILL_TEXT_SLICES.some(
      (s) => s.scope === 'text' && s.kind === kind && s.subtype === subtype
    );
  }
  const kind = String(args.taskKey ?? args.type ?? '').trim();
  return CORE_SKILL_HOST_SLICES.some(
    (s) => s.scope === scope && s.kind === kind && s.subtype === subtype
  );
}
