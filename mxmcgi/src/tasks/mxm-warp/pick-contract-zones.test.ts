import { describe, expect, it } from 'vitest';
import { buildContractView, pickContractZones } from './evidence';

describe('pickContractZones', () => {
  it('keeps only requested zones plus slim meta', () => {
    const view = buildContractView({
      meta: { scope: 'writing', taskKey: 'generator', subtype: 'industry-daily', taskId: 't1' },
      basic: { main_topic: 'A', core_topic: 'A' },
      business: { report_title: 'x' },
      assets: { cards: [] },
      selection: { topics: ['A'] },
      sources: { websource: { topicChips: ['A'], topicPool: ['A', 'B', 'C'] } },
      enrich_search: { query: 'q', result: { text: 'huge' } },
    });
    // topicPool must not leak into LLM contract view
    expect((view.sources as { websource: { topicPool?: unknown } }).websource.topicPool).toBeUndefined();

    const slim = pickContractZones(view, ['basic', 'selection', 'assets']);
    expect(Object.keys(slim).sort()).toEqual(['assets', 'basic', 'meta', 'selection'].sort());
    expect(slim.business).toBeUndefined();
    expect(slim.enrich_search).toBeUndefined();
    expect((slim.basic as { main_topic: string }).main_topic).toBe('A');
  });
});
