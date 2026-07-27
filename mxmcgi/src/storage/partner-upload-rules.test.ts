import { describe, expect, it } from 'vitest';
import { parseUploadSource } from './storage-list-helpers';

describe('parseUploadSource', () => {
  it('returns undefined for invalid values', () => {
    expect(parseUploadSource(undefined)).toBeUndefined();
    expect(parseUploadSource('invalid')).toBeUndefined();
  });

  it('parses self, partner, all', () => {
    expect(parseUploadSource('self')).toBe('self');
    expect(parseUploadSource('PARTNER')).toBe('partner');
    expect(parseUploadSource('all')).toBe('all');
  });
});

describe('partner upload storage mode', () => {
  function resolveStorageMode(input: {
    partnerAppId?: string;
    partnerEndUserId?: string;
    storageMode?: 'asset' | 'temp';
  }): 'asset' | 'temp' {
    if (input.partnerAppId && input.partnerEndUserId) return 'temp';
    return input.storageMode ?? 'asset';
  }

  it('forces temp when partner context present', () => {
    expect(
      resolveStorageMode({
        partnerAppId: 'app-1',
        partnerEndUserId: 'user-1',
        storageMode: 'asset',
      })
    ).toBe('temp');
  });

  it('respects storageMode for self uploads', () => {
    expect(resolveStorageMode({ storageMode: 'asset' })).toBe('asset');
    expect(resolveStorageMode({ storageMode: 'temp' })).toBe('temp');
  });
});
