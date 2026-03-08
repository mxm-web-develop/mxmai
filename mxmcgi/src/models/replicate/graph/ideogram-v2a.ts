import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface IdeogramV2AParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  resolution?: 'Auto' | string;
  turbo?: boolean;
  magic_prompt_option?: 'AUTO' | 'ON' | 'OFF';
  seed?: number;
  style_type?: 'None' | 'Auto' | 'General' | 'Realistic' | 'Design' | 'Render 3D' | 'Anime';
  num_images?: number;
}

export interface IdeogramV2AResult extends GenerateResult {
  image_urls: string[];
}

const modelKey = 'ideogram-v2a';
const logicalProvider = 'replicate';

async function generateImpl(
  params: IdeogramV2AParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<IdeogramV2AResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);
  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    parameters: {
      aspect_ratio: params.aspect_ratio,
      resolution: params.resolution,
      turbo: params.turbo,
      magic_prompt_option: params.magic_prompt_option,
      seed: params.seed,
      style_type: params.style_type,
      num_images: params.num_images,
      ...params.parameters,
    },
  };
  const result = await modelProvider.generate(modelKey, generateParams);
  return { ...result, image_urls: result.mediaUrls };
}

const definition: ModelDefinition<IdeogramV2AParams, IdeogramV2AResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
