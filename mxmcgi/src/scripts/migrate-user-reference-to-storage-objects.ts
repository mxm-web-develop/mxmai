/**
 * 将 user_reference_images 迁移到 storage_objects（幂等：按 provider+bucket+key 跳过已存在）
 *
 * Usage: tsx src/scripts/migrate-user-reference-to-storage-objects.ts
 */
import { RepositoryFactory } from '@mxmai/mxmdata';

async function main(): Promise<void> {
  RepositoryFactory.init();
  const objRepo = RepositoryFactory.createStorageObjectRepository();

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!;
  const client = createClient(url, key);

  const { data: rows, error } = await client
    .from('user_reference_images')
    .select('*')
    .is('deleted_at', null);
  if (error) throw error;

  let migrated = 0;
  let skipped = 0;
  for (const row of rows || []) {
    const provider = 'r2';
    const bucket = row.r2_bucket;
    const objectKey = row.r2_key;
    const existing = await objRepo.findById(row.id).catch(() => null);
    if (existing) {
      skipped++;
      continue;
    }
    try {
      await objRepo.create({
        user_id: row.user_id,
        domain: 'user_upload',
        provider,
        bucket,
        object_key: objectKey,
        purpose: 'reference',
        content_type: row.content_type,
        size_bytes: row.file_size_bytes,
        original_name: row.original_name,
        metadata: row.tag ? { tag: row.tag, legacyR2Url: row.r2_url } : { legacyR2Url: row.r2_url },
      });
      migrated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate') || msg.includes('unique')) {
        skipped++;
      } else {
        console.warn('[migrate] failed row', row.id, msg);
      }
    }
  }

  console.log(`[migrate] done migrated=${migrated} skipped=${skipped} total=${(rows || []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
