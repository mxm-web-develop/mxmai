import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface MinimaxSpeech02HdAsyncParams extends GenerateParams {
  voice_setting?: Record<string, unknown>;
  audio_setting?: Record<string, unknown>;
  pronunciation_dict?: Record<string, unknown>;
  language_boost?: string;
  voice_modify?: Record<string, unknown>;
}

export interface MinimaxSpeech02HdAsyncResult extends GenerateResult {
  task_id?: string;
  progress?: AsyncIterable<any>;
}

const modelKey = 'minimax-speech-02-hd-async';
const logicalProvider = 'ppio';

async function generateImpl(params: MinimaxSpeech02HdAsyncParams, _ctx?: ModelContext & { providerOverride?: ProviderType }): Promise<MinimaxSpeech02HdAsyncResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, _ctx?.providerOverride);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    parameters: { ...params.parameters, voice_setting: params.voice_setting, audio_setting: params.audio_setting, pronunciation_dict: params.pronunciation_dict, language_boost: params.language_boost, voice_modify: params.voice_modify },
    enableProgress: params.enableProgress,
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, task_id: result.metadata?.task_id, progress: result.progress };
}

const definition: ModelDefinition<MinimaxSpeech02HdAsyncParams, MinimaxSpeech02HdAsyncResult> = { provider: logicalProvider, scope: 'audio', modelKey, generate: generateImpl };
registerModel(definition);
export default definition;
