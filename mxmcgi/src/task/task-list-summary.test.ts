import { describe, expect, it } from 'vitest';
import {
  extractContentPreviewFromResult,
  extractOutputFormatFromResult,
  pruneRequestParamsForListView,
  pruneTaskResultForListView,
  toTaskListSummary,
} from './task-list-summary';

describe('task-list-summary', () => {
  it('strips mediaUrls from list result', () => {
    expect(
      pruneTaskResultForListView({
        mediaUrls: ['https://example.com/a.mp3', 'https://example.com/b.mp3'],
        storageInfo: { keys: ['k1'], bucket: 'b', urls: [] },
        metadata: { subtitles: 'x'.repeat(5000) },
      })
    ).toEqual({ hasMedia: true, mediaCount: 2 });
  });

  it('treats storageInfo.keys as media when mediaUrls omitted (list summary mode)', () => {
    expect(
      pruneTaskResultForListView({
        storageInfo: {
          keys: ['u/video/a.mp4'],
          bucket: 'aigc',
          urls: ['http://127.0.0.1:9000/aigc/u/video/a.mp4'],
          proxyUrls: ['/api/v1/media/video/t1'],
        },
      })
    ).toEqual({ hasMedia: true, mediaCount: 1 });
  });

  it('keeps album partial-fail counters in list metadata', () => {
    expect(
      pruneTaskResultForListView({
        mediaUrls: ['https://example.com/a.png'],
        metadata: {
          resultKind: 'image-album',
          albumReadyCount: 7,
          albumFailedCount: 3,
          albumResult: { items: [] },
        },
      })
    ).toEqual({
      hasMedia: true,
      mediaCount: 1,
      metadata: {
        resultKind: 'image-album',
        albumReadyCount: 7,
        albumFailedCount: 3,
      },
    });
  });

  it('includes contentPreview from output metadata.text', () => {
    const longOutput = '这是生成正文。'.repeat(40);
    expect(
      pruneTaskResultForListView({
        mediaUrls: [],
        metadata: { text: longOutput, format: 'markdown' },
      })
    ).toEqual({
      hasMedia: false,
      mediaCount: 0,
      contentPreview: `${longOutput.slice(0, 160)}…`,
      outputFormat: 'markdown',
    });
  });

  it('includes outputFormat from metadata.format', () => {
    expect(
      pruneTaskResultForListView({
        mediaUrls: [],
        metadata: { format: 'pdf' },
      })
    ).toEqual({
      hasMedia: false,
      mediaCount: 0,
      outputFormat: 'pdf',
    });
  });

  it('is idempotent when list result is pruned twice', () => {
    const once = pruneTaskResultForListView({
      mediaUrls: ['https://cdn/x.pdf'],
      metadata: { format: 'pdf', text: '正文' },
    });
    expect(once?.outputFormat).toBe('pdf');
    expect(pruneTaskResultForListView(once)).toEqual(once);
  });

  it('infers pdf from storageInfo.key', () => {
    expect(
      extractOutputFormatFromResult({
        storageInfo: { key: 'user/writing/doc.pdf', bucket: 'gen' },
      })
    ).toBe('pdf');
  });

  it('list summary with storage_info only (no output_data)', () => {
    expect(
      pruneTaskResultForListView({
        mediaUrls: [],
        storageInfo: { key: 'user/writing/1782904584604-w326om.pdf', bucket: 'aigc' },
      })
    ).toEqual({
      hasMedia: false,
      mediaCount: 0,
      outputFormat: 'pdf',
    });
  });

  it('keeps autocut clipPreviewSummary in list requestParams', () => {
    const pruned = pruneRequestParamsForListView({
      taskKey: 'autocut',
      subtype: 'voiceover-science-pop',
      businessPipelineState: {
        videoEditScriptJson: {
          project: {
            timeline: {
              tracks: [
                {
                  clips: [
                    {
                      id: 'c1',
                      metadata: {
                        mxmRenderMode: 'ai-video-gen',
                        mxmAiOutputKind: 'video',
                        mxmRenderedVideoUrl: '/api/v1/media/asset?bucket=v&key=a.mp4',
                        mxmRenderStatus: 'ready',
                        mxmAiGenTaskId: 'child-1',
                        mxmPrompt: '夜景开场',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    }) as Record<string, unknown>;

    const bps = pruned.businessPipelineState as Record<string, unknown>;
    expect(bps.clipPreviewSummary).toEqual([
      {
        clipId: 'c1',
        kind: 'video',
        url: '/api/v1/media/asset?bucket=v&key=a.mp4',
        label: '夜景开场',
        childTaskId: 'child-1',
      },
    ]);
    expect(bps.videoEditScriptJson).toBeUndefined();
  });

  it('infers json format when outline present', () => {
    expect(extractOutputFormatFromResult({ metadata: { outline: { title: '大纲' } } })).toBe('json');
  });

  it('prefers result.text over metadata for writing preview', () => {
    expect(
      extractContentPreviewFromResult({
        text: '输出摘要正文',
        metadata: { text: 'metadata 里的旧文本' },
      })
    ).toBe('输出摘要正文');
  });

  it('keeps storage_form in list requestParams', () => {
    const longText = '口播'.repeat(200);
    const pruned = pruneRequestParamsForListView({
      graphType: 'photograph',
      metadata: { label: '测试任务' },
      params: {
        source_material: longText,
        text: longText,
        speed: 1.2,
      },
    }) as Record<string, unknown>;

    expect(pruned.graphType).toBe('photograph');
    expect((pruned.metadata as Record<string, unknown>).label).toBe('测试任务');
    const params = pruned.params as Record<string, unknown>;
    expect(params.source_material).toBeUndefined();
    expect(typeof params.text).toBe('string');
    expect((params.text as string).length).toBeLessThanOrEqual(81);
    expect(params.speed).toBe(1.2);
  });

  it('drops top-level prompt from list requestParams (execution must reload full input_data)', () => {
    const longPrompt = 'Hey，(chuckle) '.repeat(400);
    const pruned = pruneRequestParamsForListView({
      prompt: longPrompt,
      params: { prompt: longPrompt, speed: 1 },
    }) as Record<string, unknown>;

    expect(pruned.prompt).toBeUndefined();
    const params = pruned.params as Record<string, unknown>;
    expect(typeof params.prompt).toBe('string');
    expect((params.prompt as string).length).toBeLessThanOrEqual(81);
  });
});
