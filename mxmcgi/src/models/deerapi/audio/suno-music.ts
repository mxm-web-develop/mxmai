/**
 * Suno 音乐生成（DeerAPI）
 */

import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export interface SunoMusicParams extends GenerateParams {
  mv?: string;
  title?: string;
  tags?: string;
  negative_tags?: string;
  make_instrumental?: boolean;
  gpt_description_prompt?: string;
  task?: string;
  task_id?: string;
  continue_clip_id?: string;
  continue_at?: number | string;
  notify_hook?: string;
  [key: string]: any;
}

const modelKey = 'suno-music';
const logicalProvider = 'deer';

async function generateImpl(
  params: SunoMusicParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<GenerateResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  const generateParams: GenerateParams = {
    prompt: params.prompt,
    parameters: {
      ...(params.parameters || {}),
      mv: params.mv ?? params.parameters?.mv,
      title: params.title ?? params.parameters?.title,
      tags: params.tags ?? params.parameters?.tags,
      negative_tags: params.negative_tags ?? params.parameters?.negative_tags,
      make_instrumental: params.make_instrumental ?? params.parameters?.make_instrumental,
      gpt_description_prompt: params.gpt_description_prompt ?? params.parameters?.gpt_description_prompt,
      task: params.task ?? params.parameters?.task,
      task_id: params.task_id ?? params.parameters?.task_id,
      continue_clip_id: params.continue_clip_id ?? params.parameters?.continue_clip_id,
      continue_at: params.continue_at ?? params.parameters?.continue_at,
      notify_hook: params.notify_hook ?? params.parameters?.notify_hook,
    },
    enableProgress: params.enableProgress !== false,
    outputFormat: 'json',
  };

  return await modelProvider.generate(modelKey, generateParams);
}

const definition: ModelDefinition<SunoMusicParams, GenerateResult> = {
  provider: logicalProvider,
  scope: 'audio',
  modelKey,
  generate: generateImpl,
};
registerModel(definition);
export default definition;
