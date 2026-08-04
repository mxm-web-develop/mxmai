import { describe, expect, it } from 'vitest';
import {
  deckPlanChipLabel,
  heuristicDeckPlans,
  normalizeDeckPlans,
} from './deck-plan-recommend-preview';

describe('deck-plan-recommend-preview', () => {
  it('heuristic yields 3 distinguishable plans', () => {
    const plans = heuristicDeckPlans({ usageDirection: 'product_brochure' });
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(plans[0]!.page_count).toBeLessThan(plans[2]!.page_count);
    expect(plans[0]!.slide_roles[0]).toBe('cover');
    expect(plans[0]!.slide_roles.at(-1)).toBe('closing');
  });

  it('normalizeDeckPlans clamps and fills roles', () => {
    const plans = normalizeDeckPlans([
      { id: 'a', label: '精简', page_count: 99, density: 'weird' },
      { id: 'b', label: '适中', page_count: 12, density: 'balanced', why: 'ok' },
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]!.page_count).toBe(16);
    expect(plans[0]!.density).toBe('balanced');
    expect(plans[0]!.slide_roles).toHaveLength(16);
    expect(deckPlanChipLabel(plans[1]!)).toContain('12');
  });
});
