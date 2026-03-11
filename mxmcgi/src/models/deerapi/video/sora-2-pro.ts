/**
 * Sora 2 Pro 视频生成（DeerAPI）
 */

import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';
import { normalizeSize } from './sora-utils';
import type { Sora2Params, Sora2Result } from './sora-2';

const modelKey = 'sora-2-pro';
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
    parameters: {
      ...params.parameters,
      seconds,
      size,
      input_reference: params.input_reference,
    },
  };

  const result = await modelProvider.generate(modelKey, generateParams);

  return {
    ...result,
    video_urls: result.mediaUrls,
    progress: result.progress,
  };
}

const definition: ModelDefinition<Sora2Params, Sora2Result> = {
  provider: logicalProvider,
  scope: 'video',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;
