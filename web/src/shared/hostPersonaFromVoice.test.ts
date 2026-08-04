import { describe, expect, it } from 'vitest';
import {
  isDescriptiveVoiceLabel,
  personaFromCharacterSummary,
  personaSketchFromSystemVoice,
  resolveHostPersona,
} from './hostPersonaFromVoice';

describe('hostPersonaFromVoice', () => {
  it('builds persona from character card fields', () => {
    const text = personaFromCharacterSummary({
      display_name: '阿夏',
      personality: { value: '冷静观察者', provenance: 'extracted' },
      speech_style: '短句，偶尔「呵」一声',
      character_brief: '夜店调酒师',
    });
    expect(text).toContain('阿夏');
    expect(text).toContain('冷静观察者');
    expect(text).toContain('短句');
  });

  it('returns empty when character has no persona cues', () => {
    expect(personaFromCharacterSummary({ voice_id: 'x' })).toBe('');
  });

  it('gates system voice labels; local sketch is empty (LLM path)', () => {
    expect(isDescriptiveVoiceLabel('少女音色')).toBe(true);
    expect(isDescriptiveVoiceLabel('Voice 12')).toBe(false);
    expect(personaSketchFromSystemVoice('少女音色')).toBe('');
    expect(resolveHostPersona({ kind: 'system', label: '少女音色' })).toBe('');
    expect(resolveHostPersona({ kind: 'clear' })).toBe('');
  });
});
