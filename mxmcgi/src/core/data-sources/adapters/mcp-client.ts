/**
 * 轻量 MCP HTTP 客户端（JSON-RPC 2.0）
 * 用于北大法宝等 MCP 网关
 */

export interface McpToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpClientOptions {
  url: string;
  apiKey: string;
  timeoutMs?: number;
}

export async function callMcpTool(
  options: McpClientOptions,
  params: McpToolCallParams
): Promise<unknown> {
  const { url, apiKey, timeoutMs = 30000 } = options;

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: params.name,
      arguments: params.arguments,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    result?: { content?: Array<{ type: string; text?: string }> };
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(data.error.message || 'MCP tool call failed');
  }

  const textContent = data.result?.content?.find((c) => c.type === 'text')?.text;
  if (textContent) {
    try {
      return JSON.parse(textContent);
    } catch {
      return textContent;
    }
  }
  return data.result ?? null;
}
