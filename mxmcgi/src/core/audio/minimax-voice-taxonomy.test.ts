import { describe, expect, it } from 'vitest';
import { classifyVoiceGender, classifyVoiceLanguage, isCatalogVisibleVoice } from './minimax-voice-taxonomy';

describe('minimax-voice-taxonomy', () => {
  it('classifies classic zh male/female slugs', () => {
    expect(
      classifyVoiceLanguage({ voice_id: 'female-shaonv', voice_name: '少女音色', description: [] }),
    ).toBe('zh');
    expect(
      classifyVoiceGender({ voice_id: 'female-shaonv', voice_name: '少女音色', description: [] }),
    ).toBe('female');
    expect(
      classifyVoiceGender({ voice_id: 'male-qn-jingying', voice_name: '精英青年音色', description: [] }),
    ).toBe('male');
  });

  it('classifies Mandarin descriptive ids', () => {
    const voice = {
      voice_id: 'Chinese (Mandarin)_Reliable_Executive',
      voice_name: '沉稳高管',
      description: [] as string[],
    };
    expect(classifyVoiceLanguage(voice)).toBe('zh');
    expect(classifyVoiceGender(voice)).toBe('male');
  });

  it('classifies English voices', () => {
    const voice = {
      voice_id: 'English_Trustworthy_Man',
      voice_name: 'Trustworthy Man',
      description: [] as string[],
    };
    expect(classifyVoiceLanguage(voice)).toBe('en');
    expect(classifyVoiceGender(voice)).toBe('male');
  });

  it('classifies character voices as other gender', () => {
    expect(
      classifyVoiceGender({
        voice_id: 'cartoon_pig',
        voice_name: '卡通猪小琪',
        description: [],
      }),
    ).toBe('other');
  });

  it('classifies Japanese as other language', () => {
    expect(
      classifyVoiceLanguage({
        voice_id: 'Japanese_GentleButler',
        voice_name: 'Gentle Butler',
        description: [],
      }),
    ).toBe('other');
  });

  it('hides Korean/Spanish but keeps Japanese in catalog', () => {
    expect(
      isCatalogVisibleVoice({
        voice_id: 'Korean_SweetGirl',
        voice_name: 'Sweet Girl',
        description: [],
      }),
    ).toBe(false);
    expect(
      isCatalogVisibleVoice({
        voice_id: 'Spanish_Narrator',
        voice_name: 'Narrator',
        description: [],
      }),
    ).toBe(false);
    expect(
      isCatalogVisibleVoice({
        voice_id: 'Japanese_GentleButler',
        voice_name: 'Gentle Butler',
        description: [],
      }),
    ).toBe(true);
  });
});
