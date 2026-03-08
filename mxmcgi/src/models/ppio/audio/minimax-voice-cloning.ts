import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface MinimaxVoiceCloningParams extends GenerateParams {
  audio_url: string;
  text?: string;
  model?: 'speech-02-hd' | 'speech-02-turbo' | 'speech-2.5-hd-preview' | 'speech-2.5-turbo-preview';
  clone_prompt?: { prompt_audio_url: string; prompt_text: string };
  accuracy?: number;
  need_noise_reduction?: boolean;
  need_volume_normalization?: boolean;
}

export interface MinimaxVoiceCloningResult extends GenerateResult {
  voice_id: string;
  demo_audio_url?: string;
}

const modelKey = 'minimax-voice-cloning';
const logicalProvider = 'ppio';

async function generateImpl(
  params: MinimaxVoiceCloningParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<MinimaxVoiceCloningResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.audio_url,
    parameters: {
      audio_url: params.audio_url,
      text: params.text,
      model: params.model,
      clone_prompt: params.clone_prompt,
      accuracy: params.accuracy,
      need_noise_reduction: params.need_noise_reduction,
      need_volume_normalization: params.need_volume_normalization,
      ...params.parameters,
    },
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return {
    ...result,
    voice_id: result.metadata?.voice_id || '',
    demo_audio_url: result.mediaUrls?.[0],
  };
}

const definition: ModelDefinition<MinimaxVoiceCloningParams, MinimaxVoiceCloningResult> = {
  provider: logicalProvider,
  scope: 'audio',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
