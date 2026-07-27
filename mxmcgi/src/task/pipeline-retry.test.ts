import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import {
  buildPipelineFailureSnapshot,
  estimatePipelineRetryProgress,
  getMergedPipelineState,
  preparePipelineRetryExecute,
} from './pipeline-retry';

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    type: 'video',
    status: 'failed',
    progress: { status: 'failed', error: 'network' },
    requestParams: {},
    metadata: { userId: 'u1', model: 'x', provider: 'internal' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Task;
}

describe('preparePipelineRetryExecute', () => {
  it('keeps pre-done state for media retry', () => {
    const task = baseTask({
      requestParams: {
        businessPipelineState: {
          businessPipelinePreDone: true,
          finalPrompt: 'hello',
          videoEditScriptJson: { project: {} },
        },
      },
    });
    const prepared = preparePipelineRetryExecute(task);
    const bps = prepared.updatedParams.businessPipelineState as Record<string, unknown>;
    expect(bps.businessPipelinePreDone).toBe(true);
    expect(bps.finalPrompt).toBe('hello');
    expect(prepared.resumeProgress).toBeGreaterThan(40);
  });

  it('clears failed nested render pointer but keeps pendingPostResult', () => {
    const pending = { text: 'x', mediaUrls: [] };
    const task = baseTask({
      requestParams: {
        businessPipelineState: {
          businessPipelinePostDeferred: true,
          pendingPostResult: pending,
          nestedVideoRenderPending: true,
          videoEditRenderTaskId: 'render-child-1',
          reviewCheckpoint: { phase: 'post', stepIndex: 2, completedGateIds: ['plan'] },
        },
      },
    });
    const prepared = preparePipelineRetryExecute(task);
    const bps = prepared.updatedParams.businessPipelineState as Record<string, unknown>;
    expect(bps.pendingPostResult).toEqual(pending);
    expect(bps.videoEditRenderTaskId).toBeUndefined();
    expect(bps.pipelineRenderRetry).toBe(true);
    expect(prepared.resumeDeferredPost).toBe(true);
  });
});

describe('buildPipelineFailureSnapshot', () => {
  it('marks pipelineRetryEligible', () => {
    const snap = buildPipelineFailureSnapshot(baseTask(), { finalPrompt: 'p' });
    const bps = snap.businessPipelineState as Record<string, unknown>;
    expect(bps.pipelineRetryEligible).toBe(true);
    expect(bps.finalPrompt).toBe('p');
  });
});

describe('estimatePipelineRetryProgress', () => {
  it('returns higher progress for post render phase', () => {
    expect(
      estimatePipelineRetryProgress(
        { reviewCheckpoint: { phase: 'post', stepIndex: 1, completedGateIds: [] } },
        'video'
      )
    ).toBeGreaterThan(80);
  });
});

describe('getMergedPipelineState', () => {
  it('merges nested render pointers from metadata and params.businessPipelineState', () => {
    const task = baseTask({
      requestParams: {
        params: {
          businessPipelineState: {
            pendingPostResult: { text: 'x' },
            businessPipelinePostDeferred: true,
          },
        },
      },
      metadata: {
        userId: 'u1',
        model: 'video-pipeline-orchestrator',
        provider: 'internal',
        nestedVideoRenderPending: true,
        videoEditRenderTaskId: 'render-1',
      },
    });
    const merged = getMergedPipelineState(task);
    expect(merged.pendingPostResult).toEqual({ text: 'x' });
    expect(merged.nestedVideoRenderPending).toBe(true);
    expect(merged.videoEditRenderTaskId).toBe('render-1');
  });

  it('does not let stale metadata override cleared nested pending in businessPipelineState', () => {
    const task = baseTask({
      requestParams: {
        businessPipelineState: {
          nestedVideoRenderPending: false,
          videoEditRenderTaskId: 'render-old',
          videoEditRenderStepIndex: 1,
        },
      },
      metadata: {
        userId: 'u1',
        nestedVideoRenderPending: true,
        videoEditRenderTaskId: 'render-stale',
      },
    });
    const merged = getMergedPipelineState(task);
    expect(merged.nestedVideoRenderPending).toBe(false);
    expect(merged.videoEditRenderTaskId).toBe('render-old');
    expect(merged.videoEditRenderStepIndex).toBe(1);
  });
});
