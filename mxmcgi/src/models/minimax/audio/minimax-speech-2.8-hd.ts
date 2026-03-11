import {
  providerFactory,
  type GenerateParams,
  type GenerateResult,
  type ProviderType,
} from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface MinimaxSpeech28HdParams extends GenerateParams {
  voice_setting?: Record<string, unknown>;
  audio_setting?: Record<string, unknown>;
  stream?: boolean;
  output_format?: 'url' | 'hex';
}

export interface MinimaxSpeech28HdResult extends GenerateResult {
  status?: number;
}

const modelKey = 'minimax-speech-2.8-hd';
const logicalProvider = 'minimax';

async function generateImpl(params: MinimaxSpeech28HdParams, _ctx?: ModelContext & { providerOverride?: ProviderType }): Promise<MinimaxSpeech28HdResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, _ctx?.providerOverride);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    parameters: { ...params.parameters, voice_setting: params.voice_setting, audio_setting: params.audio_setting, stream: params.stream, output_format: params.output_format },
    enableProgress: params.enableProgress,
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, status: result.metadata?.status };
}

const definition: ModelDefinition<MinimaxSpeech28HdParams, MinimaxSpeech28HdResult> = { provider: logicalProvider, scope: 'audio', modelKey, generate: generateImpl };
registerModel(definition);
export default definition;
