import { describe, expect, it } from 'vitest';
import { effectiveTaskStatus, normalizeStaleTaskStatus } from './task-status-normalize';
import type { Task } from './types';

const base = (over: Partial<Task>): Task =>
  ({
    id: 't1',
    type: 'audio',
    status: 'awaiting_review',
    progress: { status: 'awaiting_review', progress: 35 },
    metadata: { model: 'm', provider: 'p', userId: 'u' },
    createdAt: new Date(),
    updatedAt: new Date(),
    requestParams: {},
    ...over,
  }) as Task;

describe('effectiveTaskStatus', () => {
  it('returns completed when awaiting_review but output exists with completedAt', () => {
    expect(
      effectiveTaskStatus(
        base({
          result: { mediaUrls: ['https://x/a.mp3'] },
          progress: {
            status: 'awaiting_review',
            progress: 35,
            completedAt: new Date(),
          },
        })
      )
    ).toBe('completed');
  });

  it('returns completed when awaiting_review but media output exists (even if progress stuck at 35%)', () => {
    expect(
      effectiveTaskStatus(
        base({
          result: { mediaUrls: ['https://x/a.mp3'] },
        })
      )
    ).toBe('completed');
  });

  it('keeps awaiting_review when no output', () => {
    expect(effectiveTaskStatus(base())).toBe('awaiting_review');
  });

  it('keeps awaiting_review when manualReviewGate exists without media even if completedAt set', () => {
    expect(
      effectiveTaskStatus(
        base({
          status: 'completed',
          progress: {
            status: 'completed',
            progress: 85,
            completedAt: new Date(),
          },
          metadata: {
            model: 'm',
            provider: 'p',
            userId: 'u',
            manualReviewGate: { gateId: 'g1', kind: 'video-timeline' },
          },
          result: { hasMedia: false, mediaCount: 0 },
        })
      )
    ).toBe('awaiting_review');
  });

  it('returns awaiting_user_input when gate is interactive-card and no output', () => {
    expect(
      effectiveTaskStatus(
        base({
          status: 'awaiting_review',
          metadata: {
            model: 'm',
            provider: 'p',
            userId: 'u',
            manualReviewGate: { gateId: 'g1', kind: 'interactive-card' },
          },
        })
      )
    ).toBe('awaiting_user_input');
  });

  it('returns awaiting_user_input when gate is basic-form and no output', () => {
    expect(
      effectiveTaskStatus(
        base({
          status: 'awaiting_user_input',
          metadata: {
            model: 'm',
            provider: 'p',
            userId: 'u',
            manualReviewGate: { gateId: 'g1', kind: 'basic-form' },
          },
        })
      )
    ).toBe('awaiting_user_input');
  });

  it('still returns completed when interactive-card gate exists but media already produced', () => {
    expect(
      effectiveTaskStatus(
        base({
          result: { mediaUrls: ['https://x/a.mp3'] },
          metadata: {
            model: 'm',
            provider: 'p',
            userId: 'u',
            manualReviewGate: { gateId: 'g1', kind: 'interactive-card' },
          },
        })
      )
    ).toBe('completed');
  });
});

describe('normalizeStaleTaskStatus', () => {
  it('repairs stale status to completed', () => {
    const { task, repaired } = normalizeStaleTaskStatus(
      base({
        result: { mediaUrls: ['https://x/a.mp3'] },
        progress: { status: 'awaiting_review', progress: 100, completedAt: new Date() },
      })
    );
    expect(repaired).toBe(true);
    expect(task.status).toBe('completed');
    expect(task.progress.progress).toBe(100);
  });
});
