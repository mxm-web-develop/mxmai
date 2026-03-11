import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface Sora2DeerProParams extends GenerateParams {
  seconds?: '10' | '15' | '25';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  input_reference?: string;
  character_url?: string;
  character_timestamps?: string;
  enableProgress?: boolean;
}

export interface Sora2DeerProResult extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'sora-2-deer-pro';
const logicalProvider = 'deer';

async function generateImpl(
  params: Sora2DeerProParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Sora2DeerProResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    enableProgress: params.enableProgress,
    parameters: {
      seconds: params.seconds,
      size: params.size,
      input_reference: params.input_reference,
      character_url: params.character_url,
      character_timestamps: params.character_timestamps,
      ...params.parameters,
    },
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, video_urls: result.mediaUrls, progress: result.progress };
}

const definition: ModelDefinition<Sora2DeerProParams, Sora2DeerProResult> = {
  provider: logicalProvider,
  scope: 'video',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
