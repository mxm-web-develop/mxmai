import { describe, expect, it } from 'vitest';
import {
  buildAudioTtsParameters,
  ensureTtsEdgePauses,
  resolveTtsInputText,
} from './audio-tts-params';

describe('ensureTtsEdgePauses', () => {
  it('wraps plain text with 0.8s bookend pauses', () => {
    expect(ensureTtsEdgePauses('大家好')).toBe('<#0.8#>大家好<#0.8#>');
  });

  it('is idempotent and upgrades short edge pauses', () => {
    expect(ensureTtsEdgePauses('<#0.8#>大家好<#0.8#>')).toBe('<#0.8#>大家好<#0.8#>');
    expect(ensureTtsEdgePauses('<#0.2#>大家好<#0.3#>')).toBe('<#0.8#>大家好<#0.8#>');
    expect(ensureTtsEdgePauses('<#1.2#>大家好<#1#>')).toBe('<#1.2#>大家好<#1#>');
  });
});

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
    ).toBe(ensureTtsEdgePauses(full));
  });

  it('falls back to parameters.text then nested prompt', () => {
    expect(
      resolveTtsInputText({
        parameters: { text: 'from-parameters' },
        params: { prompt: 'from-nested' },
      })
    ).toBe(ensureTtsEdgePauses('from-parameters'));
  });
});

describe('buildAudioTtsParameters', () => {
  it('omits emotion for auto/neutral so MiniMax uses model-inferred tone', () => {
    const auto = buildAudioTtsParameters({ emotion: 'auto', voice_id: 'female-shaonv' }, '测试');
    expect((auto.voice_setting as Record<string, unknown>).emotion).toBeUndefined();
    expect(auto.text).toBe('<#0.8#>测试<#0.8#>');

    const neutral = buildAudioTtsParameters({ emotion: 'neutral' }, '测试');
    expect((neutral.voice_setting as Record<string, unknown>).emotion).toBeUndefined();
  });

  it('passes explicit emotion when user overrides', () => {
    const happy = buildAudioTtsParameters({ emotion: 'happy', voice_id: 'female-shaonv' }, '测试');
    expect((happy.voice_setting as Record<string, unknown>).emotion).toBe('happy');
  });

  it('enables MiniMax sentence subtitles by default (incl. speech-2.8)', async () => {
    const { resolveTtsSubtitleApiParams } = await import('./audio-tts-params');
    expect(resolveTtsSubtitleApiParams('speech-2.8-hd', {})).toEqual({
      subtitle_enable: true,
      subtitle_type: 'sentence',
    });
    expect(resolveTtsSubtitleApiParams('speech-2.8-turbo', { subtitle_enable: true })).toEqual({
      subtitle_enable: true,
      subtitle_type: 'sentence',
    });
    expect(resolveTtsSubtitleApiParams('speech-2.8-hd', { subtitle_enable: false })).toEqual({
      subtitle_enable: false,
    });
    const built = buildAudioTtsParameters(
      { voice_id: 'female-shaonv', model: 'speech-2.8-hd' },
      '测试字幕'
    );
    expect(built.subtitle_enable).toBe(true);
    expect(built.subtitle_type).toBe('sentence');
  });

  it('extracts edge pause ms from markup', async () => {
    const { extractTtsEdgePauseMs } = await import('./audio-tts-params');
    expect(extractTtsEdgePauseMs('<#0.3#>你好<#0.4#>')).toEqual({ leadMs: 300, trailMs: 400 });
    expect(extractTtsEdgePauseMs('你好')).toEqual({ leadMs: 0, trailMs: 0 });
  });
});
