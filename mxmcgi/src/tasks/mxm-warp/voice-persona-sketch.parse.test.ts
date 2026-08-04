import { describe, expect, it } from 'vitest';
import { parsePersonaText } from './voice-persona-parse';

describe('parsePersonaText', () => {
  it('reads persona from JSON', () => {
    expect(parsePersonaText('{"persona":"性格：稳\\n口头语：说真的"}')).toContain('性格');
  });

  it('accepts plain text fallback', () => {
    expect(parsePersonaText('性格：活泼\n常用语气词：呀')).toContain('活泼');
  });
});
