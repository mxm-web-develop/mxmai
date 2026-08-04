import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mxmai/mxmdata', () => ({
  RepositoryFactory: {
    createSearchScopeConfigRepository: () => ({
      findByProvider: async () => null,
      upsertConfig: async (row: { provider: string; extra?: { api_keys?: string[] } }) => ({
        enabled: true,
        extra: { api_keys: row.extra?.api_keys ?? [] },
      }),
    }),
  },
}));

import {
  clearSearchConfigCache,
  getCurrentApiKey,
  listApiKeysInPriority,
  promoteApiKey,
  promoteApiKeyAndPersist,
  seedSearchProviderKeysForTest,
} from './search-config';

describe('search api key priority', () => {
  beforeEach(() => {
    clearSearchConfigCache();
  });

  it('getCurrentApiKey 固定返回优先级第一，不轮询', () => {
    seedSearchProviderKeysForTest('tavily', ['key-a', 'key-b']);
    expect(getCurrentApiKey('tavily')).toBe('key-a');
    expect(getCurrentApiKey('tavily')).toBe('key-a');
    expect(listApiKeysInPriority('tavily')).toEqual(['key-a', 'key-b']);
  });

  it('promoteApiKey 将成功 Key 置顶', () => {
    seedSearchProviderKeysForTest('tavily', ['key-a', 'key-b']);
    expect(promoteApiKey('tavily', 'key-b')).toBe(true);
    expect(listApiKeysInPriority('tavily')).toEqual(['key-b', 'key-a']);
    expect(getCurrentApiKey('tavily')).toBe('key-b');
    expect(promoteApiKey('tavily', 'key-b')).toBe(false);
  });

  it('promoteApiKeyAndPersist 置顶后仍保持顺序', async () => {
    seedSearchProviderKeysForTest('tavily', ['key-a', 'key-b']);
    promoteApiKeyAndPersist('tavily', 'key-b');
    expect(listApiKeysInPriority('tavily')).toEqual(['key-b', 'key-a']);
    // 等异步落库完成（mock）
    await new Promise((r) => setTimeout(r, 20));
    expect(listApiKeysInPriority('tavily')[0]).toBe('key-b');
  });
});
