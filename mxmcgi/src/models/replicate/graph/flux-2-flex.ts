import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface Flux2FlexParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  num_outputs?: number;
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number;
  enableProgress?: boolean;
}

export interface Flux2FlexResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'flux-2-flex';
const logicalProvider = 'replicate';

async function generateImpl(
  params: Flux2FlexParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<Flux2FlexResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    enableProgress: params.enableProgress,
    parameters: {
      aspect_ratio: params.aspect_ratio,
      num_outputs: params.num_outputs,
      output_format: params.output_format,
      safety_tolerance: params.safety_tolerance,
      ...params.parameters,
    },
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, image_urls: result.mediaUrls, progress: result.progress };
}

const definition: ModelDefinition<Flux2FlexParams, Flux2FlexResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
