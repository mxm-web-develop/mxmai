import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface MinimaxSpeech25TurboParams extends GenerateParams {
  voice_setting?: { speed?: number; vol?: number; pitch?: number; voice_id?: string; emotion?: string; latex_read?: boolean; text_normalization?: boolean };
  audio_setting?: { sample_rate?: number; bitrate?: number; format?: string; channel?: number };
  pronunciation_dict?: { tone?: string[] };
  timbre_weights?: Array<{ voice_id: string; weight: number }>;
  stream?: boolean;
  stream_options?: { exclude_aggregated_audio?: boolean };
  language_boost?: string;
  output_format?: 'url' | 'hex';
  voice_modify?: { pitch?: number; intensity?: number; timbre?: number; sound_effects?: string };
}

export interface MinimaxSpeech25TurboResult extends GenerateResult {
  status?: number;
}

const modelKey = 'minimax-speech-2.5-turbo';
const logicalProvider = 'ppio';

async function generateImpl(params: MinimaxSpeech25TurboParams, _ctx?: ModelContext & { providerOverride?: ProviderType }): Promise<MinimaxSpeech25TurboResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, _ctx?.providerOverride);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    parameters: { voice_setting: params.voice_setting, audio_setting: params.audio_setting, pronunciation_dict: params.pronunciation_dict, timbre_weights: params.timbre_weights, stream: params.stream, stream_options: params.stream_options, language_boost: params.language_boost, output_format: params.output_format, voice_modify: params.voice_modify, ...params.parameters },
    enableProgress: params.enableProgress,
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, status: result.metadata?.status };
}

const definition: ModelDefinition<MinimaxSpeech25TurboParams, MinimaxSpeech25TurboResult> = { provider: logicalProvider, scope: 'audio', modelKey, generate: generateImpl };
registerModel(definition);
export default definition;
