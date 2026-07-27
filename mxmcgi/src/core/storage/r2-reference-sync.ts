/**
 * user_reference_images ↔ R2 双向同步
 */

import type { IUserReferenceImageRepository, UserReferenceImage } from '@mxmai/mxmdata';
import { deleteFromR2, objectExistsInR2 } from './r2-uploader';

export class UserReferenceImageNotFoundError extends Error {
  constructor() {
    super('Reference image not found');
    this.name = 'UserReferenceImageNotFoundError';
  }
}

/**
 * 应用内删除：先删 R2（404 视为成功），再软删数据库
 */
export async function deleteUserReferenceImageSynced(
  repo: IUserReferenceImageRepository,
  id: string,
  userId: string
): Promise<void> {
  const record = await repo.findByIdForUser(id, userId);
  if (!record) {
    throw new UserReferenceImageNotFoundError();
  }

  await deleteFromR2(record.r2_key, record.r2_bucket);
  await repo.softDelete(id, userId);
}

/**
 * 列表拉取时同步：R2 已不存在的记录自动软删
 */
export async function listUserReferenceImagesSynced(
  repo: IUserReferenceImageRepository,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ items: UserReferenceImage[]; total: number }> {
  const { items, total } = await repo.listByUser(userId, options);
  if (items.length === 0) {
    return { items, total };
  }

  const checks = await Promise.all(
    items.map(async (item) => ({
      item,
      exists: await objectExistsInR2(item.r2_key, item.r2_bucket),
    }))
  );

  const staleIds = checks.filter((c) => !c.exists).map((c) => c.item.id);
  if (staleIds.length === 0) {
    return { items, total };
  }

  await Promise.all(staleIds.map((id) => repo.softDelete(id, userId)));
  console.info('[R2 Reference Sync] purged stale DB rows:', staleIds.length);

  return repo.listByUser(userId, options);
}
