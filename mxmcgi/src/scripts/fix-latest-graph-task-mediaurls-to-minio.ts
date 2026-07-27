import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { storeFromGenerateResult, type StorageConfig } from '../task/data-store';
import { isBase64 } from '../task/reference-image';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function inferStorageConfigForGraph(): StorageConfig {
  return {
    bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
    pathTemplate: '{userId}/graph/{timestamp}-{randomId}.{ext}',
  };
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const userIdArg = process.argv[2];
  const limitArg = process.argv[3];
  const userId = typeof userIdArg === 'string' && userIdArg.trim() ? userIdArg.trim() : undefined;
  const limit = Number(limitArg) > 0 ? Number(limitArg) : 50;

  const repo = RepositoryFactory.createCGITaskRepository();
  const { tasks } = userId
    ? await repo.findByUserId(userId, { task_type: 'graph', includeDeleted: true, limit })
    : await repo.findMany({ task_type: 'graph', includeDeleted: true, limit });

  const pick = tasks.find((t) => {
    const urls = (t.output_data as any)?.mediaUrls;
    if (!Array.isArray(urls) || urls.length === 0) return false;
    return urls.some((u: any) => typeof u === 'string' && isBase64(u));
  });

  if (!pick) {
    console.log(`[fix-latest] no graph task with base64 found in latest ${limit}` + (userId ? ` for userId=${userId}` : ''));
    return;
  }

  const taskId = pick.id;
  const mediaUrls: string[] = ((pick.output_data as any)?.mediaUrls as any[])
    .filter((u) => typeof u === 'string')
    .map((u) => String(u));

  const cfg = inferStorageConfigForGraph();
  const storageResults = await storeFromGenerateResult(
    { mediaUrls, metadata: (pick.output_data as any)?.metadata },
    cfg,
    pick.user_id,
    pick.model_name,
  );

  const newUrls = storageResults.map((r) => r.url);
  const keys = storageResults.map((r) => r.key);
  const bucket = storageResults[0]?.bucket || cfg.bucket;

  await repo.update(taskId, {
    output_data: {
      ...(pick.output_data || {}),
      mediaUrls: newUrls,
    },
    storage_info: {
      keys,
      bucket,
      urls: newUrls,
    },
  });

  console.log(`[fix-latest] patched task ${taskId}: ${mediaUrls.length} -> ${newUrls.length} url(s)`);
}

main().catch((e) => {
  console.error('[fix-latest] failed:', e);
  process.exit(1);
});

