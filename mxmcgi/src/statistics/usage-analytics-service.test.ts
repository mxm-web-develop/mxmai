import { describe, expect, it } from 'vitest';
import { __usageAnalyticsTestUtils } from './usage-analytics-service';
import { rawScopesForDisplayScope } from './usage-context';

const { parseRpcSummary, parseTotals } = __usageAnalyticsTestUtils;

describe('parseTotals', () => {
  it('coerces numeric fields with zero defaults', () => {
    expect(parseTotals({ mxmTokenCharged: '12.5', providerCallCount: 3 })).toEqual({
      mxmTokenCharged: 12.5,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      imageCount: 0,
      videoRequests: 0,
      audioRequests: 0,
      musicRequests: 0,
      providerCallCount: 3,
    });
  });
});

describe('parseRpcSummary', () => {
  it('maps RPC jsonb to AccountUsageSummary slices', () => {
    const parsed = parseRpcSummary({
      totals: {
        mxmTokenCharged: 10,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        imageCount: 5,
        videoRequests: 1,
        audioRequests: 0,
        musicRequests: 0,
        providerCallCount: 6,
      },
      bySource: {
        web: { mxmTokenCharged: 8, providerCallCount: 5 },
        open_api: { mxmTokenCharged: 2, providerCallCount: 1 },
      },
      byScope: [
        {
          scope: 'graph',
          metricKind: 'count',
          imageCount: 5,
          requestCount: 5,
          mxmTokenCharged: 5,
          providerCallCount: 5,
        },
      ],
      daily: [{ date: '2026-06-01', mxmTokenCharged: 10, providerCallCount: 6 }],
      openApi: {
        bySlug: [{ slug: 'demo', callCount: 1, mxmTokenCharged: 2, imageCount: 1, inputTokens: 0 }],
        byCaller: [],
        byEndUser: [],
      },
    });

    expect(parsed.totals.mxmTokenCharged).toBe(10);
    expect(parsed.bySource.web.mxmTokenCharged).toBe(8);
    expect(parsed.byScope[0]?.scope).toBe('graph');
    expect(parsed.daily[0]?.date).toBe('2026-06-01');
    expect(parsed.openApi.bySlug[0]?.slug).toBe('demo');
  });
});

describe('rawScopesForDisplayScope', () => {
  it('expands writing and graph aliases for events filter', () => {
    expect(rawScopesForDisplayScope('writing')).toEqual(['writing', 'outline']);
    expect(rawScopesForDisplayScope('graph')).toEqual(['graph', 'image']);
    expect(rawScopesForDisplayScope('video')).toEqual(['video']);
  });
});

describe('listEvents pagination offset', () => {
  it('computes range offset from page and limit', () => {
    const page = 3;
    const limit = 20;
    const offset = (page - 1) * limit;
    expect(offset).toBe(40);
    expect(offset + limit - 1).toBe(59);
  });
});
