import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService, resetStorageService } from '../../storage/StorageService';
import type { SystemStorageConfig } from '../../storage/StorageDomainConfig';

const mockUpload = vi.fn().mockResolvedValue({
  url: 'http://localhost:9000/mxm-uploads/upload/u1/assets/_/20260603/x.jpg',
  key: 'upload/u1/assets/_/20260603/x.jpg',
  bucket: 'mxm-uploads',
});

vi.mock('../../storage/adapters/S3StorageAdapter', () => ({
  S3StorageAdapter: class MockS3StorageAdapter {
    uploadFile = mockUpload;
    downloadFile = vi.fn();
    deleteFile = vi.fn();
  },
}));

describe('StorageService', () => {
  const config: SystemStorageConfig = {
    version: 1,
    domains: {
      generated: { provider: 'minio', bucket: 'mxm-generated', accessMode: 'proxy' },
      user_upload: { provider: 'minio', bucket: 'mxm-uploads', accessMode: 'proxy' },
      system_static: { provider: 'r2', bucket: 'mxm-static', accessMode: 'public', publicBaseUrl: 'https://cdn.example.com' },
    },
  };

  beforeEach(() => {
    resetStorageService();
    mockUpload.mockClear();
    process.env.PUBLIC_GATEWAY_ORIGIN = 'http://localhost:3000';
  });

  afterEach(() => {
    resetStorageService();
  });

  it('upload to user_upload uses USER_UPLOAD bucket', async () => {
    const service = new StorageService(config);
    const result = await service.upload({
      domain: 'user_upload',
      purpose: 'reference',
      userId: 'u1',
      buffer: Buffer.from('img'),
      contentType: 'image/jpeg',
      pathVars: { yyyy: '20260603', uuid: 'x', ext: 'jpg', folderPath: '_' },
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'mxm-uploads',
      'upload/u1/assets/_/20260603/x.jpg',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
    expect(result.bucket).toBe('mxm-uploads');
    expect(result.domain).toBe('user_upload');
    expect(result.url).toContain('/api/v1/media/asset');
  });
});
