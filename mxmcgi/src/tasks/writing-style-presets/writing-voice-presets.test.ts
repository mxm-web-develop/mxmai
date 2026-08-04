import { describe, expect, it } from 'vitest';
import {
  formatVoiceInjection,
  getSearchAngles,
  getTopicHints,
  getVoiceCategory,
  listCatalogVoices,
  listVoiceCategories,
  resolveVoiceForModelAsync,
} from './writing-voice-presets';

describe('writing-voice-presets (catalog + talk_brief pack)', () => {
  it('lists talk_brief category with packFile', () => {
    const cat = getVoiceCategory('talk_brief');
    expect(cat?.packFile).toBe('talk_brief');
    expect(listVoiceCategories().some((c) => c.id === 'talk_brief')).toBe(true);
  });

  it('catalog voices for talk_brief are light (no craft on catalog entries)', () => {
    const list = listCatalogVoices({ voiceCategory: 'talk_brief', language: 'zh' });
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((v) => v.voice_category === 'talk_brief')).toBe(true);
    expect(list.some((v) => v.id === 'talk_qq_three')).toBe(true);
    expect((list[0] as { craft?: unknown }).craft).toBeUndefined();
  });

  it('topic hints prefer voice then category (craft, not search)', () => {
    const hints = getTopicHints({
      voiceCategory: 'talk_brief',
      voiceId: 'talk_luyu',
    });
    expect(hints[0]).toMatch(/生命叙事|情绪|时间线/);
    expect(hints.length).toBeGreaterThan(2);
  });

  it('search_angles describe subject types, not show names', () => {
    const angles = getSearchAngles({
      voiceCategory: 'talk_brief',
      voiceId: 'talk_yuanzhuo',
    });
    expect(angles.some((a) => /多切面|代际|机制/.test(a))).toBe(true);
    expect(angles.every((a) => !/圆桌派|锵锵|鲁豫/.test(a))).toBe(true);
    const luyu = getSearchAngles({ voiceCategory: 'talk_brief', voiceId: 'talk_luyu' });
    expect(luyu.some((a) => /人物|命运|人生/.test(a))).toBe(true);
    expect(angles.join('|')).not.toBe(luyu.join('|'));
  });

  it('resolveVoiceForModelAsync injects only selected talk pack without UI show names', async () => {
    const m = await resolveVoiceForModelAsync('talk_qq_three', 'zh');
    expect(m?.voice_id).toBe('talk_qq_three');
    expect(m?.talk_pack?.format).toBe('roundtable_three');
    expect(m?.talk_pack?.dossier_sections.length).toBeGreaterThan(2);
    expect(m?.craft.sentence).toBeTruthy();
    const blob = JSON.stringify(m);
    expect(blob).not.toMatch(/锵锵|鲁豫|Oprah|HARDtalk|Fresh Air|圆桌派|面对面|杨澜/);
    expect((m as { label?: unknown }).label).toBeUndefined();
    expect((m as { uiAuthorHint?: unknown }).uiAuthorHint).toBeUndefined();
  });

  it('formatVoiceInjection stays scoped to one voice', async () => {
    const m = await resolveVoiceForModelAsync('talk_hardtalk', 'en');
    expect(m).toBeTruthy();
    const text = formatVoiceInjection(m!);
    expect(text).toContain('talk_hardtalk');
    expect(text).toContain('international_hard_talk');
    expect(text).not.toContain('talk_qq_three');
    expect(text).not.toContain('HARDtalk');
  });

  it('resolves literary / fanqie / finance packs by id', async () => {
    const lit = await resolveVoiceForModelAsync('cn_cold_irony', 'zh');
    expect(lit?.craft.sentence).toBeTruthy();
    expect(JSON.stringify(lit)).not.toMatch(/鲁迅/);

    const fq = await resolveVoiceForModelAsync('fq_zs_huigui', 'zh');
    expect(fq?.fiction_pack).toBeTruthy();

    const fin = await resolveVoiceForModelAsync('fin_bu_mian_night', 'zh');
    expect(fin?.report_pack).toBeTruthy();
  });

  it('catalog covers all registered pack categories', () => {
    const cats = listVoiceCategories().filter((c) => c.packFile);
    expect(cats.map((c) => c.id).sort()).toEqual(
      [
        'talk_brief',
        'literary_column',
        'fanqie_web',
        'hongguo_drama',
        'finance_narrative',
        'political_report',
        'self_media',
        'voiceover_brief',
        'course_tutorial',
      ].sort()
    );
    expect(listCatalogVoices().length).toBeGreaterThanOrEqual(80);
  });
});
