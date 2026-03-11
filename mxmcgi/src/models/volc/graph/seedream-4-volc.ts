import {
  providerFactory,
  type GenerateParams,
  type GenerateResult,
  type ProviderType,
} from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface Seedream4VolcParams extends GenerateParams {
  size?: '1K' | '2K' | '4K' | 'custom';
  aspect_ratio?: string;
  width?: number;
  height?: number;
  image_input?: string[];
  sequential_image_generation?: 'disabled' | 'auto';
  max_images?: number;
  enableProgress?: boolean;
}

export interface Seedream4VolcResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<unknown>;
}

const modelKey = 'seedream-4-volc';
const logicalProvider = 'volc';

async function generateImpl(
  params: Seedream4VolcParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Seedream4VolcResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, _ctx?.providerOverride);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    enableProgress: params.enableProgress,
    parameters: {
      size: params.size,
      aspect_ratio: params.aspect_ratio,
      width: params.width,
      height: params.height,
      image_input: params.image_input,
      sequential_image_generation: params.sequential_image_generation,
      max_images: params.max_images,
      ...params.parameters,
    },
  };

  const result = await modelProvider.generate(modelKey, generateParams);
  return {
    ...result,
    image_urls: result.mediaUrls,
    progress: result.progress,
  };
}

const definition: ModelDefinition<Seedream4VolcParams, Seedream4VolcResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;
