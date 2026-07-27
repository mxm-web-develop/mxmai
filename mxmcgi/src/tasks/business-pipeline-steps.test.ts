import { describe, expect, it, vi } from 'vitest';
import type { PipelineStep, TaskContext } from './types';
import { runPolishManuscriptStep } from './business-pipeline-steps';

const baseCtx: TaskContext = {
  scope: 'writing',
  taskKey: 'group',
  subtype: 'seek',
  userId: 'u-1',
  taskId: 't-1',
  params: { language: 'zh' },
  state: {
    contract: { basic: { language: 'zh' }, business: {} },
    coreArtifact: {
      kind: 'text',
      text: '押在那张泛黄的照片上，思绪万千，所以先抛立场。',
      metadata: {},
    },
  },
};

describe('runPolishManuscriptStep', () => {
  it('空文本短路返回原 ctx', async () => {
    const ctx = { ...baseCtx, state: { ...baseCtx.state, coreArtifact: { kind: 'text', text: '', metadata: {} } } };
    const out = await runPolishManuscriptStep(ctx, { step: 'polishManuscript' });
    expect(out).toBe(ctx);
  });

  it('调用 prose-deai 并写回 coreArtifact/finalArtifact', async () => {
    const runTaskV2 = vi.fn(async () => ({
      success: true,
      taskId: 'sub-1',
      scope: 'text',
      taskKey: 'transform',
      subtype: 'prose-deai',
      status: 'completed',
      syncResult: {
        text: '改写后的中文文本，去掉翻译腔。',
        metadata: { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }, costUsd: 0.001 },
      },
    }));
    vi.doMock('./task-engine', () => ({ runTaskV2 }));

    const step: PipelineStep = {
      step: 'polishManuscript',
      params: { nestedTextTaskKey: 'text/transform/prose-deai' },
    };
    const out = await runPolishManuscriptStep(baseCtx, step);

    expect(runTaskV2).toHaveBeenCalledOnce();
    const req = runTaskV2.mock.calls[0][0];
    expect(req.scope).toBe('text');
    expect(req.taskKey).toBe('transform');
    expect(req.subtype).toBe('prose-deai');
    expect(req.params.input).toContain('押在那张');
    expect(typeof req.params.instruction).toBe('string');

    const core = out.state.coreArtifact as { text: string; metadata?: Record<string, unknown> };
    expect(core.text.length).toBeGreaterThan(0);
    expect(core.metadata?.polishManuscriptTaskKey).toBe('text/transform/prose-deai');
    expect((out.state.finalArtifact as { text?: string }).text).toBe(core.text);
    expect((out.state.pipelineNestedUsage as unknown[]).length).toBeGreaterThan(0);
  });

  it('拒绝非 text/transform/* 子业务', async () => {
    await expect(
      runPolishManuscriptStep(baseCtx, {
        step: 'polishManuscript',
        params: { nestedTextTaskKey: 'text/plan/album-spec' },
      })
    ).rejects.toThrow(/仅允许 text\/transform\/\*/);
  });
});