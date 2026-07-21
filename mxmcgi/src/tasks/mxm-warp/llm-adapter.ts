/**
 * mxm-warp LLM 适配：走现有 runByModelKey（system_prompt + user prompt）
 */
import type { GenerateResult, ProviderType } from '../../models/providers';
import type { ModelScope } from '../../models/types';
import { runByModelKey } from '../../models/run';
import type { WarpLlmFn } from './input-stage';

export type WarpLlmUsageBag = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  provider?: string;
};

function extractText(result: GenerateResult): string {
  const t = (result as { text?: string }).text;
  if (typeof t === 'string' && t.trim()) return t;
  const mt = result.metadata?.text;
  if (typeof mt === 'string' && mt.trim()) return mt;
  if (Array.isArray(result.mediaUrls) && result.mediaUrls[0] && !String(result.mediaUrls[0]).startsWith('http')) {
    return String(result.mediaUrls[0]);
  }
  return '';
}

function readUsage(result: GenerateResult): WarpLlmUsageBag['usage'] | undefined {
  const u = result.metadata?.usage as WarpLlmUsageBag['usage'] | undefined;
  if (u && typeof u === 'object') return u;
  return undefined;
}

function addUsage(
  a: WarpLlmUsageBag['usage'] | undefined,
  b: WarpLlmUsageBag['usage'] | undefined
): WarpLlmUsageBag['usage'] | undefined {
  if (!a && !b) return undefined;
  const prompt =
    Number(a?.prompt_tokens ?? a?.input_tokens ?? 0) + Number(b?.prompt_tokens ?? b?.input_tokens ?? 0);
  const completion =
    Number(a?.completion_tokens ?? a?.output_tokens ?? 0) +
    Number(b?.completion_tokens ?? b?.output_tokens ?? 0);
  const total = Number(a?.total_tokens ?? 0) + Number(b?.total_tokens ?? 0) || prompt + completion;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    input_tokens: prompt,
    output_tokens: completion,
  };
}

export function createWarpLlmAdapter(args: {
  scope: ModelScope;
  modelKey: string;
  provider: string;
  /** 多次调用累计用量，供计费 */
  usageBag?: WarpLlmUsageBag;
}): WarpLlmFn {
  const bag = args.usageBag ?? {};
  return async ({ system, user }) => {
    const result = await runByModelKey(
      args.scope,
      args.modelKey,
      {
        prompt: user,
        parameters: {
          system_prompt: system,
        },
        outputFormat: 'json',
      } as any,
      { providerOverride: args.provider as ProviderType }
    );
    bag.model = String(result.metadata?.model ?? args.modelKey);
    bag.provider = String(result.metadata?.provider ?? args.provider);
    bag.usage = addUsage(bag.usage, readUsage(result));
    return extractText(result);
  };
}
