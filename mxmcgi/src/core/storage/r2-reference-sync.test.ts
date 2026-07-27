import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IUserReferenceImageRepository, UserReferenceImage } from '@mxmai/mxmdata';
import {
  deleteUserReferenceImageSynced,
  listUserReferenceImagesSynced,
  UserReferenceImageNotFoundError,
} from './r2-reference-sync';

vi.mock('./r2-uploader', () => ({
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  objectExistsInR2: vi.fn(),
}));

import { deleteFromR2, objectExistsInR2 } from './r2-uploader';

const sampleRow: UserReferenceImage = {
  id: 'id-1',
  user_id: 'user-1',
  r2_bucket: 'mxmtemimageref',
  r2_key: '123.jpg',
  r2_url: 'https://example.r2.dev/123.jpg',
  original_name: null,
  content_type: 'image/jpeg',
  file_size_bytes: null,
  tag: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

function mockRepo(overrides: Partial<IUserReferenceImageRepository> = {}): IUserReferenceImageRepository {
  return {
    findById: vi.fn(),
    findByIdForUser: vi.fn().mockResolvedValue(sampleRow),
    listByUser: vi.fn().mockResolvedValue({ items: [sampleRow], total: 1 }),
    create: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    ...overrides,
  };
}

describe('r2-reference-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteUserReferenceImageSynced deletes R2 then soft-deletes DB', async () => {
    const repo = mockRepo();
    await deleteUserReferenceImageSynced(repo, 'id-1', 'user-1');

    expect(deleteFromR2).toHaveBeenCalledWith('123.jpg', 'mxmtemimageref');
    expect(repo.softDelete).toHaveBeenCalledWith('id-1', 'user-1');
  });

  it('deleteUserReferenceImageSynced throws when record missing', async () => {
    const repo = mockRepo({
      findByIdForUser: vi.fn().mockResolvedValue(null),
    });
    await expect(deleteUserReferenceImageSynced(repo, 'id-1', 'user-1')).rejects.toBeInstanceOf(
      UserReferenceImageNotFoundError
    );
    expect(deleteFromR2).not.toHaveBeenCalled();
  });

  it('listUserReferenceImagesSynced purges DB rows missing in R2', async () => {
    vi.mocked(objectExistsInR2).mockResolvedValue(false);
    const repo = mockRepo({
      listByUser: vi
        .fn()
        .mockResolvedValueOnce({ items: [sampleRow], total: 1 })
        .mockResolvedValueOnce({ items: [], total: 0 }),
    });

    const result = await listUserReferenceImagesSynced(repo, 'user-1', { limit: 20 });

    expect(repo.softDelete).toHaveBeenCalledWith('id-1', 'user-1');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('listUserReferenceImagesSynced keeps rows when R2 exists', async () => {
    vi.mocked(objectExistsInR2).mockResolvedValue(true);
    const repo = mockRepo();

    const result = await listUserReferenceImagesSynced(repo, 'user-1', { limit: 20 });

    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
  });
});
