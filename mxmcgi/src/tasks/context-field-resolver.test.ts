import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  collectContextFieldDescriptors,
  formatKbRecallBlock,
  formatWebSearchBlock,
  WEB_SEARCH_MAX_CHARS,
  resolveContextFields,
} from './context-field-resolver';

vi.mock('../core/search/search-config', () => ({
  listUsableSearchProviderNames: vi.fn().mockResolvedValue(['tavily', 'duckduckgo']),
}));

vi.mock('../core/search/search-service', () => ({
  SearchService: class {
    autoSearch = vi.fn().mockResolvedValue({
      aggregated: [
        {
          title: 'AI 行业动态',
          snippet: 'OpenAI 发布新模型…',
          url: 'https://example.com/news',
          domain: 'example.com',
          source: 'tavily',
        },
      ],
      dimensionResults: {
        general: { provider: 'tavily', items: [] },
      },
      depth: 'standard',
    });
  },
}));

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: {
    search: vi.fn(),
  },
}));

vi.mock('../folder-index/folder-content-resolver', () => ({
  assertVirtualFolder: vi.fn(),
}));

vi.mock('@mxmai/mxmdata', () => ({
  RepositoryFactory: {
    createFolderRepository: () => ({
      getFolderPath: vi.fn().mockResolvedValue([{ name: '系列A' }, { name: '第一季' }]),
    }),
  },
}));

import { virtualFolderIndexService } from '../folder-index/virtual-folder-index-service';
import { assertVirtualFolder } from '../folder-index/folder-content-resolver';

describe('collectContextFieldDescriptors', () => {
  it('collects kbRecall and webSearch fields', () => {
    const formSchema = {
      properties: {
        prompt: { type: 'string' },
        bg_ref: { type: 'object', 'x-ui-type': 'kbRecall' },
        web1: { type: 'object', 'x-ui-type': 'webSearch' },
      },
    };
    const desc = collectContextFieldDescriptors(formSchema as any);
    expect(desc).toHaveLength(2);
    expect(desc[0]?.kind).toBe('kbRecall');
    expect(desc[1]?.kind).toBe('webSearch');
  });

  it('collects mxmKbInput fields', () => {
    const formSchema = {
      properties: {
        prompt: { type: 'string' },
        kb: { type: 'object', 'x-ui-type': 'mxmKbInput', 'x-resolve-phase': 'pre' },
      },
    };
    const desc = collectContextFieldDescriptors(formSchema as any);
    expect(desc).toHaveLength(1);
    expect(desc[0]?.kind).toBe('mxmKbInput');
  });
});

describe('format blocks', () => {
  it('truncates kb recall when exceeding max chars', () => {
    const long = 'x'.repeat(1500);
    const { text, truncated, hitCount } = formatKbRecallBlock(
      '系列A',
      '测试 query',
      [
        { content: long, similarity: 0.9 },
        { content: long, similarity: 0.8 },
        { content: long, similarity: 0.7 },
      ],
      2000
    );
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(hitCount).toBeGreaterThanOrEqual(1);
  });

  it('formats web search items with url', () => {
    const { text, hitCount } = formatWebSearchBlock(
      'standard',
      'AI news',
      [
        {
          title: 'Title',
          snippet: 'Snippet',
          url: 'https://example.com',
          domain: 'example.com',
          source: 'tavily',
        },
      ],
      WEB_SEARCH_MAX_CHARS
    );
    expect(hitCount).toBe(1);
    expect(text).toContain('Title');
    expect(text).toContain('https://example.com');
  });
});

