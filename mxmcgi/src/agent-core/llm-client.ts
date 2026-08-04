/**
 * OpenAI-compatible chat completions（支持 tools / tool_calls）
 * 用于 Agent loop；优先走 Admin 配置的 provider。
 */

import { fetch as undiciFetch } from 'undici';
import { getFirstProviderKey } from '../models/providers';
import { requireUpstreamPhysicalId } from '../models/physical-model-id';
import { findEnabledModelWithReload } from '../models/provider-model-catalog';
import { extractMaxplanChatText } from '../models/maxplan/provider';
import type { AgentAdminConfig, AgentChatMessage, AgentToolCall, AgentToolDefinition } from './types';

export interface ChatCompletionResult {
  content: string | null;
  /** 模型思维链（如 MiniMax reasoning_split） */
  reasoning: string | null;
  tool_calls: AgentToolCall[];
  finish_reason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface ProviderEndpoint {
  provider: string;
  baseUrl: string;
  apiKey: string;
  upstreamModel: string;
  headers?: Record<string, string>;
}

const PROVIDER_BASE: Record<string, { envKey: string; baseEnv?: string; base: string }> = {
  openrouter: {
    envKey: 'OPENROUTER_API_KEY',
    baseEnv: 'OPENROUTER_BASE_URL',
    base: 'https://openrouter.ai/api/v1',
  },
  openai: {
    envKey: 'OPENAI_API_KEY',
    baseEnv: 'OPENAI_BASE_URL',
    base: 'https://api.openai.com/v1',
  },
  deer: {
    envKey: 'DEERAPI_API_KEY',
    baseEnv: 'DEERAPI_BASE_URL',
    base: '',
  },
  deerapi: {
    envKey: 'DEERAPI_API_KEY',
    baseEnv: 'DEERAPI_BASE_URL',
    base: '',
  },
  /** MiniMax TokenPlan（国内）；OpenAI 兼容 /v1/chat/completions */
  maxplan: {
    envKey: 'MAXPLAN_API_KEY',
    baseEnv: 'MAXPLAN_BASE_URL',
    base: 'https://api.minimaxi.com/v1',
  },
};

function normalizeAssistantContent(
  provider: string,
  message: Record<string, unknown>,
  opts?: { preserveRawForTools?: boolean }
): string | null {
  const raw =
    typeof message.content === 'string'
      ? message.content
      : message.content == null
        ? null
        : String(message.content);

  if (provider !== 'maxplan') return raw;

  // tool_calls 轮次必须保留 thinking 原文，否则 MiniMax interleaved thinking 会断
  if (opts?.preserveRawForTools) return raw;

  const cleaned = extractMaxplanChatText(message);
  if (cleaned) return cleaned;
  // 仅有 thinking、无可见正文时，避免返回空串导致前端无回复
  if (raw && /<\/?(?:think|redacted_thinking)\b/i.test(raw)) {
    const stripped = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '')
      .trim();
    if (stripped) return stripped;
  }
  return cleaned || raw;
}

async function resolveEndpoint(cfg: AgentAdminConfig): Promise<ProviderEndpoint> {
  const preferred = (cfg.provider || '').trim() || undefined;
  const row = await findEnabledModelWithReload({
    modelKey: cfg.model_key,
    scope: 'text',
    provider: preferred as any,
  });
  if (!row) {
    throw new Error(
      `Agent 模型未启用: model_key=${cfg.model_key}${preferred ? `, provider=${preferred}` : ''}`
    );
  }

  const provider = row.provider;
  const meta = PROVIDER_BASE[provider];
  if (!meta) {
    throw new Error(
      `不支持的 Agent LLM provider: ${provider}（当前仅支持 ${Object.keys(PROVIDER_BASE).join(', ')}）`
    );
  }

  const rawKey =
    (await getFirstProviderKey(provider as any)) ||
    process.env[meta.envKey] ||
    (provider === 'openrouter' || provider === 'openai' || provider === 'deer' || provider === 'deerapi'
      ? process.env.OPENROUTER_API_KEY || process.env.DEERAPI_API_KEY
      : undefined);
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!apiKey) {
    throw new Error(`Agent LLM 缺少 API Key：provider=${provider}`);
  }

  let upstreamModel = cfg.model_key;
  try {
    upstreamModel = requireUpstreamPhysicalId(provider as any, cfg.model_key);
  } catch {
    upstreamModel = row.upstream_model || cfg.model_key;
  }

  // maxplan Provider 默认 host 不含 /v1；Agent 走 OpenAI 兼容路径需要 /v1
  let baseUrl = (meta.baseEnv && process.env[meta.baseEnv]) || meta.base;
  if (provider === 'maxplan') {
    const host = (baseUrl || 'https://api.minimaxi.com').replace(/\/+$/, '');
    baseUrl = host.endsWith('/v1') ? host : `${host}/v1`;
  }
  if (!baseUrl) {
    throw new Error(`Agent LLM 缺少 Base URL：provider=${provider}（请配置 ${meta.baseEnv || 'BASE_URL'}）`);
  }
  const headers: Record<string, string> = {};
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://supermxmai.com';
    headers['X-OpenRouter-Title'] = 'SuperMXMai Agent';
  }

  return {
    provider,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    upstreamModel,
    headers,
  };
}

