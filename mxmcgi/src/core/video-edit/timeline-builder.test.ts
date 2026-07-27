import { describe, expect, it } from 'vitest';
import { buildVideoEditProjectFile } from './timeline-builder-core';
import {
  mergeVoiceoverSegmentsByCutRhythm,
  resolveTimelineVisualSegments,
  voiceoverSegmentsToWindows,
} from './timeline-segment-resolvers';

function makeSubs(count: number, secEach = 2): { text: string; startSeconds: number; endSeconds: number }[] {
  const out: { text: string; startSeconds: number; endSeconds: number }[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * secEach;
    out.push({ text: `句${i + 1}`, startSeconds: start, endSeconds: start + 1.5 });
  }
  return out;
}

describe('timeline-segment-resolvers', () => {
  it('voiceoverSegmentsToWindows 连续铺满总时长', () => {
    const windows = voiceoverSegmentsToWindows(
      [
        { text: '你好', startSeconds: 0.2, endSeconds: 0.8 },
        { text: '世界', startSeconds: 1.2, endSeconds: 2.0 },
      ],
      5
    );
    expect(windows[0]?.startSeconds).toBe(0);
    expect(windows[windows.length - 1]?.endSeconds).toBe(5);
    expect(windows[0]?.endSeconds).toBe(windows[1]?.startSeconds);
  });

  it('mergeVoiceoverSegmentsByCutRhythm 默认节奏合并为 5–10 秒镜', () => {
    const subs = makeSubs(30, 2);
    const total = 60;
    const windows = mergeVoiceoverSegmentsByCutRhythm(subs, total, 5, 10);
    expect(windows.length).toBeLessThan(subs.length);
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]!;
      const dur = w.endSeconds - w.startSeconds;
      expect(dur).toBeGreaterThanOrEqual(0.5);
      // 末镜需铺满总时长，可能略长于 maxCut
      if (i < windows.length - 1) {
        expect(dur).toBeGreaterThanOrEqual(4.5);
        expect(dur).toBeLessThanOrEqual(10.5);
      }
    }
    expect(windows[0]?.startSeconds).toBe(0);
    expect(windows[windows.length - 1]?.endSeconds).toBe(60);
    for (const w of windows) {
      expect(Number.isInteger(w.startSeconds)).toBe(true);
      expect(Number.isInteger(w.endSeconds)).toBe(true);
      expect(Number.isInteger(w.endSeconds - w.startSeconds)).toBe(true);
    }
  });

  it('cut_rhythm default 显著少于句级分镜数', () => {
    const subs = makeSubs(20, 2);
    const perLine = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 40,
      segmentsRaw: subs,
    });
    const merged = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 40,
      segmentsRaw: subs,
      cutRhythm: 'default',
    });
    expect(merged.length).toBeLessThan(perLine.length);
    expect(merged.length).toBeGreaterThanOrEqual(2);
  });

  it('cut_rhythm fast 允许更短切镜', () => {
    const subs = makeSubs(10, 2);
    const merged = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 20,
      segmentsRaw: subs,
      cutRhythm: 'fast',
    });
    expect(merged.length).toBeGreaterThanOrEqual(2);
    const maxDur = Math.max(...merged.map((w) => w.endSeconds - w.startSeconds));
    expect(maxDur).toBeLessThanOrEqual(8.5);
  });

  it('legacy science-promo 映射 default', () => {
    const subs = makeSubs(10, 2);
    const merged = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 20,
      segmentsRaw: subs,
      cutRhythm: 'science-promo',
    });
    const explicit = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 20,
      segmentsRaw: subs,
      cutRhythm: 'default',
    });
    expect(merged.length).toBe(explicit.length);
  });

  it('image-sequence 按张数均分时长', () => {
    const segs = resolveTimelineVisualSegments({
      strategy: 'image-sequence',
      totalDurationSeconds: 30,
      segmentsRaw: [{ url: 'https://a/1.jpg' }, { url: 'https://a/2.jpg' }],
    });
    expect(segs).toHaveLength(2);
    expect(segs[0]?.mxmRenderMode).toBe('static-image');
    expect(segs[1]?.endSeconds).toBe(30);
  });

  it('shot-list 解析 mxmRenderMode/mxmVideoPrompt（兼容旧 mxmPrompt）', () => {
    const segs = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 30,
      segmentsRaw: {
        global_topic: '黑巧克力',
        segments: [
          {
            text: '开场标题卡展示主题',
            startSeconds: 0,
            durationSeconds: 6,
            mxmRenderMode: 'gsap-html-animation',
            mxmGsapSceneBrief: '标题卡 / 主标题+副标题 / 居中 / 淡入+上移',
          },
          {
            text: '可可豆特写镜头',
            startSeconds: 6,
            durationSeconds: 12,
            mxmRenderMode: 'ai-video-gen',
            mxmPrompt: 'cocoa beans macro shot, warm lighting, cinematic 16:9',
          },
          {
            text: '心血管益处信息图',
            startSeconds: 18,
            durationSeconds: 12,
            mxmRenderMode: 'static-image',
            mxmStockSearchQuery: '黑巧克力 心血管 健康 血液循环',
          },
        ],
      },
    });
    expect(segs).toHaveLength(3);
    expect(segs[0]?.mxmRenderMode).toBe('static-image');
    expect(segs[0]?.mxmGsapSceneBrief).toContain('标题卡');
    expect(segs[1]?.mxmVideoPrompt).toContain('cocoa beans');
    expect(segs[2]?.mxmRenderMode).toBe('static-image');
    expect(segs[2]?.mxmStockSearchQuery).toContain('心血管');
    expect(segs[2]?.mxmVideoPrompt).toBeUndefined();
    expect(segs[segs.length - 1]?.endSeconds).toBe(30);
  });

  it('shot-list 解析分字段 mxmVideoPrompt / mxmImagePrompt', () => {
    const segs = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 16,
      segmentsRaw: {
        segments: [
          {
            text: '机器人行走',
            startSeconds: 0,
            durationSeconds: 8,
            mxmRenderMode: 'ai-video-gen',
            mxmAiOutputKind: 'video',
            mxmVideoPrompt: 'humanoid robot walking, tracking shot',
          },
          {
            text: '产能对比图',
            startSeconds: 8,
            durationSeconds: 8,
            mxmRenderMode: 'ai-video-gen',
            mxmAiOutputKind: 'image',
            mxmImagePrompt: '中美人形机器人产能对比扁平信息图',
          },
        ],
      },
    });
    expect(segs[0]?.mxmVideoPrompt).toContain('humanoid robot');
    expect(segs[0]?.mxmImagePrompt).toBeUndefined();
    expect(segs[1]?.mxmImagePrompt).toContain('产能对比');
    expect(segs[1]?.mxmVideoPrompt).toBeUndefined();
  });

  it('shot-list 解析 mxmGsapSceneType / mxmGsapStyleId', () => {
    const segs = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 12,
      segmentsRaw: {
        gsap_style_id: 'tech_terminal',
        segments: [
          {
            text: 'AI 算力趋势折线图',
            voiceover_text: '过去五年算力成本持续下降',
            startSeconds: 0,
            durationSeconds: 12,
            mxmRenderMode: 'gsap-html-animation',
            mxmGsapStyleId: 'tech_terminal',
            mxmGsapSceneType: 'chart_line',
            mxmGsapSceneData: { label: 'COST', values: [100, 80, 65, 50, 42], labels: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'] },
          },
        ],
      },
    });
    expect(segs[0]?.mxmGsapStyleId).toBe('tech_terminal');
    expect(segs[0]?.mxmGsapSceneType).toBe('chart_line');
    expect(segs[0]?.mxmGsapSceneData?.values).toEqual([100, 80, 65, 50, 42]);
    expect(segs[0]?.mxmVoiceoverText).toContain('算力');
  });
});

