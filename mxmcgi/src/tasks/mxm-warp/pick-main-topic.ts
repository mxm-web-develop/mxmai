/**
 * 行业日报：从多选 core_topic 中按 topicChips 热度选出 main_topic。
 * chips 越靠前 = 话题度越高；用户已填 main_topic 时不覆盖。
 */

export function splitCoreTopics(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(/[；;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * 在已选话题与热度排序 chips 求交，取 chips 中最靠前的一条。
 * 无交时回退到已选第一条；都空则 ''。
 */
export function pickMainTopicByHeat(args: {
  selectedTopics: string[];
  topicChips?: string[] | null;
}): string {
  const selected = args.selectedTopics.map((t) => t.trim()).filter(Boolean);
  if (selected.length === 0) return '';
  if (selected.length === 1) return selected[0]!;

  const chips = (args.topicChips ?? []).map((t) => t.trim()).filter(Boolean);
  if (chips.length === 0) return selected[0]!;

  const selectedSet = new Set(selected);
  for (const chip of chips) {
    if (selectedSet.has(chip)) return chip;
  }
  // 宽松：chip 包含某条已选 / 已选包含 chip
  for (const chip of chips) {
    const hit = selected.find((s) => s === chip || s.includes(chip) || chip.includes(s));
    if (hit) return hit;
  }
  return selected[0]!;
}

export function readTopicChipsFromWebsource(websource: unknown): string[] {
  if (!websource || typeof websource !== 'object' || Array.isArray(websource)) return [];
  const chips = (websource as { topicChips?: unknown }).topicChips;
  if (!Array.isArray(chips)) return [];
  return chips.map((c) => String(c ?? '').trim()).filter(Boolean);
}

/**
 * 若 basic.main_topic 已有非空值则保留；否则按热度回填。
 * 返回更新后的 basic（浅拷贝）。
 */
export function ensureMainTopicInBasic(
  basic: Record<string, unknown>,
  opts?: { topicChips?: string[] | null; params?: Record<string, unknown> }
): { basic: Record<string, unknown>; picked: string; autoFilled: boolean } {
  const existing = String(basic.main_topic ?? opts?.params?.main_topic ?? '').trim();
  if (existing) {
    return {
      basic: { ...basic, main_topic: existing },
      picked: existing,
      autoFilled: false,
    };
  }

  const core =
    basic.core_topic ?? opts?.params?.core_topic ?? '';
  const selected = splitCoreTopics(core);
  const chips =
    opts?.topicChips ??
    readTopicChipsFromWebsource(
      (opts?.params as { sources?: { websource?: unknown } } | undefined)?.sources?.websource
    );
  const picked = pickMainTopicByHeat({ selectedTopics: selected, topicChips: chips });
  if (!picked) {
    return { basic: { ...basic }, picked: '', autoFilled: false };
  }
  return {
    basic: { ...basic, main_topic: picked },
    picked,
    autoFilled: true,
  };
}
