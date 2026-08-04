import { describe, expect, it } from 'vitest';
import {
  estimateDialogueLineDurationMs,
  resolveGuidanceTimeline,
} from './dialogueGuidanceTimeline';

describe('dialogueGuidanceTimeline', () => {
  it('estimates duration including pause tags', () => {
    const ms = estimateDialogueLineDurationMs('<#0.5#>一二三四<#0.5#>', 'chat_show');
    expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('resolves overlap with negative offset', () => {
    const { lines } = resolveGuidanceTimeline(
      [
        {
          id: 'L1',
          speakerId: 'a',
          tts_markup: '<#0.2#>很长的一句主台词内容<#0.2#>',
          kind: 'main',
        },
        {
          id: 'L2',
          speakerId: 'b',
          tts_markup: '<#0.2#>对<#0.2#>',
          kind: 'affirmation',
          cue: { afterLineId: 'L1', offsetMs: -300 },
        },
      ],
      { cast: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
    );
    expect(lines[1]!.start_ms).toBeLessThan(lines[0]!.start_ms + lines[0]!.duration_ms);
  });
});
