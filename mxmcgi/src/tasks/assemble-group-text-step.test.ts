import { describe, expect, it } from 'vitest';
import type { TaskContext } from './types';
import {
  buildPieceDisplayLabel,
  extractManuscriptTitle,
  runAssembleGroupTextStep,
} from './assemble-group-text-step';

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

describe('extractManuscriptTitle / buildPieceDisplayLabel', () => {
  it('从 H1 抽标题', () => {
    expect(extractManuscriptTitle('# 三年茶凉\n\n正文')).toBe('三年茶凉');
  });

  it('拼文章标题 · 文风', () => {
    const d = buildPieceDisplayLabel({
      manuscript: '# 三年茶凉\n\n正文',
      item: { voice_id: 'cn_cold_irony' },
      index: 0,
      lang: 'zh',
    });
    expect(d.articleTitle).toBe('三年茶凉');
    expect(d.styleLabel).toBe('鲁迅式冷峭');
    expect(d.pieceLabel).toBe('三年茶凉 · 鲁迅式冷峭');
  });
});

describe('assembleGroupText', () => {
  it('拼接多路 manuscript 且篇名片用标题·风格', async () => {
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
    expect(text).toContain('## 档案 · 档案编年');
    expect(text).not.toMatch(/"variants"\s*:/);
    expect(text).not.toMatch(/## 路线\s+\d/);
    const meta = (out.state.coreArtifact as { metadata?: Record<string, unknown> }).metadata;
    expect(meta?.resultKind).toBe('writing-collection');
    expect(meta?.collectionReadyCount).toBe(2);
    const collection = meta?.collectionResult as {
      items: Array<{ title: string; name?: string; manuscript?: string }>;
    };
    expect(collection.items).toHaveLength(2);
    expect(collection.items[0]?.manuscript).toContain('正文甲');
    expect(collection.items[0]?.title).toBe('档案 · 档案编年');
    expect(collection.items[0]?.name).toBeUndefined();
  });

  it('voice_id 解析为预设文风名', async () => {
    const ctx = makeCtx();
    (ctx.state.contract as { business: { variants: Record<string, unknown>[] } }).business.variants =
      [
        {
          voice_id: 'cn_cold_irony',
          manuscript: '# 三年茶凉\n\n正文',
        },
      ];
    const out = await runAssembleGroupTextStep(ctx, {
      step: 'assembleGroupText',
      params: { itemsFrom: 'contract.business.variants' },
    });
    const collection = (
      out.state.coreArtifact as {
        metadata?: { collectionResult?: { items: Array<{ title: string; name?: string }> } };
      }
    ).metadata?.collectionResult;
    expect(collection?.items[0]?.title).toBe('三年茶凉 · 鲁迅式冷峭');
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
