import { describe, expect, it } from 'vitest';
import { buildAiVideoDispatchParams } from './dispatcher';
import type { MxmClipMetadata } from './types';

describe('buildAiVideoDispatchParams', () => {
  it('defaults to text-to-video pipeline params', () => {
    const meta = { mxmRenderMode: 'ai-video-gen' as const, mxmPrompt: 'hello' };
    const p = buildAiVideoDispatchParams(meta, 5, 'clip-1');
    expect(p.source).toBe('video-edit-pipeline');
    expect(p.fragment_role).toBe('broll');
    expect(p.atlas_video_mode).toBe('text-to-video');
    expect(p.prompt).toBe('hello');
    expect(p.platform_preset).toBe('bilibili_16_9');
  });

  it('uses image-to-video when mxmSourceImageUrl present', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmSourceImageUrl: 'https://cdn.example/a.png',
      mxmPrompt: 'motion',
    };
    const p = buildAiVideoDispatchParams(meta, 4, 'clip-2');
    expect(p.atlas_video_mode).toBe('image-to-video');
    expect(p.image).toBe('https://cdn.example/a.png');
    expect(p.reference_images).toEqual(['https://cdn.example/a.png']);
  });

  it('uses explicit mxmVideoMode reference-to-video', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmVideoMode: 'reference-to-video',
      mxmReferenceImages: ['https://cdn.example/1.png', 'https://cdn.example/2.png'],
    };
    const p = buildAiVideoDispatchParams(meta, 6, 'clip-3');
    expect(p.atlas_video_mode).toBe('reference-to-video');
    expect(p.reference_images).toEqual(['https://cdn.example/1.png', 'https://cdn.example/2.png']);
  });

  it('rounds fragment duration from job seconds', () => {
    const meta = { mxmRenderMode: 'ai-video-gen' as const, mxmPrompt: 'hello', mxmDuration: 5.7 };
    const p = buildAiVideoDispatchParams(meta, 3.21, 'clip-4');
    expect(p.duration).toBe(3);
    expect(p.total_duration_seconds).toBe(3);
  });
});
