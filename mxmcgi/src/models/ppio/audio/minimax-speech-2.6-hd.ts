import {
  providerFactory,
  type GenerateParams,
  type GenerateResult,
  type ProviderType,
} from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface MinimaxSpeech26HdParams extends GenerateParams {
  voice_setting?: Record<string, unknown>;
  audio_setting?: Record<string, unknown>;
  pronunciation_dict?: Record<string, unknown>;
  timbre_weights?: Array<{ voice_id: string; weight: number }>;
  stream?: boolean;
  stream_options?: Record<string, unknown>;
  language_boost?: string;
  output_format?: 'url' | 'hex';
  voice_modify?: Record<string, unknown>;
}

export interface MinimaxSpeech26HdResult extends GenerateResult {
  status?: number;
}

const modelKey = 'minimax-speech-2.6-hd';
const logicalProvider = 'ppio';

async function generateImpl(params: MinimaxSpeech26HdParams, _ctx?: ModelContext & { providerOverride?: ProviderType }): Promise<MinimaxSpeech26HdResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, _ctx?.providerOverride);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    parameters: { ...params.parameters, voice_setting: params.voice_setting, audio_setting: params.audio_setting, pronunciation_dict: params.pronunciation_dict, timbre_weights: params.timbre_weights, stream: params.stream, stream_options: params.stream_options, language_boost: params.language_boost, output_format: params.output_format, voice_modify: params.voice_modify },
    enableProgress: params.enableProgress,
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, status: result.metadata?.status };
}

const definition: ModelDefinition<MinimaxSpeech26HdParams, MinimaxSpeech26HdResult> = { provider: logicalProvider, scope: 'audio', modelKey, generate: generateImpl };
registerModel(definition);
export default definition;
