/**
 * Gemini 2.5 Flash（Replicate）- 写作用 LLM
 */
import type { GenerateParams, ProviderType } from '../../providers';
import { providerFactory } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';
import { mapProviderResultToWritingResult, type WritingResult } from './common';

const modelKey = 'gemini-2-5-flash';
const provider = 'replicate';

async function generateImpl(
  params: GenerateParams,
  ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<WritingResult> {
  const modelProvider = providerFactory.getProviderForModel(modelKey, ctx?.providerOverride);
  const result = await modelProvider.generate(modelKey, params);
  return mapProviderResultToWritingResult(result);
}

const definition: ModelDefinition<GenerateParams, WritingResult> = {
  provider,
  scope: 'writing',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
