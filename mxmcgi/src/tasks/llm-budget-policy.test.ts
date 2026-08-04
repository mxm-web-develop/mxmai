import { describe, expect, it } from 'vitest';
import { budgetFromGenerateMetadata, emptyBudgetReport } from './llm-budget-policy';

describe('llm-budget-policy', () => {
  it('reads usage and finish_reason from metadata', () => {
    const b = budgetFromGenerateMetadata({
      finish_reason: 'length',
      usage: { completion_tokens: 1200, prompt_tokens: 800, total_tokens: 2000 },
      had_reasoning: true,
    });
    expect(b.truncated).toBe(true);
    expect(b.completion_tokens).toBe(1200);
    expect(b.had_reasoning).toBe(true);
  });

  it('prefers provider budget block', () => {
    const b = budgetFromGenerateMetadata({
      finish_reason: 'stop',
      budget: {
        ...emptyBudgetReport(),
        continued: true,
        thinking_disabled_retry: true,
        completion_tokens: 99,
        finish_reason: 'length',
        truncated: true,
        had_reasoning: false,
        attempts: [],
      },
    });
    expect(b.continued).toBe(true);
    expect(b.thinking_disabled_retry).toBe(true);
    expect(b.completion_tokens).toBe(99);
  });
});
