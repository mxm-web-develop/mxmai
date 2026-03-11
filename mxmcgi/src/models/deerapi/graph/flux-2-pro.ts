import {
  providerFactory,
  type GenerateParams,
  type GenerateResult,
  type ProviderType,
} from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface Flux2ProParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  image_size?: '1K' | '2K' | '4K';
  num_outputs?: number;
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number;
  enableProgress?: boolean;
}

export interface Flux2ProResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'flux-2-pro';
const logicalProvider = 'deer';

async function generateImpl(
  params: Flux2ProParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Flux2ProResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    enableProgress: params.enableProgress,
    parameters: {
      aspect_ratio: params.aspect_ratio,
      image_size: params.image_size,
      num_outputs: params.num_outputs,
      output_format: params.output_format,
      safety_tolerance: params.safety_tolerance,
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

const definition: ModelDefinition<Flux2ProParams, Flux2ProResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;
