import { describe, expect, it } from 'vitest';
import { normalizeDialogueBusinessToCast } from './normalize-dialogue-to-cast';

describe('normalizeDialogueBusinessToCast', () => {
  it('maps invented speakers onto cast and rewrites script_draft', () => {
    const out = normalizeDialogueBusinessToCast({
      cast: [
        { id: 'host', name: '主持' },
        { id: 'guest', name: '嘉宾' },
      ],
      lines: [
        { id: 'L1', speakerId: 'narrator', speakerName: '旁白', text: '开场', tts_markup: '<#0.2#>开场<#0.2#>' },
        { id: 'L2', speakerId: 'a', speakerName: '主持人 A', text: '你好', tts_markup: '<#0.2#>你好<#0.2#>' },
        { id: 'L3', speakerId: 'guest', speakerName: '嘉宾', text: '嗯', tts_markup: '<#0.2#>嗯<#0.2#>', kind: 'affirmation' },
      ],
      script_draft: '旧稿',
    });
    const lines = out.lines as Array<Record<string, unknown>>;
    expect(lines.every((l) => l.speakerId === 'host' || l.speakerId === 'guest')).toBe(true);
    expect(String(out.script_draft)).toContain('【主持】');
    expect(String(out.script_draft)).toContain('【嘉宾·附和】');
    expect(String(out.script_draft)).not.toContain('旁白');
    expect(String(out.script_draft)).not.toContain('主持人 A');
  });
});
