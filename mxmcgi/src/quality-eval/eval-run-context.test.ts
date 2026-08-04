import { describe, expect, it } from 'vitest';
import {
  countManuscriptChars,
  extractEvalRunContextFromTask,
  formatEvalRunContextForPrompt,
  scoreLengthFit,
} from './eval-run-context';

describe('eval-run-context', () => {
  it('counts manuscript chars without markdown noise', () => {
    const md = '# 标题\n\n据“工委”报道，收入 **1884** 亿元。\n\n- a\n- b\n';
    expect(countManuscriptChars(md)).toBeGreaterThan(10);
    expect(countManuscriptChars(md)).toBeLessThan(md.length);
  });

  it('scores length fit inside/outside band', () => {
    const band = { key: 'brief', label: '简短', minChars: 500, maxChars: 800 };
    expect(scoreLengthFit(600, band).score).toBeGreaterThanOrEqual(90);
    expect(scoreLengthFit(200, band).score).toBeLessThan(70);
    expect(scoreLengthFit(2000, band).score).toBeLessThan(70);
  });

  it('extracts options from task requestParams', () => {
    const ctx = extractEvalRunContextFromTask({
      requestParams: {
        article_length: 'brief',
        subjective_analysis: false,
        analysis_stance: '',
        industry: '游戏',
      },
    });
    expect(ctx.articleLength).toBe('brief');
    expect(ctx.subjectiveAnalysis).toBe(false);
    expect(ctx.industry).toBe('游戏');
  });

  it('extracts options from nested requestParams.params (Task V2 input_data shape)', () => {
    const ctx = extractEvalRunContextFromTask({
      requestParams: {
        params: {
          article_length: 'standard',
          subjective_analysis: true,
          analysis_stance: '基于数据客观分析',
          industry: '股票',
        },
        taskV2: { taskKey: 'generator' },
      },
    });
    expect(ctx.articleLength).toBe('standard');
    expect(ctx.subjectiveAnalysis).toBe(true);
    expect(ctx.industry).toBe('股票');
    expect(ctx.analysisStance).toMatch(/客观/);
  });

  it('formats humor stance into dynamic criteria', () => {
    const text = formatEvalRunContextForPrompt(
      {
        articleLength: 'standard',
        subjectiveAnalysis: true,
        analysisStance: '基于数据幽默分析',
      },
      900
    );
    expect(text).toMatch(/幽默/);
    expect(text).toMatch(/禁止一套死板标准|按选项|诙谐/);
  });

  it('does not claim user omitted length when nested params provide band', () => {
    const ctx = extractEvalRunContextFromTask({
      requestParams: { params: { article_length: 'brief' } },
    });
    const text = formatEvalRunContextForPrompt(ctx, 650);
    expect(text).toMatch(/brief|简短/);
    expect(text).not.toMatch(/未能解析到 article_length|用户未提供/);
  });
});
