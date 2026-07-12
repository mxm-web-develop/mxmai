import { describe, expect, it } from 'vitest';
import { buildStockSearchQuery, isAutoStockImageEnabled, isAutoStockVideoEnabled } from './stock-media-query';
import { resolveClipSubtitleSearchContext } from './stock-subtitle-context';
import type { MxmClipMetadata } from './types';

describe('stock-media-query', () => {
  it('defaults auto stock image on, video off', () => {
    expect(isAutoStockImageEnabled({} as MxmClipMetadata)).toBe(true);
    expect(isAutoStockVideoEnabled({} as MxmClipMetadata)).toBe(false);
  });

  it('normalizes english custom query (drop stopwords, cap words)', () => {
    const q = buildStockSearchQuery(
      {
        mxmStockSearchQuery: 'A humanoid robot walking in a modern factory, cinematic showing tech',
        mxmPrompt: 'ignored',
      } as MxmClipMetadata,
      'subtitle'
    );
    // 去停用词(a/in)与泛化词(showing)，限 5 词
    expect(q.split(' ').length).toBeLessThanOrEqual(5);
    expect(q).toContain('humanoid');
    expect(q).toContain('robot');
    expect(q).not.toContain('showing');
    // 中文/长句不会被透传
    expect(/[\u4e00-\u9fa5]/.test(q)).toBe(false);
  });

  it('falls back to english keywords when custom query is non-english', () => {
    const q = buildStockSearchQuery(
      {
        mxmStockSearchQuery: '机器人关节的特写镜头',
        mxmStockKeywords: ['Tesla Optimus', 'humanoid robot'],
      } as MxmClipMetadata,
      'subtitle'
    );
    expect(q).toBe('tesla optimus humanoid robot');
  });

  it('never sends chinese-only derivation to the image index', () => {
    const meta = {
      mxmPrompt:
        '深色极简科普画面，主题「中美人形机器人对比」，本段口播：「中美贸易摩擦升级」。',
    } as MxmClipMetadata;
    const q = buildStockSearchQuery(meta, '中美贸易摩擦升级', {
      projectTopic: '中美人形机器人对比',
      subtitleText: '中美贸易摩擦升级',
      contextSubtitles: '中美贸易摩擦升级 关税加征 供应链转移',
    });
    // 纯中文输入 → 归一化后不含中文（英文数字或回退 documentary b-roll）
    expect(/[\u4e00-\u9fa5]/.test(q)).toBe(false);
  });

  it('resolveClipSubtitleSearchContext expands neighbor subtitles', () => {
    const ctx = resolveClipSubtitleSearchContext(
      [
        { text: '上一句讲 AI 芯片', startTime: 150, endTime: 158 },
        { text: '跨境服务、', startTime: 161, endTime: 165 },
        { text: '下一句讲数据中心', startTime: 166, endTime: 174 },
      ],
      161,
      4,
      { projectTopic: 'AI 简报' }
    );
    expect(ctx.subtitleText).toBe('跨境服务、');
    expect(ctx.contextSubtitles).toContain('AI 芯片');
    expect(ctx.contextSubtitles).toContain('数据中心');
    expect(ctx.projectTopic).toBe('AI 简报');
  });
});
