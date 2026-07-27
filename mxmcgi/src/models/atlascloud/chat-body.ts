/**
 * AtlasCloud OpenAI 兼容 chat/completions 请求体整理。
 * 禁止把平台内部字段（system_prompt / 参考图槽位等）原样塞进 body，否则上游常回 400。
 */

const STRIP_FROM_CHAT_BODY = new Set([
  'image',
  'images',
  'image_base64s',
  'image_urls',
  'image_input',
  'messages',
  'referenceImage',
  'reference_image',
  'system_prompt',
  'system_instruction',
  'system',
  'prompt',
  'max_wait_ms',
  'poll_interval_ms',
  // Admin / Task V2 camelCase，已映射为 snake_case
  'maxTokens',
  'topP',
  // Atlas 文档仅认 max_tokens；与 max_completion_tokens 并存时 Gemini 等会 400
  'max_completion_tokens',
]);

export type AtlasChatMessage = {
  role: string;
  content: unknown;
};

function pickFiniteNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return undefined;
}

export function buildAtlasChatCompletionsBody(args: {
  upstreamModel: string;
  userContent: unknown;
  parameters?: Record<string, unknown> | null;
}): { body: Record<string, unknown>; systemPrompt: string | null } {
  const rawParams = { ...(args.parameters ?? {}) };
  const providedMessages = rawParams.messages;
  const systemRaw = rawParams.system_prompt ?? rawParams.system_instruction ?? rawParams.system;
  const systemPrompt =
    systemRaw != null && String(systemRaw).trim() ? String(systemRaw).trim() : null;

  // 统一成单一 max_tokens（Atlas/Gemini 官方示例只用这个；双字段会 bad request）
  const maxOut = pickFiniteNumber(
    rawParams.max_tokens,
    rawParams.max_completion_tokens,
    rawParams.maxTokens
  );
  if (maxOut != null) {
    rawParams.max_tokens = maxOut;
  } else {
    delete rawParams.max_tokens;
  }

  if (typeof rawParams.topP === 'number' && Number.isFinite(rawParams.topP) && rawParams.top_p == null) {
    rawParams.top_p = rawParams.topP;
  }

  for (const k of STRIP_FROM_CHAT_BODY) {
    delete rawParams[k];
  }

  let messages: AtlasChatMessage[];
  if (Array.isArray(providedMessages)) {
    messages = providedMessages as AtlasChatMessage[];
    const hasSystem = messages.some((m) => m && String(m.role).toLowerCase() === 'system');
    if (systemPrompt && !hasSystem) {
      messages = [{ role: 'system', content: systemPrompt }, ...messages];
    }
  } else {
    messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: args.userContent });
  }

  return {
    body: {
      model: args.upstreamModel,
      ...rawParams,
      messages,
    },
    systemPrompt,
  };
}
