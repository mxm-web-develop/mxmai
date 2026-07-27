/**
 * Graph 提示词生成（含嵌套 text / promptTextTaskKey）失败时的结构化错误
 */

export type GraphPromptFailurePhase = 'prompt_text_task' | 'prompt_config' | 'prompt_generation';

export interface GraphPromptFailureDetails {
  phase: GraphPromptFailurePhase;
  promptTextTaskKey?: string;
  textScope?: string;
  textTaskKey?: string;
  textSubtype?: string | null;
  graphTaskKey?: string;
  graphSubtype?: string | null;
  nestedTaskId?: string;
  cause?: string;
}

export class GraphPromptGenerationError extends Error {
  readonly details: GraphPromptFailureDetails;

  constructor(message: string, details: GraphPromptFailureDetails) {
    super(message);
    this.name = 'GraphPromptGenerationError';
    this.details = details;
  }
}

export function formatGraphPromptFailureForTaskError(err: unknown): {
  message: string;
  metadataPatch?: Record<string, unknown>;
} {
  if (err instanceof GraphPromptGenerationError) {
    const d = err.details;
    const key = d.promptTextTaskKey || (d.textTaskKey ? `text/${d.textTaskKey}` : undefined);
    const suffix = key ? `（子业务 promptTextTaskKey=${key}）` : '';
    return {
      message: `${err.message}${suffix}`,
      metadataPatch: {
        graph_prompt_failure: d,
        ...(key ? { failed_prompt_text_task_key: key } : {}),
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { message };
}
