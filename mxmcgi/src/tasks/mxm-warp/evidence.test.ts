import { describe, expect, it } from 'vitest';
import {
  buildCitationBrief,
  buildContractView,
  buildEvidenceDigest,
  buildEvidencePack,
  putEvidence,
  slimWebSearchForContract,
  targetToEvidenceKey,
} from './evidence';
import type { TaskContext } from '../types';

function emptyCtx(): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'industry-daily',
    taskId: 't1',
    params: {},
    state: {},
  };
}

describe('evidence cache', () => {
  it('maps webSearch targets to evidence keys', () => {
    expect(targetToEvidenceKey('sources.websource')).toBe('websource');
    expect(targetToEvidenceKey('enrich_search.result')).toBe('enrich_result');
    expect(targetToEvidenceKey('enrich_search.result_supplement')).toBe('enrich_supplement');
    expect(targetToEvidenceKey('enrich_search.industry_overview')).toBe('industry_overview');
    expect(targetToEvidenceKey('sources.industry_overview')).toBe('industry_overview');
  });

  it('slims contract pointer without full text/items', () => {
    const pointer = slimWebSearchForContract(
      {
        query: 'q',
        hitCount: 2,
        text: 'hello world '.repeat(100),
        items: [{ title: 'a', url: 'https://x', snippet: 's' }],
        topicChips: ['热点1'],
      },
      'websource'
    );
    expect(pointer.evidenceKey).toBe('websource');
    expect(pointer.topicChips).toEqual(['热点1']);
    expect(pointer.digest).toBeTruthy();
    expect((pointer as { text?: string }).text).toBeUndefined();
    expect((pointer as { items?: unknown }).items).toBeUndefined();
  });

  it('putEvidence stores digest + payload; pack is budgeted', () => {
    let ctx = emptyCtx();
    ctx = putEvidence(ctx, 'websource', {
      query: 'AI',
      hitCount: 3,
      text: 'x'.repeat(5000),
      items: [
        { title: 'T1', url: 'https://a', snippet: 's1' },
        { title: 'T2', url: 'https://b', snippet: 's2' },
      ],
    });
    const store = ctx.state.evidence as Record<string, ReturnType<typeof buildEvidenceDigest>>;
    expect(store.websource.digestText.length).toBeLessThan(5000);
    expect(store.websource.payload?.items).toHaveLength(2);

    const pack = buildEvidencePack(ctx, { maxChars: 900 });
    expect(pack.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(pack).length).toBeLessThanOrEqual(1200);
  });

  it('prefer extracted summaries in evidence pack', () => {
    let ctx = emptyCtx();
    ctx = putEvidence(ctx, 'enrich_result', {
      query: '申花',
      hitCount: 1,
      text: 'digest-only '.repeat(40),
      items: [{ title: '频道页', url: 'https://news.example/list', snippet: '短摘要' }],
      extracted: [
        {
          url: 'https://news.example/a',
          title: '申花赛程通稿',
          summary: '申花本周主场对阵浙江，随后客战泰山。',
          keyPoints: ['主场浙江', '客战泰山'],
          dataPoints: ['7天3战'],
        },
      ],
    });
    const pack = buildEvidencePack(ctx, { maxChars: 4000, keys: ['enrich_result'] });
    expect(pack[0]?.extracted?.[0]?.url).toBe('https://news.example/a');
    expect(pack[0]?.extracted?.[0]?.summary).toContain('申花');
  });

  it('buildCitationBrief merges extracted urls and source_map', () => {
    let ctx = emptyCtx();
    ctx = putEvidence(ctx, 'websource', {
      query: 'q',
      hitCount: 1,
      text: 't',
      items: [{ title: 'A', url: 'https://a.example/1', snippet: 's', domain: 'a.example' }],
      extracted: [{ url: 'https://a.example/1', title: 'A', summary: '摘要A' }],
    });
    ctx = {
      ...ctx,
      state: {
        ...ctx.state,
        contract: {
          business: {
            source_map: [{ title: '官方公告', url: 'https://official.example/x', note: '赛程' }],
          },
        },
      },
    };
    const brief = buildCitationBrief(ctx, { maxItems: 10 });
    const urls = brief.map((b) => b.url);
    expect(urls).toContain('https://a.example/1');
    expect(urls).toContain('https://official.example/x');
  });

  it('buildContractView drops enrich result corpus', () => {
    const view = buildContractView({
      meta: { v: 1 },
      basic: { industry: '金融' },
      business: { title: '日报' },
      assets: { cards: {} },
      sources: {
        websource: {
          query: 'q',
          hitCount: 9,
          evidenceKey: 'websource',
          digest: 'short',
          text: 'SHOULD_NOT_APPEAR_FULL',
        },
      },
      enrich_search: {
        query: { tracks: [] },
        result: { query: 'r', text: 'BIG'.repeat(1000), hitCount: 5 },
      },
    });
    expect((view.basic as { industry: string }).industry).toBe('金融');
    expect(JSON.stringify(view)).not.toContain('BIG'.repeat(10));
    expect((view.enrich_search as { result: { evidenceKey?: string } }).result?.evidenceKey).toBe(
      'enrich_result'
    );
  });
});
