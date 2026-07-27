import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageAdapter } from '../../storage/adapters/S3StorageAdapter';
import type { ProviderCredentials } from '../../storage/StorageProvider';

const minioCreds: ProviderCredentials = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  forcePathStyle: true,
  publicBaseUrl: 'http://localhost:9000',
};

describe('S3StorageAdapter', () => {
  let send: ReturnType<typeof vi.fn>;
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue({});
    adapter = new S3StorageAdapter(minioCreds, { send } as unknown as import('@aws-sdk/client-s3').S3Client);
  });

  it('uploadFile returns bucket and key', async () => {
    const file = Buffer.from('hello');
    const result = await adapter.uploadFile('test-bucket', 'upload/u1/ref/x.jpg', file, {
      contentType: 'image/jpeg',
    });

    expect(result.bucket).toBe('test-bucket');
    expect(result.key).toBe('upload/u1/ref/x.jpg');
    expect(send).toHaveBeenCalled();
  });
});
