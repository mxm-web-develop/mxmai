/**
 * 平台 LLM 产出预算策略（成稿路径）：
 * - thinking 默认关闭；工具/Agent 轮次才开
 * - finish_reason=length：关思考重试 → continue 续写 → 再失败
 * - 观测字段供 pipelineTrace / Admin 调预算策略（勿盲目加 maxTokens）
 */

export type LlmBudgetAttempt = {
  phase: 'initial' | 'disable_thinking_retry' | 'continue';
  finish_reason?: string | null;
  completion_tokens?: number;
  had_reasoning: boolean;
  content_chars: number;
};

export type LlmBudgetReport = {
  attempts: LlmBudgetAttempt[];
  finish_reason?: string | null;
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
  had_reasoning: boolean;
  truncated: boolean;
  continued: boolean;
  thinking_disabled_retry: boolean;
};

export function emptyBudgetReport(): LlmBudgetReport {
  return {
    attempts: [],
    had_reasoning: false,
    truncated: false,
    continued: false,
    thinking_disabled_retry: false,
  };
}

export function usageFromMeta(meta: Record<string, unknown> | undefined | null): {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
} {
  const usage = (meta?.usage && typeof meta.usage === 'object' ? meta.usage : {}) as Record<
    string,
    unknown
  >;
  const n = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined;
  return {
    completion_tokens: n(usage.completion_tokens ?? usage.output_tokens),
    prompt_tokens: n(usage.prompt_tokens ?? usage.input_tokens),
    total_tokens: n(usage.total_tokens),
  };
}

export function budgetFromGenerateMetadata(meta: Record<string, unknown> | undefined | null): LlmBudgetReport {
  const base = emptyBudgetReport();
  if (!meta) return base;
  const usage = usageFromMeta(meta);
  const finish = meta.finish_reason != null ? String(meta.finish_reason) : null;
  const fromProvider = meta.budget as LlmBudgetReport | undefined;
  if (fromProvider && typeof fromProvider === 'object' && Array.isArray(fromProvider.attempts)) {
    return {
      ...fromProvider,
      completion_tokens: fromProvider.completion_tokens ?? usage.completion_tokens,
      prompt_tokens: fromProvider.prompt_tokens ?? usage.prompt_tokens,
      total_tokens: fromProvider.total_tokens ?? usage.total_tokens,
      finish_reason: fromProvider.finish_reason ?? finish,
    };
  }
  return {
    ...base,
    ...usage,
    finish_reason: finish,
    truncated: finish === 'length',
    had_reasoning: Boolean(meta.had_reasoning),
  };
}

/** 成稿路径：禁止把 reasoning 当正文；观测用 */
export const MANUSCRIPT_CONTINUE_USER_PROMPT =
  '请从断点处严格续写未完成部分。不要重复已输出内容，不要输出思考过程或元评论，直接继续正文。';
