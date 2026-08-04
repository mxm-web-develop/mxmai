import { describe, expect, it } from 'vitest';
import { dialogueSubtitlesToPlayerPayload } from './dialogue-subtitle-payload';

describe('dialogueSubtitlesToPlayerPayload', () => {
  it('converts startSeconds to MiniMax-style ms sentences', () => {
    const payload = dialogueSubtitlesToPlayerPayload([
      { text: '<#0.3#>你好<#0.2#>', startSeconds: 0, endSeconds: 1.2, speakerId: 'host' },
      { text: '嗯', startSeconds: 1.0, endSeconds: 1.5, speakerId: 'guest' },
    ]);
    expect(payload.sentences).toEqual([
      { text: '你好', time_begin: 0, time_end: 1200, speakerId: 'host' },
      { text: '嗯', time_begin: 1000, time_end: 1500, speakerId: 'guest' },
    ]);
  });
});
