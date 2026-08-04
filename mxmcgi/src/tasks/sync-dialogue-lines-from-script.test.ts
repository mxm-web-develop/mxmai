/**
 * syncDialogueLinesFromScript 单测
 */
import { describe, expect, it } from 'vitest';
import {
  syncDialogueLinesFromScript,
  formatDialogueScriptFromLines,
} from './sync-dialogue-lines-from-script';

describe('syncDialogueLinesFromScript', () => {
  it('preserves cue when rewriting text', () => {
    const lines = [
      { id: 'L1', speakerId: 'host', text: '旧1', cue: { gapMs: 0 } },
      {
        id: 'L2',
        speakerId: 'guest',
        text: '旧2',
        kind: 'affirmation',
        cue: { afterLineId: 'L1', offsetMs: -200 },
      },
    ];
    const next = syncDialogueLinesFromScript({
      script: '【主持】你好啊\n【嘉宾】嗯对',
      lines,
      cast: [
        { id: 'host', name: '主持' },
        { id: 'guest', name: '嘉宾' },
      ],
    });
    expect(next).toHaveLength(2);
    expect(next[0]!.text).toBe('你好啊');
    expect(next[1]!.cue).toEqual({ afterLineId: 'L1', offsetMs: -200 });
    expect(next[1]!.kind).toBe('affirmation');
  });

  it('roundtrips formatDialogueScriptFromLines', () => {
    const script = formatDialogueScriptFromLines(
      [
        { id: 'L1', speakerId: 'host', tts_markup: '<#0.2#>你好<#0.2#>' },
        { id: 'L2', speakerId: 'guest', text: '对' },
      ],
      [
        { id: 'host', name: '主持' },
        { id: 'guest', name: '嘉宾' },
      ]
    );
    expect(script).toContain('【主持】');
    expect(script).toContain('【嘉宾】对');
  });
});
