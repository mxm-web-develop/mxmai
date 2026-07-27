import { describe, expect, it } from 'vitest';
import {
  formatWritingCollectionProgressHint,
  resolveWritingPipelinePhaseIndex,
  WRITING_PIPELINE_PHASES,
} from './writingPipelineProgress';

describe('writingPipelineProgress', () => {
  it('when phase and phaseIndex conflict, prefers the earlier phase', () => {
    expect(
      resolveWritingPipelinePhaseIndex({ phaseIndex: 4, progress: 90, phase: 'enrich' })
    ).toBe(2);
  });

  it('maps phase ids', () => {
    expect(resolveWritingPipelinePhaseIndex({ phase: 'enrich' })).toBe(2);
    expect(resolveWritingPipelinePhaseIndex({ phase: 'save' })).toBe(4);
  });

  it('caps at 成稿 while collection still incomplete', () => {
    expect(
      resolveWritingPipelinePhaseIndex({
        phase: 'post',
        phaseIndex: 4,
        progress: 95,
        status: 'processing',
        collectionReady: 2,
        collectionTotal: 3,
      })
    ).toBe(3);
  });

  it('does not light 收尾 from percent alone while still running', () => {
    expect(
      resolveWritingPipelinePhaseIndex({
        progress: 92,
        status: 'processing',
      })
    ).toBe(3);
  });

  it('formats collection progress hint', () => {
    expect(
      formatWritingCollectionProgressHint({
        message: '定制多路写作合同…',
        statusLabel: '生成中',
        ready: 2,
        total: 3,
        status: 'processing',
      })
    ).toBe('已成稿 2/3…');
  });

  it('has five labels', () => {
    expect(WRITING_PIPELINE_PHASES).toHaveLength(5);
  });
});
