import { describe, expect, it } from 'vitest';
import { slimTraceIoForDisplay } from './adminBizDebugTraceSlim';

describe('slimTraceIoForDisplay', () => {
  it('passes through v1 config+resolved', () => {
    const v = {
      _schema: 'pipeline-step-io/v1',
      config: { step: 'webSearch', params: { queryFrom: 'params.topic' } },
      resolved: { 'params.queryFrom': { path: 'params.topic', value: 'hello' } },
    };
    expect(slimTraceIoForDisplay('webSearch', v, 'input')).toBe(v);
  });

  it('legacy fat input keeps config only, no business field guessing', () => {
    const fat = {
      step: 'nestedText',
      stepParams: { claimPaths: ['basic.topic'] },
      contract: {
        basic: { industry: '加密货币', topic: 'x' },
        business: { body_sections: [{ id: 1 }] },
      },
      evidence: { websource: { hitCount: 3 } },
    };
    const slim = slimTraceIoForDisplay('nestedText', fat, 'input') as Record<string, unknown>;
    expect(slim.config).toBeTruthy();
    expect(JSON.stringify(slim)).not.toContain('body_sections');
    expect(JSON.stringify(slim)).not.toMatch(/"industry":\s*"加密货币"/);
  });

  it('legacy fat output does not reuse input-style used block', () => {
    const fat = {
      step: 'webSearch',
      stepParams: { target: 'sources.websource' },
      contract: { basic: { topic: 'a' } },
      evidence: { websource: { payload: { items: [{ title: 't' }] } } },
    };
    const slim = slimTraceIoForDisplay('webSearch', fat, 'output') as {
      produced?: { evidenceKeys?: string[] };
      used?: unknown;
    };
    expect(slim.used).toBeUndefined();
    expect(slim.produced?.evidenceKeys).toContain('websource');
  });
});
