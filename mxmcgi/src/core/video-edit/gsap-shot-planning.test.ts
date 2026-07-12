import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildShotListGsapParams, enrichGsapTimelineSegments, findRepoRoot } from './gsap-shot-planning';
import { buildShotListGsapContext } from '../../../../shared/gsap-storyboard/shot-list-context.mjs';
import { routeTopic } from '../../../../shared/gsap-storyboard/topic-router.mjs';

describe('findRepoRoot', () => {
  it('可定位 shared/gsap-storyboard', () => {
    const root = findRepoRoot();
    expect(existsSync(join(root, 'shared/gsap-storyboard/assemble.mjs'))).toBe(true);
  });
});

describe('gsap-shot-planning shared', () => {
  it('routeTopic 科普主题偏向 tech_terminal', () => {
    const r = routeTopic({ topic: '2026 人工智能发展趋势', editStyle: 'science-minimal' });
    expect(r.styleId).toBe('tech_terminal');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('buildShotListGsapContext 含 appendix 与 styleId', () => {
    const ctx = buildShotListGsapContext({
      topic: '世界杯决赛精彩瞬间',
      edit_style: 'motion-infographic',
      voiceover_subtitles_json: JSON.stringify({
        segments: [{ text: '阿根廷队反击进球', startSeconds: 0, endSeconds: 3 }],
      }),
    });
    expect(ctx.gsap_style_id).toBe('sports_broadcast');
    expect(String(ctx.gsap_shot_list_appendix)).toContain('title_card');
    expect(String(ctx.gsap_shot_list_appendix)).toContain('chart_line');
  });

  it('buildShotListGsapParams 动态加载 shared 模块', async () => {
    const params = await buildShotListGsapParams({
      topic: '量子计算入门',
      edit_style: 'science-minimal',
    });
    expect(params.gsap_style_id).toBe('tech_terminal');
    expect(String(params.gsap_shot_list_appendix)).toContain('title_card');
  });
});

describe('enrichGsapTimelineSegments', () => {
  it('为 GSAP 段补全 sceneType 与 styleId', async () => {
    const out = await enrichGsapTimelineSegments(
      [
        {
          startSeconds: 0,
          endSeconds: 8,
          text: '开场标题展示本期主题',
          mxmRenderMode: 'gsap-html-animation',
        },
        {
          startSeconds: 8,
          endSeconds: 20,
          text: '三组数据对比柱状图',
          mxmRenderMode: 'gsap-html-animation',
          mxmVoiceoverText: '销售额增长 40%',
        },
      ],
      { topic: 'AI 产业报告', defaultStyleId: 'tech_terminal' }
    );
    expect(out[0]?.mxmGsapStyleId).toBe('tech_terminal');
    expect(out[0]?.mxmGsapSceneType).toBeTruthy();
    expect(out[1]?.mxmGsapSceneType).toMatch(/bar_chart|chart_line|counter|kpi/i);
    expect(out[1]?.mxmGsapSceneData).toBeTruthy();
  });
});
