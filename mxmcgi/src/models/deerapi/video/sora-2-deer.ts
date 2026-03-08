import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface Sora2DeerParams extends GenerateParams {
  seconds?: '10' | '15';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  input_reference?: string;
  character_url?: string;
  character_timestamps?: string;
  enableProgress?: boolean;
}

export interface Sora2DeerResult extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'sora-2-deer';
const logicalProvider = 'deer';

async function generateImpl(
  params: Sora2DeerParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Sora2DeerResult> {
  if (params.seconds && params.seconds !== '10' && params.seconds !== '15') {
    throw new Error(`sora-2-deer 仅支持 10 或 15 秒，不支持 ${params.seconds} 秒。如需使用 25 秒，请使用 sora-2-deer-pro 模型`);
  }
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
  console.log('[sora-2-deer] 传给 provider 的参数:', {
    promptLength: (generateParams.prompt ?? '').length,
    seconds: generateParams.parameters?.seconds,
    size: generateParams.parameters?.size,
    hasInputReference: !!generateParams.parameters?.input_reference,
  });
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, video_urls: result.mediaUrls, progress: result.progress };
}

const definition: ModelDefinition<Sora2DeerParams, Sora2DeerResult> = {
  provider: logicalProvider,
  scope: 'video',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
