import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseStorageObjectRepository } from '../../adapters/supabase/SupabaseStorageObjectRepository';

function mockClient() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({
    data: {
      id: 'obj-1',
      user_id: 'u1',
      domain: 'user_upload',
      provider: 'minio',
      bucket: 'mxm-uploads',
      object_key: 'upload/u1/reference/20260603/x.jpg',
      purpose: 'reference',
      storage_mode: 'asset',
      folder_id: null,
      content_type: 'image/jpeg',
      size_bytes: 100,
      original_name: 'x.jpg',
      metadata: {},
      expires_at: null,
      deleted_at: null,
      created_at: '2026-06-03T00:00:00Z',
    },
    error: null,
  });
  chain.update = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  return chain;
}

describe('SupabaseStorageObjectRepository', () => {
  it('create returns storage object record', async () => {
    const client = mockClient();
    const repo = new SupabaseStorageObjectRepository(client as unknown as import('@supabase/supabase-js').SupabaseClient);
    const row = await repo.create({
      user_id: 'u1',
      domain: 'user_upload',
      provider: 'minio',
      bucket: 'mxm-uploads',
      object_key: 'upload/u1/reference/20260603/x.jpg',
      purpose: 'reference',
    });
    expect(row.id).toBe('obj-1');
    expect(row.domain).toBe('user_upload');
  });
});
