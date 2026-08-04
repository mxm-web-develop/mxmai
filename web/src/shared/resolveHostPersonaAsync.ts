/**
 * 系统音色人设：调 LLM 预览接口；角色卡仍本地拼装。
 */
import { previewVoicePersonaSketch } from '../api/client';
import {
  isDescriptiveVoiceLabel,
  personaFromCharacterSummary,
  type VoicePersonaSource,
} from './hostPersonaFromVoice';

export async function resolveHostPersonaAsync(source: VoicePersonaSource): Promise<string> {
  if (source.kind === 'clear') return '';
  if (source.kind === 'character') return personaFromCharacterSummary(source.character);
  const label = source.label.trim();
  const descriptions = source.descriptions;
  if (!isDescriptiveVoiceLabel(label, descriptions)) return '';
  const res = await previewVoicePersonaSketch({
    label,
    descriptions,
    voiceId: source.voiceId,
  });
  if (res.error) return '';
  return String(res.data?.persona ?? '').trim();
}
