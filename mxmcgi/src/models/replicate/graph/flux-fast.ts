import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface FluxFastParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  num_outputs?: number;
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number;
}

export interface FluxFastResult extends GenerateResult {
  image_urls: string[];
}

const modelKey = 'flux-fast';
const logicalProvider = 'replicate';

async function generateImpl(
  params: FluxFastParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<FluxFastResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    parameters: {
      aspect_ratio: params.aspect_ratio,
      num_outputs: params.num_outputs,
      output_format: params.output_format,
      safety_tolerance: params.safety_tolerance,
      ...params.parameters,
    },
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, image_urls: result.mediaUrls };
}

const definition: ModelDefinition<FluxFastParams, FluxFastResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
