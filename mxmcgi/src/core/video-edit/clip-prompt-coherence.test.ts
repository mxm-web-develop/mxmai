import { describe, expect, it } from 'vitest';
import {
  buildDefaultGraphImagePrompt,
  buildDefaultVideoSeedancePrompt,
  enrichShotListRaw,
  enrichVideoEditScriptAiPrompts,
} from './clip-prompt-coherence';
import type { VideoEditScript } from './types';

describe('clip-prompt-coherence', () => {
  it('buildDefaultVideoSeedancePrompt is English and includes style', () => {
    const p = buildDefaultVideoSeedancePrompt(
      '可可豆特写',
      '黑巧克力对心血管有益',
      { globalTopic: '黑巧克力', editStyle: 'science-minimal', aspectRatio: '16:9' }
    );
    expect(p).toMatch(/Video about "黑巧克力"/);
    expect(p).toMatch(/minimal_clean|minimal science/i);
    expect(p).not.toMatch(/主题「/);
  });

  it('buildDefaultGraphImagePrompt is Chinese descriptive', () => {
    const p = buildDefaultGraphImagePrompt(
      '心血管益处示意图',
      '黑巧克力对心血管有益',
      { globalTopic: '黑巧克力', editStyle: 'science-minimal' }
    );
    expect(p).toContain('极简科普信息图');
    expect(p).toContain('心血管益处示意图');
  });

  it('enrichShotListRaw fills missing video/image prompts for ai segments', () => {
    const raw = enrichShotListRaw(
      {
        global_topic: 'AI 工作流',
        segments: [
          {
            beatId: 'b1',
            text: '开发者使用 AI 编码',
            mxmRenderMode: 'ai-video-gen',
            mxmAiOutputKind: 'video',
          },
          {
            beatId: 'b2',
            text: '效率提升数据图',
            mxmRenderMode: 'ai-video-gen',
            mxmAiOutputKind: 'image',
          },
        ],
      },
      { editStyle: 'science-minimal', aspectRatio: '16:9' }
    ) as {
      segments: Array<{
        mxmVideoPrompt?: string;
        mxmImagePrompt?: string;
        mxmVisualStyle?: string;
      }>;
    };

    expect(raw.segments[0]?.mxmVideoPrompt?.length).toBeGreaterThan(20);
    expect(raw.segments[1]?.mxmImagePrompt).toContain('极简科普');
    expect(raw.segments[0]?.mxmVisualStyle).toBe('minimal_clean');
    expect(raw.segments[1]?.mxmVisualStyle).toBe('minimal_clean');
  });

  it('enrichShotListRaw forces material_type defaultAiOutputKind onto AI segments', () => {
    const raw = enrichShotListRaw(
      {
        global_topic: '主题',
        segments: [
          {
            beatId: 'b1',
            text: '画面 A',
            mxmRenderMode: 'ai-video-gen',
            mxmAiOutputKind: 'video',
          },
        ],
      },
      { editStyle: 'science-minimal', defaultAiOutputKind: 'image' }
    ) as { segments: Array<{ mxmAiOutputKind?: string; mxmImagePrompt?: string }> };

    expect(raw.segments[0]?.mxmAiOutputKind).toBe('image');
    expect(raw.segments[0]?.mxmImagePrompt?.length).toBeGreaterThan(5);
  });

  it('enrichVideoEditScriptAiPrompts fills clip metadata', () => {
    const script = {
      version: '1.0.0',
      project: {
        id: 'p1',
        name: '测试',
        settings: { width: 1920, height: 1080, frameRate: 30, mxmEditStyle: 'documentary' },
        timeline: {
          duration: 10,
          tracks: [
            {
              id: 't1',
              type: 'video',
              clips: [
                {
                  id: 'c1',
                  startTime: 0,
                  duration: 10,
                  metadata: {
                    mxmRenderMode: 'ai-video-gen',
                    mxmVoiceoverText: '海洋塑料污染问题',
                  },
                },
              ],
            },
          ],
        },
      },
    } as VideoEditScript;

    const next = enrichVideoEditScriptAiPrompts(script, {
      globalTopic: '海洋环保',
      editStyle: 'documentary',
    });
    const meta = next.project.timeline.tracks[0]!.clips[0]!.metadata;
    expect(meta?.mxmVideoPrompt?.length).toBeGreaterThan(20);
    expect(meta?.mxmVisualStyle).toBe('cinematic');
    expect(meta?.mxmGlobalTopic).toBe('海洋环保');
  });
});
