import { RepositoryFactory } from '@mxmai/mxmdata';
import { deleteUserStorageObject } from './user-upload-service';

export async function cleanupUserUploadTempForTask(
  taskId: string,
  userId: string
): Promise<void> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const items = await repo.listByTempForTaskId(userId, taskId);
  for (const item of items) {
    try {
      await deleteUserStorageObject(userId, item.id);
    } catch (err) {
      console.warn('[cleanupUserUploadTempForTask] delete failed', item.id, err);
    }
  }
}
