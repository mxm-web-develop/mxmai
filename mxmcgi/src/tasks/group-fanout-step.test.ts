import { describe, expect, it } from 'vitest';
import type { TaskContext } from './types';
import { resolveGroupFanoutTemplate, runGroupFanoutStep } from './group-fanout-step';

function makeCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'group',
    subtype: 'seek',
    userId: 'user-1',
    taskId: 'task-parent',
    params: { topic: '罗斯威尔UFO调查', supplement: '' },
    state: {
      contract: {
        meta: { version: '1', scope: 'writing', taskKey: 'group', subtype: 'seek', taskId: 'task-parent' },
        basic: { topic: '罗斯威尔UFO调查', language: 'zh', supplement: '' },
        business: {
          variants: [
            {
              id: 'v1',
              name: '档案编年',
              angle: '按官方档案时间线还原事件',
              structure_plan: { skeleton: '编年调查体', sections: [{ heading: '起点', intent: '事件起源' }] },
              style_profile: { persona: '通讯社记者', humor_level: 1 },
              search_focus: '罗斯威尔 官方档案 解密文件',
            },
            {
              id: 'v2',
              name: '段子手速览',
              angle: '用幽默视角盘点各方说法',
              structure_plan: { skeleton: '清单体', sections: [{ heading: '五种说法', intent: '盘点' }] },
              style_profile: { persona: '脱口秀段子手', humor_level: 9 },
              search_focus: '罗斯威尔 流行文化 阴谋论',
            },
          ],
          common_ground: { facts: ['1947 年事件'], rules: ['不得编造事实'] },
        },
        sources: {},
        assets: {},
        enrich_search: {},
      },
      coreArtifact: { kind: 'text', text: '# 总览', metadata: {} },
    },
    ...overrides,
  };
}

describe('resolveGroupFanoutTemplate', () => {
  const ctx = makeCtx();
  const item = { name: '档案编年', structure_plan: { skeleton: '编年调查体' } };

  it('单占位符保留原始类型', () => {
    const v = resolveGroupFanoutTemplate(ctx, item, 0, 2, '${item.structure_plan}');
    expect(v).toEqual({ skeleton: '编年调查体' });
    const cg = resolveGroupFanoutTemplate(ctx, item, 0, 2, '${contract.business.common_ground}');
    expect(cg).toEqual({ facts: ['1947 年事件'], rules: ['不得编造事实'] });
  });

  it('混合模板做字符串插值，index 从 1 起', () => {
    const v = resolveGroupFanoutTemplate(ctx, item, 1, 2, '${params.topic} · ${item.name}（${index}/${total}）');
    expect(v).toBe('罗斯威尔UFO调查 · 档案编年（2/2）');
  });

  it('缺失路径回退空串/空值', () => {
    expect(resolveGroupFanoutTemplate(ctx, item, 0, 2, '${item.nope}')).toBe('');
    expect(resolveGroupFanoutTemplate(ctx, item, 0, 2, 'a-${item.nope}-b')).toBe('a--b');
  });
});

describe('runGroupFanoutStep', () => {
  it('拒绝自递归派发', async () => {
    const ctx = makeCtx();
    await expect(
      runGroupFanoutStep(ctx, {
        step: 'groupFanout',
        params: {
          targetScope: 'writing',
          targetTaskKey: 'group',
          targetSubtype: 'seek',
          inputMapping: { topic: '${contract.basic.topic}' },
        },
      })
    ).rejects.toThrow(/自递归/);
  });

  it('缺 inputMapping / 空列表时报配置错误', async () => {
    const ctx = makeCtx();
    await expect(
      runGroupFanoutStep(ctx, {
        step: 'groupFanout',
        params: { targetScope: 'writing', targetTaskKey: 'generator', targetSubtype: 'seek-piece' },
      })
    ).rejects.toThrow(/inputMapping/);

    const emptyCtx = makeCtx();
    (emptyCtx.state.contract as { business: Record<string, unknown> }).business = { variants: [] };
    await expect(
      runGroupFanoutStep(emptyCtx, {
        step: 'groupFanout',
        params: {
          targetScope: 'writing',
          targetTaskKey: 'generator',
          targetSubtype: 'seek-piece',
          inputMapping: { topic: '${contract.basic.topic}' },
        },
      })
    ).rejects.toThrow(/无可派发/);
  });
});
