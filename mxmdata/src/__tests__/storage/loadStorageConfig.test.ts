import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadStorageConfig } from '../../storage/loadStorageConfig';

describe('loadStorageConfig', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('returns independent provider/bucket per domain from env', () => {
    process.env.STORAGE_GENERATED_PROVIDER = 'r2';
    process.env.STORAGE_GENERATED_BUCKET = 'mxm-generated';
    process.env.STORAGE_USER_UPLOAD_PROVIDER = 'minio';
    process.env.STORAGE_USER_UPLOAD_BUCKET = 'mxm-uploads';
    process.env.STORAGE_SYSTEM_STATIC_PROVIDER = 'aliyun_oss';
    process.env.STORAGE_SYSTEM_STATIC_BUCKET = 'mxm-static';

    const config = loadStorageConfig();

    expect(config.version).toBe(1);
    expect(config.domains.generated.provider).toBe('r2');
    expect(config.domains.generated.bucket).toBe('mxm-generated');
    expect(config.domains.user_upload.provider).toBe('minio');
    expect(config.domains.user_upload.bucket).toBe('mxm-uploads');
    expect(config.domains.system_static.provider).toBe('aliyun_oss');
    expect(config.domains.system_static.bucket).toBe('mxm-static');
  });

  it('falls back to legacy CGI_STORAGE_BUCKET for generated', () => {
    process.env.CGI_STORAGE_BUCKET = 'user-media';
    delete process.env.STORAGE_GENERATED_BUCKET;

    const config = loadStorageConfig();

    expect(config.domains.generated.bucket).toBe('user-media');
  });

  it('auto-detects R2 for user_upload when R2 credentials exist', () => {
    delete process.env.STORAGE_USER_UPLOAD_PROVIDER;
    delete process.env.STORAGE_USER_UPLOAD_BUCKET;
    process.env.R2_ACCESS_KEY = 'test-key';
    process.env.R2_SECRET_KEY = 'test-secret';
    process.env.R2_BUCKET = 'user-assets';

    const config = loadStorageConfig();

    expect(config.domains.user_upload.provider).toBe('r2');
    expect(config.domains.user_upload.bucket).toBe('user-assets');
  });

  it('uses legacy bucket for user_upload when no R2 credentials', () => {
    process.env.CGI_STORAGE_BUCKET = 'user-media';
    delete process.env.STORAGE_USER_UPLOAD_PROVIDER;
    delete process.env.STORAGE_USER_UPLOAD_BUCKET;
    delete process.env.R2_ACCESS_KEY;
    delete process.env.R2_SECRET_KEY;

    const config = loadStorageConfig();

    expect(config.domains.user_upload.provider).toBe('minio');
    expect(config.domains.user_upload.bucket).toBe('user-media');
  });
});