describe('resolveContextFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertVirtualFolder).mockResolvedValue({
      id: 'folder-1',
      index_status: 'indexed',
      knowledge_base_id: 'kb-1',
      folder_kind: 'virtual',
    } as any);
    vi.mocked(virtualFolderIndexService.search).mockResolvedValue([
      { content: '召回片段 A', similarity: 0.88 },
    ] as any);
  });

  it('replaces kbRecall object with formatted string', async () => {
    const formSchema = {
      properties: {
        bg_ref: { type: 'object', 'x-ui-type': 'kbRecall' },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        bg_ref: { folderId: 'folder-1', query: '背景问题' },
      },
      state: {},
    };

    const next = await resolveContextFields(ctx as any, formSchema as any);
    expect(typeof next.params.bg_ref).toBe('string');
    expect(String(next.params.bg_ref)).toContain('召回片段 A');
    expect((next.state as any).contextFieldMeta.bg_ref.kind).toBe('kbRecall');
    expect((next.state as any).contextFieldMeta.bg_ref.itemCount).toBe(1);
    expect((next.state as any).contextFieldRaw.bg_ref).toEqual({
      folderId: 'folder-1',
      query: '背景问题',
    });
  });

  it('resolves mxmKbInput mentions into context text', async () => {
    const formSchema = {
      properties: {
        kb: { type: 'object', 'x-ui-type': 'mxmKbInput' },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        kb: {
          text: '写一篇介绍',
          mentions: [{ type: 'folder', id: 'folder-1', label: '系列A' }],
        },
      },
      state: {},
    };

    const next = await resolveContextFields(ctx as any, formSchema as any);
    expect(typeof next.params.kb).toBe('string');
    expect(String(next.params.kb)).toContain('写一篇介绍');
    expect(String(next.params.kb)).toContain('召回片段 A');
    expect((next.state as any).contextFieldMeta.kb.kind).toBe('mxmKbInput');
  });

  it('clears unfilled context field objects to empty string', async () => {
    const formSchema = {
      properties: {
        bg_ref: { type: 'object', 'x-ui-type': 'kbRecall' },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        bg_ref: { folderId: '', query: '' },
      },
      state: {},
    };
    const next = await resolveContextFields(ctx as any, formSchema as any);
    expect(next.params.bg_ref).toBe('');
  });

  it('auto webSearch from prompt when x-auto-from-prompt is set', async () => {
    const formSchema = {
      properties: {
        intel_web: { type: 'object', 'x-ui-type': 'webSearch', 'x-auto-from-prompt': true },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        prompt: '2026 年 AI 行业趋势',
        intel_web: {},
      },
      state: {},
    };
    const next = await resolveContextFields(ctx as any, formSchema as any);
    expect(typeof next.params.intel_web).toBe('string');
    expect(String(next.params.intel_web)).toContain('AI 行业动态');
    expect((next.state as any).contextFieldMeta.intel_web.itemCount).toBe(1);
    expect((next.state as any).contextFieldMeta.intel_web.items[0].searchDepth).toBe('standard');
    expect((next.state as any).contextFieldMeta.intel_web.items[0].providers).toContain('tavily');
  });

  it('resolves multiple webSearch items with different depths', async () => {
    const formSchema = {
      properties: {
        intel_web: { type: 'object', 'x-ui-type': 'webSearch', 'x-context-max-chars': 8000 },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        intel_web: {
          items: [
            { searchDepth: 'quick', query: 'Q1' },
            { searchDepth: 'deep', query: 'Q2' },
          ],
        },
      },
      state: {},
    };
    const next = await resolveContextFields(ctx as any, formSchema as any);
    const text = String(next.params.intel_web);
    expect(text).toContain('快速');
    expect(text).toContain('深度');
    expect(text).toContain('Q1');
    expect(text).toContain('Q2');
    expect((next.state as any).contextFieldMeta.intel_web.itemCount).toBe(2);
  });

  it('legacy single webSearch object still works', async () => {
    const formSchema = {
      properties: {
        market_facts: { type: 'object', 'x-ui-type': 'webSearch' },
      },
    };
    const ctx = {
      scope: 'writing',
      taskKey: 'articles',
      taskId: 't1',
      userId: 'user-1',
      params: {
        market_facts: { searchDepth: 'standard', query: 'AI news' },
      },
      state: {},
    };
    const next = await resolveContextFields(ctx as any, formSchema as any);
    expect(String(next.params.market_facts)).toContain('AI 行业动态');
  });
});
