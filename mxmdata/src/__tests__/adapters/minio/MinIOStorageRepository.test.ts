/**
 * MinIO Storage Repository 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MinIOStorageRepository } from '../../../adapters/minio/MinIOStorageRepository';
import { NotFoundError, DataAccessError } from '../../../interfaces/errors';

// Mock MinIO Client
const mockMinIOClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
  removeObject: vi.fn(),
  statObject: vi.fn(),
  presignedGetObject: vi.fn(),
  copyObject: vi.fn(),
  listObjects: vi.fn(),
};

describe('MinIOStorageRepository', () => {
  let repository: MinIOStorageRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new MinIOStorageRepository(mockMinIOClient as any);
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      mockMinIOClient.bucketExists.mockResolvedValue(true);
      mockMinIOClient.putObject.mockResolvedValue(undefined);

      const file = Buffer.from('test content');
      const result = await repository.uploadFile('test-bucket', 'test-key', file, {
        contentType: 'text/plain',
      });

      expect(result.bucket).toBe('test-bucket');
      expect(result.key).toBe('test-key');
      expect(mockMinIOClient.putObject).toHaveBeenCalled();
    });

    it('should create bucket if not exists', async () => {
      mockMinIOClient.bucketExists.mockResolvedValue(false);
      mockMinIOClient.makeBucket.mockResolvedValue(undefined);
      mockMinIOClient.putObject.mockResolvedValue(undefined);

      const file = Buffer.from('test content');
      await repository.uploadFile('new-bucket', 'test-key', file);

      expect(mockMinIOClient.makeBucket).toHaveBeenCalledWith('new-bucket');
    });

    it('should throw DataAccessError on upload failure', async () => {
      mockMinIOClient.bucketExists.mockResolvedValue(true);
      mockMinIOClient.putObject.mockRejectedValue(new Error('Upload failed'));

      const file = Buffer.from('test content');
      await expect(repository.uploadFile('test-bucket', 'test-key', file)).rejects.toThrow(DataAccessError);
    });
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const fileContent = Buffer.from('test content');
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(fileContent);
          }
          if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      mockMinIOClient.getObject.mockReturnValue(mockStream);

      const result = await repository.downloadFile('test-bucket', 'test-key');

      expect(result).toEqual(fileContent);
    });

    it('should throw NotFoundError when file not found', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('NoSuchKey')), 0);
          }
          return mockStream;
        }),
      };

      mockMinIOClient.getObject.mockReturnValue(mockStream);

      await expect(repository.downloadFile('test-bucket', 'non-existent')).rejects.toThrow();
      await expect(repository.downloadFile('test-bucket', 'non-existent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        name: 'NotFoundError',
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockMinIOClient.removeObject.mockResolvedValue(undefined);

      await repository.deleteFile('test-bucket', 'test-key');

      expect(mockMinIOClient.removeObject).toHaveBeenCalledWith('test-bucket', 'test-key');
    });

    it('should throw DataAccessError on delete failure', async () => {
      mockMinIOClient.removeObject.mockRejectedValue(new Error('Delete failed'));

      await expect(repository.deleteFile('test-bucket', 'test-key')).rejects.toThrow(DataAccessError);
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', async () => {
      const mockStat = {
        size: 1024,
        metaData: {
          'content-type': 'text/plain',
        },
        lastModified: new Date('2024-01-01'),
      };

      mockMinIOClient.statObject.mockResolvedValue(mockStat);

      const result = await repository.getFileMetadata('test-bucket', 'test-key');

      expect(result).toBeDefined();
      expect(result?.size).toBe(1024);
      expect(result?.contentType).toBe('text/plain');
    });

    it('should return null when file not found', async () => {
      mockMinIOClient.statObject.mockRejectedValue(new Error('NoSuchKey'));

      const result = await repository.getFileMetadata('test-bucket', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate presigned URL', async () => {
      const mockUrl = 'https://example.com/presigned-url';
      mockMinIOClient.presignedGetObject.mockResolvedValue(mockUrl);

      const result = await repository.getPresignedUrl('test-bucket', 'test-key', 3600);

      expect(result).toBe(mockUrl);
      expect(mockMinIOClient.presignedGetObject).toHaveBeenCalledWith('test-bucket', 'test-key', 3600);
    });

    it('should use default expiration time', async () => {
      const mockUrl = 'https://example.com/presigned-url';
      mockMinIOClient.presignedGetObject.mockResolvedValue(mockUrl);

      await repository.getPresignedUrl('test-bucket', 'test-key');

      expect(mockMinIOClient.presignedGetObject).toHaveBeenCalledWith(
        'test-bucket',
        'test-key',
        7 * 24 * 60 * 60
      );
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockMinIOClient.statObject.mockResolvedValue({ size: 1024 });

      const result = await repository.fileExists('test-bucket', 'test-key');

      expect(result).toBe(true);
    });

    it('should return false when file not found', async () => {
      mockMinIOClient.statObject.mockRejectedValue(new Error('NoSuchKey'));

      const result = await repository.fileExists('test-bucket', 'non-existent');

      expect(result).toBe(false);
    });
  });
});

