import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';
import { normalizeSize, type Sora2Size } from './sora-utils';

export interface Sora2Params extends GenerateParams {
  seconds?: '4' | '8' | '12';
  size?: Sora2Size | string;
  input_reference?: string;
  enableProgress?: boolean;
}

export interface Sora2Result extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'sora-2';
const logicalProvider = 'deer';

async function generateImpl(
  params: Sora2Params,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Sora2Result> {
  const preferred = _ctx?.providerOverride;
  const seconds = params.seconds != null ? String(params.seconds) as '4' | '8' | '12' : undefined;
  const size = normalizeSize(params.size);
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    enableProgress: params.enableProgress,
    parameters: { ...params.parameters, seconds, size, input_reference: params.input_reference },
  };
  if (seconds != null || size != null) {
    console.log('[Sora-2] 请求参数: seconds=' + seconds + ', size=' + size + ' (原始 size=' + params.size + ')');
  }
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, video_urls: result.mediaUrls, progress: result.progress };
}

const definition: ModelDefinition<Sora2Params, Sora2Result> = {
  provider: logicalProvider,
  scope: 'video',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export { normalizeSize };
export default definition;
