import {
  providerFactory,
  type GenerateParams,
  type GenerateResult,
  type ProviderType,
} from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface NanoBanana2ProParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  image_size?: '1K' | '2K' | '4K';
  image?: string;
  image_urls?: string[];
  image_base64s?: string[];
  enableProgress?: boolean;
}

export interface NanoBanana2ProResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>;
}

const modelKey = 'nano-banana-2-pro';
const logicalProvider = 'deer';

async function generateImpl(
  params: NanoBanana2ProParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<NanoBanana2ProResult> {
  const preferred = _ctx?.providerOverride;

  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  const generateParams: GenerateParams = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    enableProgress: params.enableProgress,
    parameters: {
      aspect_ratio: params.aspect_ratio,
      image_size: params.image_size,
      ...params.parameters,
    },
  };

  if (params.image) {
    generateParams.parameters = {
      ...generateParams.parameters,
      image: params.image,
    };
    const isBase64 = typeof params.image === 'string' && params.image.startsWith('data:');
    console.log(
      `[models/deerapi/graph/nano-banana-2-pro] 使用单张图片参数 (image): ${isBase64 ? 'Base64数据' : 'URL'}`
    );
  } else if (params.image_urls && params.image_urls.length > 0) {
    generateParams.parameters = {
      ...generateParams.parameters,
      image_urls: params.image_urls,
    };
    console.log(
      `[models/deerapi/graph/nano-banana-2-pro] 使用多图URL参数 (image_urls): ${params.image_urls.length} 张图片`
    );
  } else if (params.image_base64s && params.image_base64s.length > 0) {
    generateParams.parameters = {
      ...generateParams.parameters,
      image_base64s: params.image_base64s,
    };
    console.log(
      `[models/deerapi/graph/nano-banana-2-pro] 使用多图Base64参数 (image_base64s): ${params.image_base64s.length} 张图片`
    );
  }

  const result = await modelProvider.generate(modelKey, generateParams);

  return {
    ...result,
    image_urls: result.mediaUrls,
    progress: result.progress,
  };
}

const definition: ModelDefinition<NanoBanana2ProParams, NanoBanana2ProResult> = {
  provider: logicalProvider,
  scope: 'graph',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;

