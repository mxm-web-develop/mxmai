/**
 * 演示文稿 pre：推荐 3 套页数/密度方案，供 C 端 chips 点选。
 */

export type DeckPlanRecommendInput = {
  usageDirection?: string;
  usageDirectionCustom?: string;
  sourceMaterial?: string;
  brief?: string;
  language?: string;
  userId?: string;
};

export type DeckPlanOption = {
  id: string;
  label: string;
  page_count: number;
  density: 'sparse' | 'balanced' | 'dense';
  narrative_arc: string;
  slide_roles: string[];
  why: string;
};

export type DeckPlanRecommendResult = {
  plans: DeckPlanOption[];
  /** 默认选中第一套 */
  plan_id: string;
};

const DENSITY_SET = new Set(['sparse', 'balanced', 'dense']);

function clampPages(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(16, Math.max(8, Math.round(v)));
}

function rolesForCount(n: number): string[] {
  const roles: string[] = ['cover', 'agenda'];
  const mid = Math.max(0, n - 3);
  for (let i = 0; i < mid; i++) {
    roles.push(i % 3 === 0 ? 'section' : 'content');
  }
  roles.push('closing');
  while (roles.length < n) roles.splice(roles.length - 1, 0, 'content');
  return roles.slice(0, n);
}

function directionLabel(dir: string, custom?: string): string {
  const map: Record<string, string> = {
    designer_guide: '设计师规范',
    product_brochure: '产品宣传手册',
    pitch: '融资提案',
    course: '课程讲义',
    brand_book: '品牌手册',
    custom: custom?.trim() || '自定义方案',
  };
  return map[dir] || dir || '演示文稿';
}

/** 无 LLM / 失败时：按使用方向给 3 套可区分方案 */
export function heuristicDeckPlans(input: {
  usageDirection?: string;
  usageDirectionCustom?: string;
}): DeckPlanOption[] {
  const label = directionLabel(
    String(input.usageDirection ?? '').trim(),
    input.usageDirectionCustom
  );
  const specs: Array<{ id: string; pages: number; density: DeckPlanOption['density']; tag: string }> =
    [
      { id: 'p1', pages: 8, density: 'sparse', tag: '精简' },
      { id: 'p2', pages: 12, density: 'balanced', tag: '适中' },
      { id: 'p3', pages: 16, density: 'dense', tag: '详尽' },
    ];
  return specs.map((s) => ({
    id: s.id,
    label: `${label}·${s.pages}页`,
    page_count: s.pages,
    density: s.density,
    narrative_arc: `${s.tag}叙事：开篇定位 → 要点展开 → 收束行动`,
    slide_roles: rolesForCount(s.pages),
    why: `${s.tag}版，约 ${s.pages} 页，信息密度${s.density === 'sparse' ? '低' : s.density === 'dense' ? '高' : '中'}`,
  }));
}

function parsePlansJson(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let root: Record<string, unknown> | null = null;
  try {
    const direct = JSON.parse(trimmed) as Record<string, unknown>;
    if (direct && typeof direct === 'object') root = direct;
  } catch {
    /* fence */
  }
  if (!root) {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      root = JSON.parse(m[0]!) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (Array.isArray(root.plans)) return root.plans;
  return null;
}

export function normalizeDeckPlans(raw: unknown): DeckPlanOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckPlanOption[] = [];
  for (let i = 0; i < raw.length && out.length < 3; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id ?? `p${i + 1}`).trim() || `p${i + 1}`;
    const page_count = clampPages(o.page_count, 8 + i * 4);
    const densityRaw = String(o.density ?? 'balanced').trim();
    const density = (DENSITY_SET.has(densityRaw) ? densityRaw : 'balanced') as DeckPlanOption['density'];
    const roles = Array.isArray(o.slide_roles)
      ? o.slide_roles.map(String).filter(Boolean)
      : rolesForCount(page_count);
    out.push({
      id,
      label: String(o.label ?? '').trim() || `方案 ${i + 1}·${page_count}页`,
      page_count,
      density,
      narrative_arc: String(o.narrative_arc ?? '').trim() || '开篇 → 展开 → 收束',
      slide_roles: roles.length === page_count ? roles : rolesForCount(page_count),
      why: String(o.why ?? '').trim() || `${page_count} 页 · ${density}`,
    });
  }
  return out;
}

/** chip 展示文案：短标签 + 页数感 */
export function deckPlanChipLabel(plan: DeckPlanOption): string {
  const dens =
    plan.density === 'sparse' ? '疏' : plan.density === 'dense' ? '密' : '中';
  const base = plan.label.trim() || plan.id;
  if (/\d+\s*页/.test(base)) return base;
  return `${base}·${plan.page_count}页·${dens}`;
}

export async function previewDeckPlanRecommend(
  input: DeckPlanRecommendInput
): Promise<DeckPlanRecommendResult> {
  const usageDirection = String(input.usageDirection ?? '').trim() || 'product_brochure';
  const usageDirectionCustom = String(input.usageDirectionCustom ?? '').trim();
  const sourceMaterial = String(input.sourceMaterial ?? '').trim();
  const brief = String(input.brief ?? '').trim();
  const language = String(input.language ?? 'zh').trim() || 'zh';
  const fallback = (): DeckPlanRecommendResult => {
    const plans = heuristicDeckPlans({ usageDirection, usageDirectionCustom });
    return { plans, plan_id: plans[0]!.id };
  };

  if (!brief && !sourceMaterial) {
    return fallback();
  }

  const userId = input.userId?.trim();
  if (!userId) {
    return fallback();
  }

  const sourceExcerpt = sourceMaterial.slice(0, 12000);
  const briefExcerpt = brief.slice(0, 4000);

  try {
    const { runTaskV2 } = await import('../task-engine');
    const res = await runTaskV2(
      {
        scope: 'text',
        taskKey: 'expert',
        subtype: 'deck-plan-recommend',
        params: {
          contract: {
            basic: {
              usage_direction: usageDirection,
              usage_direction_custom: usageDirectionCustom || undefined,
              source_material: sourceExcerpt,
              brief: briefExcerpt,
              language,
            },
            business: {},
          },
          field_specs: [{ name: 'plans', type: 'array', description: '恰好 3 套方案' }],
        },
      },
      userId
    );
    const text = res.syncResult?.text ?? '';
    const plans = normalizeDeckPlans(parsePlansJson(text));
    if (plans.length < 2) return fallback();
    return { plans, plan_id: plans[0]!.id };
  } catch (err) {
    console.warn('[previewDeckPlanRecommend] fallback heuristic:', err);
    return fallback();
  }
}
