import { describe, expect, it } from 'vitest';
import {
  extractImageUrlFromTaskResult,
  extractVideoUrlFromTaskResult,
} from './media-url-extract';
import { buildAiImageDispatchParams } from './ai-image-dispatch-params';

describe('media-url-extract', () => {
  it('extractVideoUrlFromTaskResult reads syncResult.mediaUrls', () => {
    expect(
      extractVideoUrlFromTaskResult({
        syncResult: { mediaUrls: ['https://cdn.example/v.mp4'] },
      })
    ).toBe('https://cdn.example/v.mp4');
  });

  it('extractVideoUrlFromTaskResult reads metadata.raw.outputs', () => {
    expect(
      extractVideoUrlFromTaskResult({
        syncResult: {
          metadata: { raw: { outputs: ['https://cdn.example/raw.mp4'] } },
        },
      })
    ).toBe('https://cdn.example/raw.mp4');
  });

  it('extractImageUrlFromTaskResult prefers image fields', () => {
    expect(
      extractImageUrlFromTaskResult({
        syncResult: {
          mediaUrls: ['https://cdn.example/a.png'],
        },
      })
    ).toBe('https://cdn.example/a.png');
  });
});

describe('buildAiImageDispatchParams', () => {
  it('maps prompt to core_content and video_embed usage', () => {
    const p = buildAiImageDispatchParams(
      {
        mxmRenderMode: 'ai-video-gen',
        mxmPrompt: 'AI dashboard rising metrics',
        mxmRatio: '16:9',
        mxmVoiceoverText: '谁能稳定完成复杂工作流',
      },
      'clip-1',
      { globalTopic: 'MXM AI', editStyle: 'science-minimal' }
    );
    expect(p.core_content).toBe('AI dashboard rising metrics');
    expect(p.usage_context).toBe('video_embed');
    expect(p.aspect_ratio).toBe('16:9');
    expect(p.illustration_style).toBe('explain_visual');
    expect(p.flat_visual_tone).toBe('explain_visual');
    expect(p.source).toBe('video-edit-pipeline');
  });
});
