import type { ModelDefinition, ModelContext } from '../types';
import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../providers';
import { registerModel } from '../registry';

export interface Gpt5NanoParams extends GenerateParams {}

export interface Gpt5NanoResult extends GenerateResult {
  text?: string;
}

const modelKey = 'gpt-5-nano';
const logicalProvider: ProviderType = 'openai';

async function generateImpl(
  params: Gpt5NanoParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType },
): Promise<Gpt5NanoResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  const result = await modelProvider.generate(modelKey, {
    ...params,
  });

  return {
    ...result,
  };
}

const definition: ModelDefinition<Gpt5NanoParams, Gpt5NanoResult> = {
  provider: logicalProvider,
  scope: 'writing',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;

