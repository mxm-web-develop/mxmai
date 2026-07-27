/**
 * Agent Chat v2 — 类型与配置
 */

import type { AgentReference, AgentMessagePart } from '@mxmai/mxmdata';

export interface AgentAllowedBusiness {
  scope: string;
  taskKey: string;
  subtype?: string | null;
}

export interface AgentAdminConfig {
  model_key: string;
  provider: string | null;
  temperature: number;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  max_loop_rounds: number;
  run_timeout_ms: number;
  system_prompt_extra: string | null;
  tools_enabled: boolean;
  /** null = 全部；[] = 禁止；非空 = 白名单 */
  allowed_businesses: AgentAllowedBusiness[] | null;
  smartflow_enabled: boolean;
}

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AgentToolCall[];
}

export interface AgentToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentToolContext {
  userId: string;
  conversationId: string;
  runId: string;
  references: AgentReference[];
  /** 模块 Agent 硬绑定；主助手为 null */
  conversationScope: string | null;
  emit: (type: string, payload?: Record<string, unknown>) => Promise<void>;
  signal?: AbortSignal;
}

export interface AgentToolResult {
  ok: boolean;
  content: string;
  data?: Record<string, unknown>;
}

export type AgentToolHandler = (
  args: Record<string, unknown>,
  ctx: AgentToolContext
) => Promise<AgentToolResult>;

export interface RegisteredTool {
  definition: AgentToolDefinition;
  handler: AgentToolHandler;
}

export interface PostMessageBody {
  content: string | AgentMessagePart[];
  references?: AgentReference[];
}

let _cached: AgentAdminConfig | null = null;
let _cacheAt = 0;
const CACHE_TTL = 30_000;

export async function loadAgentAdminConfig(): Promise<AgentAdminConfig> {
  const now = Date.now();
  if (_cached && now - _cacheAt < CACHE_TTL) return _cached;

  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createModelConfigRepository();
    const cfg = await repo.getConfig();
    _cached = {
      model_key: cfg.model_key,
      provider: cfg.provider ?? null,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      top_p: cfg.top_p,
      frequency_penalty: cfg.frequency_penalty,
      presence_penalty: cfg.presence_penalty,
      max_loop_rounds: cfg.max_loop_rounds ?? 12,
      run_timeout_ms: cfg.run_timeout_ms ?? 600_000,
      system_prompt_extra: cfg.system_prompt_extra ?? null,
      tools_enabled: cfg.tools_enabled !== false,
      allowed_businesses: cfg.allowed_businesses ?? null,
      smartflow_enabled: cfg.smartflow_enabled !== false,
    };
    _cacheAt = now;
    return _cached;
  } catch (err) {
    console.warn('[agent-core] loadAgentAdminConfig failed, using defaults:', err);
    if (!_cached) {
      _cached = {
        model_key: 'deer/glm-5-turbo',
        provider: null,
        temperature: 0.7,
        max_tokens: null,
        top_p: null,
        frequency_penalty: null,
        presence_penalty: null,
        max_loop_rounds: 12,
        run_timeout_ms: 600_000,
        system_prompt_extra: null,
        tools_enabled: true,
        allowed_businesses: null,
        smartflow_enabled: true,
      };
      _cacheAt = now;
    }
    return _cached;
  }
}

/** 业务是否在 Admin 白名单内（null=全部允许） */
export function isBusinessAllowed(
  cfg: AgentAdminConfig,
  scope: string,
  taskKey: string,
  subtype?: string | null
): boolean {
  const list = cfg.allowed_businesses;
  if (list == null) return true;
  if (list.length === 0) return false;
  const sub = subtype == null || subtype === '' ? null : String(subtype);
  return list.some((b) => {
    if (b.scope !== scope || b.taskKey !== taskKey) return false;
    const bs = b.subtype == null || b.subtype === '' ? null : String(b.subtype);
    // 白名单条目未指定 subtype 时匹配该 taskKey 下所有 subtype
    if (bs == null) return true;
    return bs === sub;
  });
}

export function clearAgentAdminConfigCache(): void {
  _cached = null;
  _cacheAt = 0;
}

export function normalizeMessageContent(content: string | AgentMessagePart[]): AgentMessagePart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

export function partsToPlainText(parts: AgentMessagePart[]): string {
  return parts
    .map((p) => {
      if (p.type === 'text') return p.text ?? '';
      if (p.type === 'image') return p.url ? `[图片:${p.url}]` : '[图片]';
      if (p.type === 'file') return p.name ? `[文件:${p.name}]` : '[文件]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
