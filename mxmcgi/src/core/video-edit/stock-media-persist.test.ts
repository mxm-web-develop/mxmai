import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isInternalPersistedMediaUrl,
  persistStockMediaToUserTemp,
} from './stock-media-persist';

vi.mock('../../storage/user-upload-service', () => ({
  uploadUserBlob: vi.fn(async () => ({
    objectId: 'obj-stock-1',
    url: '/api/v1/media/object/obj-stock-1',
    key: 'upload/temp/u1/20260715/abc.jpg',
    bucket: 'mxm-uploads',
    provider: 'minio',
    storageMode: 'temp',
    folderId: null,
  })),
}));

describe('stock-media-persist', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('isInternalPersistedMediaUrl', () => {
    it('recognizes gateway media paths', () => {
      expect(isInternalPersistedMediaUrl('/api/v1/media/object/abc')).toBe(true);
      expect(isInternalPersistedMediaUrl('/media/object/abc')).toBe(true);
      expect(isInternalPersistedMediaUrl('https://mxm-ai.com/api/v1/media/object/abc')).toBe(true);
    });

    it('rejects external stock urls', () => {
      expect(
        isInternalPersistedMediaUrl('https://live.staticflickr.com/8405/8681665751_b.jpg')
      ).toBe(false);
    });
  });

  describe('persistStockMediaToUserTemp', () => {
    it('skips upload when already internal', async () => {
      const { uploadUserBlob } = await import('../../storage/user-upload-service');
      const r = await persistStockMediaToUserTemp({
        url: '/api/v1/media/object/existing',
        kind: 'image',
        userId: 'u1',
      });
      expect(r.url).toBe('/api/v1/media/object/existing');
      expect(uploadUserBlob).not.toHaveBeenCalled();
    });

    it('downloads and uploads to user temp', async () => {
      const { uploadUserBlob } = await import('../../storage/user-upload-service');
      const r = await persistStockMediaToUserTemp({
        url: 'https://live.staticflickr.com/8405/x.jpg',
        kind: 'image',
        userId: 'u1',
        parentTaskId: 'task-1',
        clipId: 'clip-vis-1',
        provider: 'openverse',
      });
      expect(r.url).toBe('/api/v1/media/object/obj-stock-1');
      expect(r.objectId).toBe('obj-stock-1');
      expect(r.upstreamUrl).toContain('staticflickr');
      expect(uploadUserBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          purpose: 'temp',
          storageMode: 'temp',
          taskId: 'task-1',
        })
      );
    });
  });
});
