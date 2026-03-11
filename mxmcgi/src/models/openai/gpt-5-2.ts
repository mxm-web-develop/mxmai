import type { ModelDefinition, ModelContext } from '../types';
import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../providers';
import { registerModel } from '../registry';

export interface Gpt52Params extends GenerateParams {}

export interface Gpt52Result extends GenerateResult {
  text?: string;
}

const modelKey = 'gpt-5-2';
const logicalProvider: ProviderType = 'openai';

async function generateImpl(
  params: Gpt52Params,
  _ctx?: ModelContext & { providerOverride?: ProviderType },
): Promise<Gpt52Result> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  const result = await modelProvider.generate(modelKey, {
    ...params,
  });

  return {
    ...result,
  };
}

const definition: ModelDefinition<Gpt52Params, Gpt52Result> = {
  provider: logicalProvider,
  scope: 'writing',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;

