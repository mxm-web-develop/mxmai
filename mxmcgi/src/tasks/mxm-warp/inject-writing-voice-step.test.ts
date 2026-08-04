import { describe, expect, it, vi } from 'vitest';
import { runInjectWritingVoiceStep } from './inject-writing-voice-step';
import type { TaskContext } from '../types';
import { KB_WRITING_VOICE_ID } from '../writing-style-presets/writing-voice-presets';

vi.mock('../../folder-cards/resolve-card-assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../folder-cards/resolve-card-assets')>();
  return {
    ...actual,
    resolveCardNeed: vi.fn(async (_userId: string, folderId: string, need: string) => {
      if (need === 'writing_summary' && folderId === 'wf-ready') {
        return '短句为主\ntone: 冷静\nlexicon: 少形容词';
      }
      throw new Error(`unexpected resolveCardNeed ${need} ${folderId}`);
    }),
  };
});

function baseCtx(basic: Record<string, unknown>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'topic-article',
    taskId: 't-test',
    userId: 'u-test',
    params: { ...basic },
    state: {
      contract: {
        meta: {
          version: 'mxm-warp/1',
          scope: 'writing',
          taskKey: 'generator',
          subtype: 'topic-article',
          taskId: 't-test',
        },
        basic,
        business: {},
      },
    },
  };
}

describe('injectWritingVoice', () => {
  it('loads talk_brief pack into business.voice_injection only for selected id', async () => {
    const out = await runInjectWritingVoiceStep(
      baseCtx({
        language: 'zh',
        voice_category: 'talk_brief',
        voice_id: 'talk_luyu',
        topic: '成名前后的朋友圈',
        purpose: 'investigative', // 误选也应被类别覆盖
      }),
      { step: 'injectWritingVoice' }
    );
    const contract = out.state.contract as {
      basic: { purpose?: string };
      business: { voice_injection: string; voice_profile: { voice_id: string } };
    };
    expect(contract.business.voice_profile.voice_id).toBe('talk_luyu');
    expect(contract.basic.purpose).toBe('talk_show_brief');
    expect(out.params.purpose).toBe('talk_show_brief');
    expect(contract.business.voice_injection).toContain('talk_luyu');
    expect(contract.business.voice_injection).toContain('谈话资料形态');
    expect(contract.business.voice_injection).not.toContain('talk_qq_three');
    expect(contract.business.voice_injection).not.toMatch(/鲁豫/);
  });

  it('loads fanqie fiction_pack for selected leaf', async () => {
    const out = await runInjectWritingVoiceStep(
      baseCtx({
        language: 'zh',
        voice_id: 'fq_shenhao',
        topic: '第一桶金',
        article_length: 'standard',
      }),
      { step: 'injectWritingVoice' }
    );
    const contract = out.state.contract as {
      basic: { purpose?: string; article_length_guide?: string };
      business: { voice_profile: { fiction_pack?: { platform?: string } }; voice_injection: string };
    };
    expect(contract.business.voice_profile.fiction_pack?.platform).toBe('fanqie');
    expect(contract.basic.purpose).toBe('fiction_short');
    expect(contract.basic.article_length_guide).toMatch(/中篇/);
    expect(contract.basic.article_length_guide).toMatch(/3500/);
    expect(out.params.article_length_guide).toMatch(/3500/);
    expect(contract.business.voice_injection).toContain('叙事节拍');
  });

  it('injects knowledge-base writing card when voice_id=kb_writing', async () => {
    const out = await runInjectWritingVoiceStep(
      baseCtx({
        language: 'zh',
        voice_category: 'self_media',
        voice_id: KB_WRITING_VOICE_ID,
        writing_folder_id: 'wf-ready',
        topic: '平台流量账',
        article_length: 'standard',
      }),
      { step: 'injectWritingVoice' }
    );
    const contract = out.state.contract as {
      basic: { purpose?: string; writing_summary?: string; writing_folder_id?: string };
      business: { voice_injection: string; voice_profile: { voice_id: string } };
    };
    expect(contract.business.voice_profile.voice_id).toBe(KB_WRITING_VOICE_ID);
    expect(contract.basic.purpose).toBe('publish_article');
    expect(contract.basic.writing_folder_id).toBe('wf-ready');
    expect(contract.basic.writing_summary).toContain('短句为主');
    expect(contract.business.voice_injection).toContain('知识库文风卡');
    expect(contract.business.voice_injection).toContain('短句为主');
    expect(out.params.writing_summary).toContain('lexicon');
  });

  it('rejects kb_writing without writing_folder_id', async () => {
    await expect(
      runInjectWritingVoiceStep(
        baseCtx({
          language: 'zh',
          voice_category: 'self_media',
          voice_id: KB_WRITING_VOICE_ID,
          topic: '无卡',
        }),
        { step: 'injectWritingVoice' }
      )
    ).rejects.toThrow(/语感文风卡/);
  });
});
