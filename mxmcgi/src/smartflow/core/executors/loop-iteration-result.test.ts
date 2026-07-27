import { describe, it, expect } from 'vitest';
import {
  applyIterationErrorPolicy,
  extractMediaUrlsFromOutput,
  extractTaskIdFromOutput,
  normalizeIterationRow,
} from './loop-iteration-result';

describe('loop-iteration-result', () => {
  it('extracts taskId from business output', () => {
    expect(extractTaskIdFromOutput({ taskId: 't-1' })).toBe('t-1');
    expect(extractTaskIdFromOutput({ data: { taskId: 't-2' } })).toBe('t-2');
  });

  it('extracts mediaUrls from business output', () => {
    expect(
      extractMediaUrlsFromOutput({
        taskId: 't-1',
        mediaUrls: ['https://cdn/a.png'],
      })
    ).toEqual(['https://cdn/a.png']);
    expect(
      extractMediaUrlsFromOutput({
        syncResult: { mediaUrls: ['https://cdn/b.png'] },
      })
    ).toEqual(['https://cdn/b.png']);
  });

  it('normalizeIterationRow on success', () => {
    const row = normalizeIterationRow(0, {
      success: true,
      output: { taskId: 'abc', mediaUrls: ['https://cdn/x.png'] },
    });
    expect(row).toEqual({
      index: 0,
      success: true,
      taskId: 'abc',
      mediaUrls: ['https://cdn/x.png'],
      output: { taskId: 'abc', mediaUrls: ['https://cdn/x.png'] },
    });
  });

  it('normalizeIterationRow on failure', () => {
    const row = normalizeIterationRow(1, { success: false, error: 'boom' });
    expect(row.success).toBe(false);
    expect(row.error).toBe('boom');
  });

  it('collect_errors keeps all rows', () => {
    const rows = [
      { index: 0, success: true, taskId: 'a' },
      { index: 1, success: false, error: 'e' },
    ];
    const r = applyIterationErrorPolicy(rows, 'collect_errors');
    expect(r.results).toHaveLength(2);
    expect(r.loopSuccess).toBe(true);
    expect(r.failedCount).toBe(1);
  });

  it('skip filters failed rows', () => {
    const rows = [
      { index: 0, success: true, taskId: 'a' },
      { index: 1, success: false, error: 'e' },
      { index: 2, success: true, taskId: 'b' },
    ];
    const r = applyIterationErrorPolicy(rows, 'skip');
    expect(r.results).toHaveLength(2);
    expect(r.results.every((x) => x.success)).toBe(true);
  });

  it('fail_fast fails loop when any failure', () => {
    const rows = [{ index: 0, success: true }, { index: 1, success: false, error: 'x' }];
    const r = applyIterationErrorPolicy(rows, 'fail_fast');
    expect(r.loopSuccess).toBe(false);
    expect(r.loopError).toBe('x');
  });
});
