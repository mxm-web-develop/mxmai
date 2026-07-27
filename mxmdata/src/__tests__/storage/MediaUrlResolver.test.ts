import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveStorageUrl,
  userUploadPublicObjectPath,
  defaultUserUploadGatewayPublicBase,
} from '../../storage/MediaUrlResolver';

describe('MediaUrlResolver user upload public', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('builds gateway public object path', () => {
    process.env.PUBLIC_GATEWAY_ORIGIN = 'http://8.216.100.106';
    process.env.PUBLIC_GATEWAY_ABSOLUTE_URLS = '1';
    expect(userUploadPublicObjectPath('obj-1')).toBe(
      'http://8.216.100.106/api/v1/media/public/object/obj-1'
    );
  });

  it('resolveStorageUrl uses public gateway object URL for minio public mode', () => {
    process.env.PUBLIC_GATEWAY_ORIGIN = 'http://8.216.100.106';
    const publicBase = defaultUserUploadGatewayPublicBase();
    expect(publicBase).toBe('http://8.216.100.106/api/v1/media/public');

    const url = resolveStorageUrl({
      domain: 'user_upload',
      domainConfig: {
        provider: 'minio',
        bucket: 'user-assets',
        accessMode: 'public',
        publicBaseUrl: publicBase,
      },
      bucket: 'user-assets',
      key: 'upload/u1/reference/x.jpg',
      objectId: 'abc-123',
      gatewayOrigin: 'http://8.216.100.106',
    });

    expect(url).toBe('http://8.216.100.106/api/v1/media/public/object/abc-123');
  });

  it('resolveStorageUrl uses CDN key URL for R2 public mode', () => {
    const url = resolveStorageUrl({
      domain: 'user_upload',
      domainConfig: {
        provider: 'r2',
        bucket: 'user-assets',
        accessMode: 'public',
        publicBaseUrl: 'https://pub.example.r2.dev',
      },
      bucket: 'user-assets',
      key: 'upload/u1/reference/x.jpg',
      objectId: 'abc-123',
    });
    expect(url).toBe('https://pub.example.r2.dev/upload/u1/reference/x.jpg');
  });
});
