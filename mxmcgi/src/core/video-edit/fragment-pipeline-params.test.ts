import { describe, expect, it } from 'vitest';
import {
  buildFragmentParamsFromClipMetadata,
  mapAspectRatioToPlatformPreset,
  mapEditStyleToVisualStyle,
} from './fragment-pipeline-params';
import type { MxmClipMetadata } from './types';

describe('fragment-pipeline-params', () => {
  it('maps aspect ratio to platform preset', () => {
    expect(mapAspectRatioToPlatformPreset('16:9')).toBe('bilibili_16_9');
    expect(mapAspectRatioToPlatformPreset('9:16')).toBe('douyin_9_16');
    expect(mapAspectRatioToPlatformPreset('1:1')).toBe('square_1_1');
  });

  it('maps edit_style to visual_style', () => {
    expect(mapEditStyleToVisualStyle('science-minimal')).toBe('minimal_clean');
    expect(mapEditStyleToVisualStyle('documentary')).toBe('cinematic');
    expect(mapEditStyleToVisualStyle('motion-infographic')).toBe('motion_graphics');
  });

  it('builds pipeline params for auto-edit b-roll clip', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmPrompt:
        'cocoa beans macro shot, slow push-in, warm studio lighting, cinematic 16:9, negative: no text',
      mxmDuration: 10,
      mxmRatio: '16:9',
      mxmVoiceoverText: '黑巧克力富含黄酮类物质',
      mxmGlobalTopic: '黑巧克力与心血管健康',
      mxmEditStyle: 'science-minimal',
      mxmFragmentRole: 'broll',
    };
    const p = buildFragmentParamsFromClipMetadata(meta, 10, 'clip-vis-2');
    expect(p.source).toBe('video-edit-pipeline');
    expect(p.fragment_role).toBe('broll');
    expect(p.platform_preset).toBe('bilibili_16_9');
    expect(p.visual_style).toBe('minimal_clean');
    expect(p.motion_intensity).toBe('subtle');
    expect(p.background_mode).toBe('dark_clean');
    expect(p.global_topic).toBe('黑巧克力与心血管健康');
    expect(p.voiceover_context).toContain('黄酮');
    expect(p.atlas_video_mode).toBe('text-to-video');
    expect(p.duration).toBe(10);
    expect(p.prompt).toContain('cocoa beans');
  });

  it('caps duration at 15 seconds', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmPrompt: 'test',
      mxmDuration: 18,
    };
    const p = buildFragmentParamsFromClipMetadata(meta, 18, 'clip-x');
    expect(p.duration).toBe(15);
  });

  it('uses image-to-video when source image present', () => {
    const meta: MxmClipMetadata = {
      mxmRenderMode: 'ai-video-gen',
      mxmPrompt: 'gentle motion',
      mxmSourceImageUrl: 'https://cdn.example.com/frame.png',
    };
    const p = buildFragmentParamsFromClipMetadata(meta, 5, 'clip-y');
    expect(p.atlas_video_mode).toBe('image-to-video');
    expect(p.input_reference).toBe('https://cdn.example.com/frame.png');
  });
});
