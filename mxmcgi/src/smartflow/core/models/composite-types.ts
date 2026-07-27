/**
 * Smartflow 复合节点：统一输出信封与各模式配置
 */

import type { BusinessScope, ToolType } from './types';

export type CompositePattern = 'plan_execute' | 'reflection' | 'react' | 'research';

export type CompositeStopReason =
  | 'finished'
  | 'pass'
  | 'max_steps'
  | 'budget'
  | 'error'
  | 'user_cancel';

export interface CompositeTraceStep {
  step: number;
  phase: string;
  node_ref?: string;
  duration_ms?: number;
  summary?: string;
  tool_name?: string;
  passed?: boolean;
}

export interface CompositeUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  llm_calls: number;
  tool_calls: number;
  cost_usd?: number;
  nested_task_ids?: string[];
}

export interface CompositeNodeOutput<T = unknown> {
  pattern: CompositePattern;
  result: T;
  text?: string;
  completed: boolean;
  stop_reason: CompositeStopReason;
  meta: Record<string, unknown>;
  trace: CompositeTraceStep[];
  usage: CompositeUsage;
  _raw?: unknown;
}

export function emptyUsage(): CompositeUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    llm_calls: 0,
    tool_calls: 0,
    cost_usd: 0,
    nested_task_ids: [],
  };
}

export function mergeUsage(a: CompositeUsage, b: Partial<CompositeUsage>): CompositeUsage {
  return {
    input_tokens: a.input_tokens + (b.input_tokens ?? 0),
    output_tokens: a.output_tokens + (b.output_tokens ?? 0),
    total_tokens: a.total_tokens + (b.total_tokens ?? 0),
    llm_calls: a.llm_calls + (b.llm_calls ?? 0),
    tool_calls: a.tool_calls + (b.tool_calls ?? 0),
    cost_usd: (a.cost_usd ?? 0) + (b.cost_usd ?? 0),
    nested_task_ids: [...(a.nested_task_ids ?? []), ...(b.nested_task_ids ?? [])],
  };
}

/** text / business 子任务引用 */
export interface CompositeTaskRef {
  kind: 'text' | 'business' | 'model';
  scope?: string;
  taskKey?: string;
  subtype?: string | null;
  model?: string;
  params?: Record<string, unknown>;
}

export interface ReflectionNodeConfig {
  task?: string;
  artifact?: string;
  generator?: CompositeTaskRef;
  critic?: CompositeTaskRef;
  reviser?: CompositeTaskRef;
  pass_pattern?: string;
  max_rounds?: number;
}

export interface PlanExecuteNodeConfig {
  goal?: string;
  context?: string;
  planner?: CompositeTaskRef;
  executor?: CompositeTaskRef;
  replan_on_failure?: boolean;
  replanner?: CompositeTaskRef;
  max_steps?: number;
  max_replans?: number;
}

export interface ReactNodeConfig {
  goal?: string;
  system_prompt?: string;
  model?: string;
  tools?: ToolType[];
  tool_params?: Record<string, unknown>;
  max_steps?: number;
  max_tokens?: number;
}

export interface ResearchNodeConfig {
  topic?: string;
  context?: string;
  query_generator?: CompositeTaskRef;
  search_depth?: string;
  summarizer_model?: string;
}

export type CompositeNodeOptions =
  | ReflectionNodeConfig
  | PlanExecuteNodeConfig
  | ReactNodeConfig
  | ResearchNodeConfig;
