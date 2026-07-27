import { RepositoryFactory } from '@mxmai/mxmdata';
import { deleteUserStorageObject } from './user-upload-service';

export class StorageObjectCleanupProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly opts: {
      intervalMs: number;
      batchSize: number;
    } = {
      intervalMs: Number(process.env.STORAGE_OBJECT_CLEANUP_INTERVAL_MS || 5 * 60 * 1000),
      batchSize: Number(process.env.STORAGE_OBJECT_CLEANUP_BATCH_SIZE || 50),
    }
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const repo = RepositoryFactory.createStorageObjectRepository();
    const expired = await repo.listExpiredSoftDeletable(this.opts.batchSize);
    for (const row of expired) {
      if (!row.user_id) continue;
      try {
        await repo.softDelete(row.id, row.user_id);
      } catch (err) {
        console.warn('[StorageObjectCleanup] softDelete failed', row.id, err);
      }
    }

    const candidates = await repo.listPurgedCandidates(this.opts.batchSize);
    for (const row of candidates) {
      if (!row.user_id) continue;
      try {
        const storage = RepositoryFactory.getStorageService();
        await storage.delete({
          domain: row.domain,
          provider: row.provider,
          bucket: row.bucket,
          key: row.object_key,
        });
        await repo.markPurged(row.id);
      } catch (err) {
        console.warn('[StorageObjectCleanup] purge failed', row.id, err);
      }
    }
  }
}
