import { describe, expect, it } from 'vitest';
import type { TaskContext } from './types';
import { runAssembleGroupTextStep } from './assemble-group-text-step';

function makeCtx(): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'group',
    subtype: 'seek',
    userId: 'u1',
    taskId: 't1',
    params: { topic: '罗斯威尔UFO调查' },
    state: {
      contract: {
        meta: { version: '1', scope: 'writing', taskKey: 'group', subtype: 'seek', taskId: 't1' },
        basic: {
          topic: '罗斯威尔UFO调查',
          structure_divergence: 8,
          style_divergence: 5,
        },
        business: {
          variants: [
            {
              name: '档案编年',
              angle: '按时间线还原',
              manuscript: '# 档案\n\n正文甲',
            },
            {
              name: '段子速览',
              angle: '幽默盘点',
              manuscript: '# 段子\n\n正文乙',
            },
          ],
        },
        sources: {},
        assets: {},
        enrich_search: {},
      },
    },
  };
}

describe('assembleGroupText', () => {
  it('拼接多路 manuscript 且标题用用户话题', async () => {
    const out = await runAssembleGroupTextStep(makeCtx(), {
      step: 'assembleGroupText',
      params: {
        itemsFrom: 'contract.business.variants',
        textField: 'manuscript',
        titleFrom: 'contract.basic.topic',
        introTemplate: '围绕「${contract.basic.topic}」产出 ${total} 路',
      },
    });
    const text = String(out.state.groupAssembledText ?? '');
    expect(text).toContain('罗斯威尔UFO调查');
    expect(text).toContain('正文甲');
    expect(text).toContain('正文乙');
    expect(text).not.toMatch(/"variants"\s*:/);
    const meta = (out.state.coreArtifact as { metadata?: Record<string, unknown> }).metadata;
    expect(meta?.resultKind).toBe('writing-collection');
    expect(meta?.collectionReadyCount).toBe(2);
    const collection = meta?.collectionResult as {
      items: Array<{ title: string; manuscript?: string }>;
    };
    expect(collection.items).toHaveLength(2);
    expect(collection.items[0]?.manuscript).toContain('正文甲');
  });

  it('全部无成稿时抛错', async () => {
    const ctx = makeCtx();
    (ctx.state.contract as { business: { variants: { manuscript?: string }[] } }).business.variants =
      [{ name: 'a' }, { name: 'b' }];
    await expect(
      runAssembleGroupTextStep(ctx, {
        step: 'assembleGroupText',
        params: { itemsFrom: 'contract.business.variants' },
      })
    ).rejects.toThrow(/均无/);
  });
});
