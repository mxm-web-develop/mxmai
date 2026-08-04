/**
 * 系统音色 → 口播人设草稿（LLM）；供选音色时预填 host_persona / cast.persona
 */
import { runTaskV2 } from '../task-engine';
import { parsePersonaText } from './voice-persona-parse';

export type VoicePersonaSketchInput = {
  label: string;
  descriptions?: string[];
  voiceId?: string;
  language?: string;
  userId?: string;
};

export type VoicePersonaSketchResult = {
  persona: string;
};

export { parsePersonaText };

export async function previewVoicePersonaSketch(
  input: VoicePersonaSketchInput
): Promise<VoicePersonaSketchResult> {
  const label = String(input.label ?? '').trim();
  if (!label) {
    return { persona: '' };
  }
  const descriptions = (input.descriptions ?? [])
    .map((d) => String(d ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const userId = input.userId?.trim();
  if (!userId) {
    return { persona: '' };
  }

  try {
    const res = await runTaskV2(
      {
        scope: 'text',
        taskKey: 'expert',
        subtype: 'voice-persona-sketch',
        params: {
          contract: {
            basic: {
              voice_label: label,
              voice_id: String(input.voiceId ?? '').trim() || undefined,
              voice_descriptions: descriptions,
              language: input.language || 'zh',
            },
            business: {},
          },
          field_specs: [{ name: 'persona', type: 'string', description: '人设短文' }],
        },
      },
      userId
    );
    const text = res.syncResult?.text ?? '';
    const persona = parsePersonaText(text);
    return { persona };
  } catch (err) {
    console.warn('[previewVoicePersonaSketch] failed:', err);
    return { persona: '' };
  }
}
