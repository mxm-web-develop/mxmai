import { describe, expect, it } from 'vitest';
import { validateTaskV2SubmitParams } from './prepareSubmitParams';

const voiceSchema = {
  required: ['topic', 'voiceover_audio_url', 'render_plan'],
  properties: {
    topic: { type: 'string', title: '视频主题', minLength: 4 },
    voiceover_audio_url: { type: 'string', title: '口播音频', minLength: 8 },
    render_plan: {
      type: 'array',
      title: '剪辑方案',
      minItems: 1,
      items: { type: 'string' },
    },
  },
};

describe('validateTaskV2SubmitParams', () => {
  it('requires voiceover_audio_url when missing', () => {
    expect(
      validateTaskV2SubmitParams(
        { topic: '黑巧克力与心血管健康', render_plan: ['gsap-html-animation'] },
        voiceSchema
      )
    ).toBe('请先填写「口播音频」');
  });

  it('passes when required fields present', () => {
    expect(
      validateTaskV2SubmitParams(
        {
          topic: '黑巧克力与心血管健康',
          voiceover_audio_url: 'https://cdn.example.com/a.mp3',
          render_plan: ['static-image'],
        },
        voiceSchema
      )
    ).toBeNull();
  });
});
