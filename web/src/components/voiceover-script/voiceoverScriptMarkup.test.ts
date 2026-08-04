import { describe, expect, it, beforeEach } from 'vitest';
import {
  addDialogueTurn,
  formatPauseTag,
  looksLikeDialogueScript,
  looksLikeVoiceoverTtsMarkup,
  parseVoiceoverDocument,
  parseVoiceoverMarkup,
  removeSegment,
  resetVoiceoverSegmentIdsForTests,
  serializeVoiceoverDocument,
  serializeVoiceoverMarkup,
  updatePauseSeconds,
} from './voiceoverScriptMarkup';

describe('voiceoverScriptMarkup', () => {
  beforeEach(() => {
    resetVoiceoverSegmentIdsForTests();
  });

  it('detects pause markup', () => {
    expect(looksLikeVoiceoverTtsMarkup('你好<#0.25#>世界')).toBe(true);
    expect(looksLikeVoiceoverTtsMarkup('普通口播稿')).toBe(false);
  });

  it('parses pauses, breath and particles', () => {
    const segs = parseVoiceoverMarkup('嗯，非洲有核反应堆<#0.25#>真的吗(breath)啊？');
    expect(segs.map((s) => s.kind)).toEqual([
      'particle',
      'text',
      'pause',
      'text',
      'particle',
      'sound',
      'particle',
      'text',
    ]);
    expect(serializeVoiceoverMarkup(segs)).toBe('嗯，非洲有核反应堆<#0.25#>真的吗(breath)啊？');
  });

  it('updates and removes pause', () => {
    let segs = parseVoiceoverMarkup('A<#0.25#>B');
    const pause = segs.find((s) => s.kind === 'pause');
    expect(pause?.kind).toBe('pause');
    if (!pause || pause.kind !== 'pause') return;
    segs = updatePauseSeconds(segs, pause.id, 0.5);
    expect(serializeVoiceoverMarkup(segs)).toBe('A<#0.5#>B');
    segs = removeSegment(segs, pause.id);
    expect(serializeVoiceoverMarkup(segs)).toBe('AB');
  });

  it('formats pause tag', () => {
    expect(formatPauseTag(0.25)).toBe('<#0.25#>');
    expect(formatPauseTag(1)).toBe('<#1#>');
  });

  it('parses multi-speaker dialogue with 【角色】', () => {
    const raw = `【主持人】今天我们聊史前文明<#0.3#>

【嘉宾】对，非洲有核反应堆(breath)真的吗？`;
    expect(looksLikeDialogueScript(raw)).toBe(true);
    const doc = parseVoiceoverDocument(raw);
    expect(doc.mode).toBe('dialogue');
    expect(doc.turns).toHaveLength(2);
    expect(doc.turns[0].speaker).toBe('主持人');
    expect(doc.turns[1].speaker).toBe('嘉宾');
    const again = serializeVoiceoverDocument(doc);
    expect(again).toContain('【主持人】');
    expect(again).toContain('【嘉宾】');
    expect(again).toContain('<#0.3#>');
  });

  it('parses colon speaker style', () => {
    const doc = parseVoiceoverDocument('小李：你好<#0.2#>\n小王：你好啊');
    expect(doc.mode).toBe('dialogue');
    expect(doc.turns.map((t) => t.speaker)).toEqual(['小李', '小王']);
  });

  it('addDialogueTurn promotes mono to dialogue', () => {
    const mono = parseVoiceoverDocument('单口正文<#0.25#>');
    expect(mono.mode).toBe('mono');
    const next = addDialogueTurn(mono, '嘉宾');
    expect(next.mode).toBe('dialogue');
    expect(next.turns.length).toBe(2);
    expect(next.turns[0].speaker).toBe('主持人');
    expect(next.turns[1].speaker).toBe('嘉宾');
  });
});