describe('timeline-builder-core', () => {
  it('buildVideoEditProjectFile 时长与口播轨一致', () => {
    const segments = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 270,
      segmentsRaw: [{ text: '段落一', startSeconds: 0, endSeconds: 3 }],
    });
    const pf = buildVideoEditProjectFile({
      title: '测试主题',
      totalDurationSeconds: 270,
      audioUrl: 'https://example.com/a.mp3',
      segments,
      renderPlan: ['gsap-html-animation'],
      aspectRatio: '16:9',
    });
    expect(pf.project.timeline.duration).toBe(270);
    const audio = pf.project.timeline.tracks.find((t) => t.type === 'audio');
    expect(audio?.clips[0]?.duration).toBe(270);
    const video = pf.project.timeline.tracks.find((t) => t.type === 'video');
    const sum = (video?.clips ?? []).reduce((s, c) => s + c.duration, 0);
    expect(sum).toBeCloseTo(270, 1);
  });

  it('static-image 段写入检索词且不写 mxmPrompt', () => {
    const segments = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 10,
      segmentsRaw: {
        segments: [
          {
            text: '工厂光伏屋顶',
            startSeconds: 0,
            durationSeconds: 10,
            mxmRenderMode: 'static-image',
            mxmStockSearchQuery: 'solar panel factory rooftop innovation',
            keywords: ['solar panel', 'rooftop'],
            mxmPrompt: 'should be ignored for static',
          },
        ],
      },
    });
    const pf = buildVideoEditProjectFile({
      title: '绿色能源',
      totalDurationSeconds: 10,
      segments,
      renderPlan: ['static-image'],
      aspectRatio: '16:9',
    });
    const clip = pf.project.timeline.tracks.find((t) => t.type === 'video')?.clips[0];
    expect(clip?.metadata?.mxmStockSearchQuery).toContain('solar');
    expect(clip?.metadata?.mxmStockSearchQuery).not.toContain('innovation');
    expect(clip?.metadata?.mxmPrompt).toBeUndefined();
  });

  it('ai-video-gen 无 prompt 时自动补齐 mxmVideoPrompt 与统一风格', () => {
    const segments = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 8,
      segmentsRaw: {
        segments: [
          {
            text: '实验室显微镜观察细胞',
            voiceover_text: '科学家在显微镜下观察',
            startSeconds: 0,
            durationSeconds: 8,
            mxmRenderMode: 'ai-video-gen',
          },
        ],
      },
    });
    const pf = buildVideoEditProjectFile({
      title: '细胞研究',
      totalDurationSeconds: 8,
      segments,
      renderPlan: ['ai-video-gen'],
      editStyle: 'science-minimal',
      aspectRatio: '16:9',
    });
    const meta = pf.project.timeline.tracks.find((t) => t.type === 'video')?.clips[0]?.metadata;
    expect(meta?.mxmVideoPrompt?.length).toBeGreaterThan(30);
    expect(meta?.mxmVideoPrompt).toMatch(/Video about/i);
    expect(meta?.mxmVisualStyle).toBe('minimal_clean');
  });

  it('legacy gsap shot-list 构建为 static-image + textClips overlay', () => {
    const segments = resolveTimelineVisualSegments({
      strategy: 'shot-list',
      totalDurationSeconds: 12,
      segmentsRaw: {
        segments: [
          {
            text: '数据对比信息图',
            startSeconds: 0,
            durationSeconds: 12,
            mxmRenderMode: 'gsap-html-animation',
            mxmGsapSceneBrief: '柱状图 / 三组数据 / 左侧图例 / stagger 生长动效',
          },
        ],
      },
    });
    const pf = buildVideoEditProjectFile({
      title: '测试主题',
      totalDurationSeconds: 12,
      segments,
      renderPlan: ['static-image'],
      aspectRatio: '16:9',
    });
    const clip = pf.project.timeline.tracks.find((t) => t.type === 'video')?.clips[0];
    expect(clip?.metadata?.mxmRenderMode).toBe('static-image');
    expect(pf.project.textClips?.length).toBeGreaterThan(0);
  });
});
