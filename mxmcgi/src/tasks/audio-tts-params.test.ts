import { describe, expect, it } from 'vitest';
import { buildAudioTtsParameters, resolveTtsInputText } from './audio-tts-params';

describe('resolveTtsInputText', () => {
  it('prefers top-level prompt over truncated nested params', () => {
    const full = '完整口播稿'.repeat(300);
    const truncated = `${full.slice(0, 80)}…`;
    expect(
      resolveTtsInputText({
        prompt: full,
        params: { prompt: truncated },
        parameters: { text: truncated },
      })
    ).toBe(full);
  });

  it('falls back to parameters.text then nested prompt', () => {
    expect(
      resolveTtsInputText({
        parameters: { text: 'from-parameters' },
        params: { prompt: 'from-nested' },
      })
    ).toBe('from-parameters');
  });
});

describe('buildAudioTtsParameters', () => {
  it('omits emotion for auto/neutral so MiniMax uses model-inferred tone', () => {
    const auto = buildAudioTtsParameters({ emotion: 'auto', voice_id: 'female-shaonv' }, '测试');
    expect((auto.voice_setting as Record<string, unknown>).emotion).toBeUndefined();

    const neutral = buildAudioTtsParameters({ emotion: 'neutral' }, '测试');
    expect((neutral.voice_setting as Record<string, unknown>).emotion).toBeUndefined();
  });

  it('passes explicit emotion when user overrides', () => {
    const happy = buildAudioTtsParameters({ emotion: 'happy', voice_id: 'female-shaonv' }, '测试');
    expect((happy.voice_setting as Record<string, unknown>).emotion).toBe('happy');
  });
});
