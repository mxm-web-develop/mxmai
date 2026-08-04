import { describe, expect, it } from 'vitest';
import {
  getSeekVoicePreset,
  listSeekGenrePresets,
  listSeekVoicePresets,
  resolveVoiceForModel,
} from './seek-voice-presets';

describe('seek-voice-presets', () => {
  it('has 48 voices', () => {
    expect(listSeekVoicePresets()).toHaveLength(48);
  });

  it('has the aligned 8 writing genres', () => {
    const ids = listSeekGenrePresets().map((g) => g.id);
    expect(ids).toEqual([
      'brief_flash',
      'deep_feature',
      'column_comment',
      'explainer',
      'profile_story',
      'list_compare',
      'social_post',
      'spoken_script',
    ]);
    expect(listSeekGenrePresets()[0]?.label.zh).toBe('短讯速报');
    expect(listSeekGenrePresets()[0]?.blurb?.zh).toMatch(/事实优先/);
  });

  it('resolveVoiceForModel omits author-style display names and personal names in craft', () => {
    const m = resolveVoiceForModel('cn_cold_irony', 'zh');
    expect(m?.voice_id).toBe('cn_cold_irony');
    expect(m?.craft.sentence).toBeTruthy();
    expect(m?.reference_paragraph).toMatch(/风口|纸片/);
    const blob = JSON.stringify(m);
    expect(blob).not.toMatch(/鲁迅|汪曾祺|Orwell|村上/);
    // UI label still has 式 — but model payload must not include label field
    expect((m as { label?: unknown }).label).toBeUndefined();
    const ui = getSeekVoicePreset('cn_cold_irony');
    expect(ui?.label.zh).toMatch(/鲁迅/);
  });
});
