import { describe, it, expect, vi, beforeEach } from 'vitest';

const listMock = vi.fn();

vi.mock('@mxmai/mxmdata', () => ({
  RepositoryFactory: {
    createProviderModelRepository: () => ({
      list: listMock,
    }),
  },
}));

vi.mock('./providers', () => ({
  providerFactory: {
    loadProviderCatalog: vi.fn(async () => {}),
  },
}));

describe('findEnabledModelWithReload', () => {
  beforeEach(async () => {
    vi.resetModules();
    listMock.mockReset();
  });

  it('reloads catalog once when first lookup misses then hits', async () => {
    const deerWriting = {
      provider: 'deer',
      model_key: 'gemini-3.5-flash',
      upstream_model: 'gemini-3.5-flash',
      scope: 'writing',
    };
    const deerText = {
      provider: 'deer',
      model_key: 'gemini-3.5-flash',
      upstream_model: null,
      scope: 'text',
    };

    listMock
      .mockResolvedValueOnce([deerWriting])
      .mockResolvedValueOnce([deerWriting, deerText]);

    const { loadProviderModelCatalog, findEnabledModelWithReload } = await import(
      './provider-model-catalog'
    );

    await loadProviderModelCatalog();
    const row = await findEnabledModelWithReload({
      modelKey: 'gemini-3.5-flash',
      scope: 'text',
      provider: 'deer',
    });

    expect(row?.scope).toBe('text');
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('falls back from writing scope to text scope for shared chat models', async () => {
    const m3Text = {
      provider: 'maxplan',
      model_key: 'MiniMax-M3',
      upstream_model: 'MiniMax-M3',
      scope: 'text',
      is_enabled: true,
    };

    listMock.mockResolvedValueOnce([m3Text]);

    const { loadProviderModelCatalog, findEnabledModel } = await import('./provider-model-catalog');

    await loadProviderModelCatalog();
    const row = findEnabledModel({
      modelKey: 'MiniMax-M3',
      scope: 'writing',
      provider: 'maxplan',
    });

    expect(row?.scope).toBe('text');
    expect(row?.model_key).toBe('MiniMax-M3');
  });

  it('aliases deprecated maxplan MiniMax-M3-highspeed to MiniMax-M3', async () => {
    const m3Text = {
      provider: 'maxplan',
      model_key: 'MiniMax-M3',
      upstream_model: 'MiniMax-M3',
      scope: 'text',
      is_enabled: true,
    };

    listMock.mockResolvedValueOnce([m3Text]);

    const { loadProviderModelCatalog, findEnabledModel } = await import('./provider-model-catalog');

    await loadProviderModelCatalog();
    const row = findEnabledModel({
      modelKey: 'MiniMax-M3-highspeed',
      scope: 'text',
      provider: 'maxplan',
    });

    expect(row?.model_key).toBe('MiniMax-M3');
  });
});
