import { describe, expect, it } from 'vitest';
import { mergeGenerateParamsIntoParameters } from './run';

describe('mergeGenerateParamsIntoParameters', () => {
  it('maps maxTokens to max_tokens and max_completion_tokens', () => {
    const merged = mergeGenerateParamsIntoParameters(
      { maxTokens: 131072, parameters: {} } as never,
      { max_tokens: 4096 },
    );
    expect(merged.max_tokens).toBe(131072);
    expect(merged.max_completion_tokens).toBe(131072);
  });

  it('does not override explicit parameters', () => {
    const merged = mergeGenerateParamsIntoParameters(
      { maxTokens: 8192, parameters: { max_completion_tokens: 65536 } } as never,
      {},
    );
    expect(merged.max_completion_tokens).toBe(65536);
    expect(merged.max_tokens).toBe(8192);
  });
});
