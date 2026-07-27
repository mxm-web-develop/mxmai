import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY,
  dimensionsFromProviderModel,
} from './knowledge-embedding-routing';
import type { ProviderModel } from '@mxmai/mxmdata';

describe('knowledge-embedding-routing', () => {
  it('DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY is qwen3-embedding-8b', () => {
    expect(DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY).toBe('qwen3-embedding-8b');
  });

  it('dimensionsFromProviderModel prefers default_parameters.dimensions', () => {
    const row = {
      default_parameters: { dimensions: 1536 },
      capabilities: { vector_dim: 4096 },
    } as ProviderModel;
    expect(dimensionsFromProviderModel(row)).toBe(1536);
  });

  it('dimensionsFromProviderModel falls back to 1536', () => {
    const row = {} as ProviderModel;
    expect(dimensionsFromProviderModel(row)).toBe(1536);
  });
});
