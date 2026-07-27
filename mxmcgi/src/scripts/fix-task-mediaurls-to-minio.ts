import { RepositoryFactory } from '@mxmai/mxmdata';
import { storeFromGenerateResult, type StorageConfig } from '../task/data-store';
import { isBase64 } from '../task/reference-image';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// 与 mxmcgi/src/index.ts 一致：脚本也需要提前加载 .env（否则 Supabase/MinIO 配置缺失）
function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..'); // mxmcgi/src/scripts -> project root
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

function inferPathTemplate(taskType: string): string {
  // 与 TaskExecutor.processResult 中的默认模板保持一致（只覆盖常用类型）
  const map: Record<string, string> = {
    image: '{userId}/graph/{timestamp}-{randomId}.{ext}',
    graph: '{userId}/graph/{timestamp}-{randomId}.{ext}',
    video: '{userId}/video/{timestamp}-{randomId}.{ext}',
    audio: '{userId}/audio/{timestamp}-{randomId}.{ext}',
    music: '{userId}/music/{timestamp}-{randomId}.{ext}',
    writing: '{userId}/writing/{timestamp}-{randomId}.{ext}',
    outlines: '{userId}/outlines/{timestamp}-{randomId}.{ext}',
    text: '{userId}/text/{timestamp}-{randomId}.{ext}',
    other: '{userId}/other/{timestamp}-{randomId}.{ext}',
  };
  return map[taskType] || map.other;
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const taskId = process.argv[2];
  if (!taskId || !String(taskId).trim()) {
    console.error('Usage: pnpm --filter mxmcgi tsx src/scripts/fix-task-mediaurls-to-minio.ts <taskId>');
    process.exit(1);
  }

  const repo = RepositoryFactory.createCGITaskRepository();
  const task = await repo.findById(taskId, true);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const mediaUrlsRaw = (task.output_data as any)?.mediaUrls;
  const mediaUrls: string[] = Array.isArray(mediaUrlsRaw) ? mediaUrlsRaw.filter((x) => typeof x === 'string') : [];
  if (mediaUrls.length === 0) {
    console.log(`[fix-task-mediaurls-to-minio] task ${taskId}: no mediaUrls, skip`);
    return;
  }

  const hasBase64 = mediaUrls.some((u) => isBase64(u));
  if (!hasBase64) {
    console.log(`[fix-task-mediaurls-to-minio] task ${taskId}: mediaUrls are already URLs, skip`);
    return;
  }

  const bucket = process.env.CGI_STORAGE_BUCKET || 'user-media';
  const config: StorageConfig = {
    bucket,
    pathTemplate: inferPathTemplate(task.task_type),
  };

  const storageResults = await storeFromGenerateResult(
    {
      mediaUrls,
      metadata: (task.output_data as any)?.metadata,
    },
    config,
    task.user_id,
    task.model_name,
  );

  const newUrls = storageResults.map((r) => r.url);
  const keys = storageResults.map((r) => r.key);

  await repo.update(taskId, {
    output_data: {
      ...(task.output_data || {}),
      mediaUrls: newUrls,
    },
    storage_info: {
      keys,
      bucket: storageResults[0]?.bucket || bucket,
      urls: newUrls,
    },
  });

  console.log(`[fix-task-mediaurls-to-minio] task ${taskId}: updated mediaUrls -> ${newUrls.length} url(s)`);
}

main().catch((e) => {
  console.error('[fix-task-mediaurls-to-minio] failed:', e);
  process.exit(1);
});

