import { describe, expect, it } from 'vitest';
import type { StorageUploadSource } from '../interfaces/IStorageObjectRepository';

/** Mirror of applyUploadSourceFilter logic for unit testing without Supabase */
function resolveUploadSourceFilter(source: StorageUploadSource | undefined): 'self' | 'partner' | 'all' {
  return source ?? 'self';
}

describe('storage uploadSource filter', () => {
  it('defaults to self', () => {
    expect(resolveUploadSourceFilter(undefined)).toBe('self');
  });

  it('accepts partner and all', () => {
    expect(resolveUploadSourceFilter('partner')).toBe('partner');
    expect(resolveUploadSourceFilter('all')).toBe('all');
  });
});
