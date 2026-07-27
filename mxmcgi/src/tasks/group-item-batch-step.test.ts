import { describe, expect, it } from 'vitest';
import type { TaskContext } from './types';
import { resolveGroupItemTemplate, runGroupItemBatchStep } from './group-item-batch-step';

function makeCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'group',
    subtype: 'seek',
    userId: 'user-1',
    taskId: 'task-parent',
    params: {
      topic: '罗斯威尔UFO调查',
      model: 'MiniMax-M3',
      provider: 'maxplan',
      logicalModel: 'MiniMax-M3',
    },
    state: {
      contract: {
        meta: { version: '1', scope: 'writing', taskKey: 'group', subtype: 'seek', taskId: 'task-parent' },
        basic: {
          topic: '罗斯威尔UFO调查',
          language: 'zh',
          supplement: '',
          structure_divergence: 8,
          style_divergence: 8,
          seek_count: 2,
        },
        business: {
          variants: [
            {
              id: 'v1',
              name: '档案编年',
              angle: '按官方档案时间线还原',
              structure_plan: { skeleton: '编年调查体' },
              style_profile: { persona: '通讯社记者', humor_level: 1 },
              search_focus: '罗斯威尔 官方档案',
            },
            {
              id: 'v2',
              name: '段子手速览',
              angle: '幽默盘点各方说法',
              structure_plan: { skeleton: '清单体' },
              style_profile: { persona: '脱口秀', humor_level: 9 },
              search_focus: '罗斯威尔 流行文化',
            },
          ],
          common_ground: { facts: ['1947'], rules: ['不编造'] },
        },
        sources: { websource: { text: '共享证据', hitCount: 1, items: [] } },
        assets: {},
        enrich_search: {},
      },
    },
    ...overrides,
  };
}

describe('resolveGroupItemTemplate', () => {
  const ctx = makeCtx();
  const item = { name: '档案编年', search_focus: '官方档案' };

  it('保留单占位符类型', () => {
    expect(resolveGroupItemTemplate(ctx, item, 0, 2, '${item.search_focus}')).toBe('官方档案');
    expect(resolveGroupItemTemplate(ctx, item, 0, 2, '${contract.business.common_ground}')).toEqual({
      facts: ['1947'],
      rules: ['不编造'],
    });
  });

  it('混合模板字符串插值', () => {
    expect(
      resolveGroupItemTemplate(ctx, item, 0, 2, '${contract.basic.topic} ${item.search_focus}')
    ).toBe('罗斯威尔UFO调查 官方档案');
  });
});

describe('runGroupItemBatchStep', () => {
  it('空数组报错', async () => {
    const ctx = makeCtx({
      state: {
        contract: {
          meta: { version: '1', scope: 'writing', taskKey: 'group', subtype: 'seek', taskId: 't' },
          basic: {},
          business: { variants: [] },
          sources: {},
          assets: {},
          enrich_search: {},
        },
      },
    });
    await expect(
      runGroupItemBatchStep(ctx, {
        step: 'groupItemBatch',
        params: { itemsFrom: 'contract.business.variants' },
      })
    ).rejects.toThrow(/为空/);
  });

  it('无嵌套步骤时仍写回数组并标记 ready', async () => {
    const ctx = makeCtx();
    const out = await runGroupItemBatchStep(ctx, {
      step: 'groupItemBatch',
      params: {
        itemsFrom: 'contract.business.variants',
        concurrency: 2,
      },
    });
    const variants = (out.state.contract as { business: { variants: unknown[] } }).business.variants;
    expect(variants).toHaveLength(2);
    const batch = out.state.groupItemBatchResult as { readyCount: number; failedCount: number };
    expect(batch.readyCount).toBe(2);
    expect(batch.failedCount).toBe(0);
  });
});
