import { describe, it, expect } from 'vitest';
import { resolveProviderCredentials } from '../../storage/resolveProviderCredentials';

describe('resolveProviderCredentials', () => {
  it('resolves minio endpoint from env', () => {
    const creds = resolveProviderCredentials('minio');
    expect(creds.endpoint).toContain('localhost');
    expect(creds.forcePathStyle).toBe(true);
  });

  it('resolves r2 endpoint from env', () => {
    process.env.R2_ENDPOINT = 'account.r2.cloudflarestorage.com';
    process.env.R2_ACCESS_KEY = 'key';
    process.env.R2_SECRET_KEY = 'secret';
    const creds = resolveProviderCredentials('r2');
    expect(creds.endpoint).toContain('account.r2.cloudflarestorage.com');
  });

  it('throws when R2_ENDPOINT is empty', () => {
    delete process.env.R2_ENDPOINT;
    expect(() => resolveProviderCredentials('r2')).toThrow(/R2_ENDPOINT/);
  });

  it('resolves aliyun_oss endpoint from env', () => {
    process.env.OSS_ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com';
    const creds = resolveProviderCredentials('aliyun_oss');
    expect(creds.endpoint).toContain('oss-cn-hangzhou.aliyuncs.com');
    expect(creds.forcePathStyle).toBe(false);
  });
});
