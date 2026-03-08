import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface RecraftCrispUpscaleParams extends GenerateParams {
  image_size?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  style?: string;
  colors?: Array<{ r: number; g: number; b: number }>;
  num_images?: number;
  input_image?: string;
}

export interface RecraftCrispUpscaleResult extends GenerateResult {
  image_urls: string[];
}

const modelKey = 'recraft-crisp-upscale';
const logicalProvider = 'replicate';

async function generateImpl(
  params: RecraftCrispUpscaleParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<RecraftCrispUpscaleResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt || '',
    negativePrompt: params.negativePrompt,
    parameters: {
      image_size: params.image_size,
      style: params.style,
      colors: params.colors,
      num_images: params.num_images,
      image: params.parameters?.image ?? params.input_image,
      ...params.parameters,
    },
  };
  if (generateParams.parameters?.input_image) delete generateParams.parameters.input_image;
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, image_urls: result.mediaUrls };
}

const definition: ModelDefinition<RecraftCrispUpscaleParams, RecraftCrispUpscaleResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
