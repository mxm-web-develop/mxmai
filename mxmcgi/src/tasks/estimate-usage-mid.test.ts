import { describe, expect, it } from 'vitest';
import {
  buildUsageEstimateForChargeMode,
  midDurationSeconds,
  midTextChars,
} from './estimate-usage-mid';

describe('buildUsageEstimateForChargeMode (TTS / mid)', () => {
  it('audio token_based uses mid text characters as input tokens', () => {
    const script = '你好世界'.repeat(50); // 200 chars
    const u = buildUsageEstimateForChargeMode('audio', 'token_based', { script });
    expect(u.estimatedInputTokens).toBe(script.length);
    expect(u.estimatedOutputTokens).toBe(0);
    expect(u.estimatedAudioSeconds).toBeUndefined();
  });

  it('audio per_second_audio uses duration or char/speed mid', () => {
    const byDur = buildUsageEstimateForChargeMode('audio', 'per_second_audio', {
      audio_duration_seconds: 90,
    });
    expect(byDur.estimatedAudioSeconds).toBe(90);

    const byChars = buildUsageEstimateForChargeMode('audio', 'per_second_audio', {
      script: '测'.repeat(40),
    });
    expect(byChars.estimatedAudioSeconds).toBe(10); // 40/4
  });

  it('audio per_request counts requests', () => {
    const u = buildUsageEstimateForChargeMode('audio', 'per_request', { parallel_count: 3 });
    expect(u.estimatedRequestCount).toBe(3);
  });

  it('writing mid tokens from corpus', () => {
    const u = buildUsageEstimateForChargeMode('writing', 'token_based', {
      prompt: '品牌文案需求' + 'x'.repeat(200),
    });
    expect(u.estimatedInputTokens).toBeGreaterThan(400);
    expect(u.estimatedOutputTokens).toBeGreaterThan(200);
  });

  it('mid helpers', () => {
    expect(midTextChars({ script: 'abcdefghij'.repeat(5) })).toBe(50);
    expect(midDurationSeconds({ duration: 12 })).toBe(12);
  });
});
