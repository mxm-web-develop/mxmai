import { describe, expect, it } from 'vitest';
import {
  buildContractAssetsFromParams,
  promoteParamsAssetsToContract,
} from './promote-assets';
import { emptyContract } from './contract-types';
import type { TaskContext } from '../types';

describe('promoteParamsAssetsToContract', () => {
  it('builds cards/media/folders from params', () => {
    const built = buildContractAssetsFromParams(
      {
        writing_summary: '冷静克制',
        writing_folder_id: 'wf-1',
        style_ref_images: ['https://a/1.png', 'https://a/2.png'],
        model_images: [{ content: 'https://m/1.png', groupKey: 'model_images' }],
      },
      {
        type: 'object',
        properties: {
          model_images: {
            'x-ui-type': 'referenceImages',
            title: '模特',
            description: '全身模特参考',
          },
        },
      }
    );
    expect(built.cards.writing_summary).toBe('冷静克制');
    expect(built.folders.writing_folder_id).toBe('wf-1');
    expect(built.media.style_ref_images).toMatchObject({ count: 2 });
    expect(built.media.model_images).toMatchObject({
      count: 1,
      role: 'model_images',
      title: '模特',
      purpose: '全身模特参考',
    });
  });

  it('merges into contract.assets', () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'generator',
      taskId: 't1',
      params: {
        writing_summary: '口语短句',
        knowledge_folder_id: 'kb-1',
        kb_recall_block: '知识片段A',
      },
      state: {
        contract: emptyContract({
          version: 1,
          scope: 'writing',
          taskKey: 'generator',
          subtype: 'industry-daily',
          taskId: 't1',
        }),
      },
    };
    const out = promoteParamsAssetsToContract(ctx);
    const assets = (out.state.contract as { assets: { cards: Record<string, unknown>; folders: Record<string, unknown> } })
      .assets;
    expect(assets.cards.writing_summary).toBe('口语短句');
    expect(assets.cards.kb_recall_block).toBe('知识片段A');
    expect(assets.folders.knowledge_folder_id).toBe('kb-1');
  });
});
