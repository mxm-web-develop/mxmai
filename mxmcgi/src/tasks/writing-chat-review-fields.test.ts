import { describe, expect, it } from 'vitest';
import {
  applyWritingChatFieldValues,
  buildWritingChatInteractiveFields,
} from './writing-chat-review-fields';

describe('writing-chat-review-fields minimal contract', () => {
  const contract = {
    basic: { topic: '测试话题' },
    business: {
      variants: [
        {
          id: 'v1',
          name: '地质指纹',
          angle: '从地层切入',
          differentiation: '诗意空转',
          search_focus: '地球  大氧化  雪球',
          structure_plan: { skeleton: '调查报道', rationale: '没用' },
          style_profile: {
            persona: '冷静记者',
            voice: '多余口吻',
            reference_hint: '像某某杂志',
            humor_level: 3,
          },
        },
      ],
    },
  };

  it('builds one-screen fields without voice/skeleton/differentiation', () => {
    const fields = buildWritingChatInteractiveFields(contract, { step: 'interactiveCard' } as never);
    const names = fields.map((f) => f.name);
    expect(names).toContain('v__v1__name');
    expect(names).toContain('v__v1__angle');
    expect(names).toContain('v__v1__persona');
    expect(names).toContain('v__v1__humor_level');
    expect(names).toContain('v__v1__search_focus');
    expect(names.some((n) => n.endsWith('__voice'))).toBe(false);
    expect(names.some((n) => n.endsWith('__skeleton'))).toBe(false);
    expect(fields.find((f) => f.name === 'v__v1__search_focus')?.ui).toBe('tags');
  });

  it('apply writes structure+style and strips dead fields', () => {
    const next = applyWritingChatFieldValues(contract, {
      v__v1__name: '调查报道',
      v__v1__angle: '按时间线核查关键节点',
      v__v1__persona: '冷静调查记者，短句克制',
      v__v1__humor_level: '2',
      v__v1__search_focus: '地球时间线,大氧化,雪球地球',
    }) as {
      business: { variants: Array<Record<string, unknown>> };
    };
    const v = next.business.variants[0]!;
    expect(v.name).toBe('调查报道');
    expect(v.differentiation).toBeUndefined();
    expect((v.structure_plan as { skeleton: string; rationale?: string }).skeleton).toBe(
      '调查报道'
    );
    expect((v.structure_plan as { rationale?: string }).rationale).toBeUndefined();
    const sp = v.style_profile as Record<string, unknown>;
    expect(sp.persona).toBe('冷静调查记者，短句克制');
    expect(sp.voice).toBeUndefined();
    expect(sp.reference_hint).toBeUndefined();
    expect(sp.humor_level).toBe(2);
    expect(v.search_focus).toBe('地球时间线 大氧化 雪球地球');
  });
});