export async function chatCompletion(args: {
  config: AgentAdminConfig;
  messages: AgentChatMessage[];
  tools?: AgentToolDefinition[];
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  const endpoint = await resolveEndpoint(args.config);
  const body: Record<string, unknown> = {
    model: endpoint.upstreamModel,
    messages: args.messages,
    temperature: args.config.temperature,
    stream: false,
  };
  // maxplan M3：成稿默认关思考；仅工具调用轮次开 adaptive（Agent 需要 interleaved thinking）
  if (endpoint.provider === 'maxplan') {
    body.reasoning_split = true;
    const hasTools = Boolean(args.tools && args.tools.length > 0);
    if (body.thinking === undefined) {
      body.thinking = hasTools ? { type: 'adaptive' } : { type: 'disabled' };
    }
    if (args.config.max_tokens == null) body.max_tokens = 20_000;
  }
  if (args.config.max_tokens != null) body.max_tokens = args.config.max_tokens;
  if (args.config.top_p != null) body.top_p = args.config.top_p;
  if (args.config.frequency_penalty != null) body.frequency_penalty = args.config.frequency_penalty;
  if (args.config.presence_penalty != null) body.presence_penalty = args.config.presence_penalty;
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = 'auto';
  }

  const resp = await undiciFetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.apiKey}`,
      ...(endpoint.headers || {}),
    },
    body: JSON.stringify(body),
    signal: args.signal as any,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `LLM chat.completions failed (${resp.status}) provider=${endpoint.provider} model=${endpoint.upstreamModel} base=${endpoint.baseUrl}: ${text.slice(0, 500)}`
    );
  }

  const json = (await resp.json()) as any;
  const choice = json?.choices?.[0];
  const message = choice?.message ?? {};
  const toolCalls: AgentToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((tc: any) => ({
        id: String(tc.id || `call_${Math.random().toString(36).slice(2, 8)}`),
        type: 'function' as const,
        function: {
          name: String(tc.function?.name || ''),
          arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
        },
      }))
    : [];

  return {
    content: normalizeAssistantContent(endpoint.provider, message as Record<string, unknown>, {
      preserveRawForTools: toolCalls.length > 0,
    }),
    reasoning:
      typeof message.reasoning_content === 'string' && message.reasoning_content.trim()
        ? String(message.reasoning_content).trim()
        : null,
    tool_calls: toolCalls,
    finish_reason: choice?.finish_reason ?? null,
    usage: json?.usage,
  };
}

/** 无 tools 的简易流式：逐 chunk 回调，用于 M1 纯文本回复 */
export async function streamChatText(args: {
  config: AgentAdminConfig;
  messages: AgentChatMessage[];
  onDelta: (text: string) => Promise<void> | void;
  signal?: AbortSignal;
}): Promise<{ content: string; usage?: ChatCompletionResult['usage'] }> {
  const endpoint = await resolveEndpoint(args.config);
  const body: Record<string, unknown> = {
    model: endpoint.upstreamModel,
    messages: args.messages,
    temperature: args.config.temperature,
    stream: true,
  };
  if (args.config.max_tokens != null) body.max_tokens = args.config.max_tokens;
  if (args.config.top_p != null) body.top_p = args.config.top_p;

  const resp = await undiciFetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.apiKey}`,
      ...(endpoint.headers || {}),
    },
    body: JSON.stringify(body),
    signal: args.signal as any,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`LLM stream failed (${resp.status}): ${text.slice(0, 500)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('LLM stream body missing');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          content += delta;
          await args.onDelta(delta);
        }
      } catch {
        /* ignore partial */
      }
    }
  }

  return { content };
}
