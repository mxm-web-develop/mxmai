import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@mxmai/mxmdata', () => ({
  RepositoryFactory: {},
}));

vi.mock('./types', () => ({
  isBusinessAllowed: () => true,
  loadAgentAdminConfig: vi.fn(),
}));

vi.mock('../agent/build-catalog', () => ({
  buildAgentCatalog: vi.fn(),
}));

vi.mock('./business-display', () => ({
  formatBusinessDisplayName: (x: any) => x.taskLabel || x.taskKey,
  resolveBusinessDisplayName: vi.fn().mockResolvedValue('演示业务'),
}));

import { buildToolRegistry } from './tools';
import { loadAgentAdminConfig } from './types';
import { buildAgentCatalog } from '../agent/build-catalog';

describe('module agent scope hard limit', () => {
  beforeEach(() => {
    vi.mocked(loadAgentAdminConfig).mockResolvedValue({
      model_key: 'x',
      provider: null,
      temperature: 0.7,
      max_tokens: null,
      top_p: null,
      frequency_penalty: null,
      presence_penalty: null,
      max_loop_rounds: 12,
      run_timeout_ms: 600000,
      system_prompt_extra: null,
      tools_enabled: true,
      allowed_businesses: null,
      smartflow_enabled: false,
    } as any);
    vi.mocked(buildAgentCatalog).mockResolvedValue({
      taskV2: [
        { scope: 'writing', taskKey: 'articles', subtype: null, taskLabel: '文章', fields: [], required: [] },
        { scope: 'graph', taskKey: 'design', subtype: 'logo', taskLabel: 'Logo', fields: [], required: [] },
      ],
      smartflows: [],
    } as any);
  });

  it('list_business_catalog filters by conversationScope', async () => {
    const tools = buildToolRegistry();
    const list = tools.find((t) => t.definition.function.name === 'list_business_catalog')!;
    const result = await list.handler(
      {},
      {
        userId: 'u1',
        conversationId: 'c1',
        runId: 'r1',
        references: [],
        conversationScope: 'writing',
        emit: async () => undefined,
      }
    );
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed.taskV2).toHaveLength(1);
    expect(parsed.taskV2[0].scope).toBe('writing');
  });

  it('run_business_task rejects other scope', async () => {
    const tools = buildToolRegistry();
    const run = tools.find((t) => t.definition.function.name === 'run_business_task')!;
    const result = await run.handler(
      { scope: 'graph', taskKey: 'design', params: {} },
      {
        userId: 'u1',
        conversationId: 'c1',
        runId: 'r1',
        references: [],
        conversationScope: 'writing',
        emit: async () => undefined,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.content).toContain('writing');
  });
});
