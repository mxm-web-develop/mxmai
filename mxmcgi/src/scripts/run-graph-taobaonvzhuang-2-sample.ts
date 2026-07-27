import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { runTaskV2 } from '../tasks/task-engine';
import { providerFactory } from '../core/providers';

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  // 脚本环境下不会走 mxmcgi/index.ts 的启动逻辑，这里手动加载 provider_models 目录
  await providerFactory.loadProviderCatalog();

  const userId = process.argv[2] || process.env.MXMAI_TEST_USER_ID || '';
  if (!userId) {
    console.error('Usage: tsx src/scripts/run-graph-taobaonvzhuang-2-sample.ts <userId>');
    process.exit(1);
  }

  // 复用之前任务里的 4 张参考图 URL（2 模特 + 2 服饰）
  const modelUrls = [
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063067955-5e66194c.jpg',
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063058472-aef79ba4.jpg',
  ];
  const clothingUrls = [
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063078233-4672251d.png',
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063100804-a12d6114.png',
  ];

  const res = await runTaskV2(
    {
      scope: 'graph',
      taskKey: 'photograph',
      subtype: 'taobaonvzhuang-2',
      params: {
        // schema 字段
        type: 'taobaonvzhuang-2',
        scenes: 'beach_pier',
        clothing_material: 'use_reference_only',
        prompt: '',
        aspect_ratio: '3:4',
        model_images: modelUrls.map((u) => ({ content: u, type: 'main-subject', purpose: 'model reference' })),
        clothing_images: clothingUrls.map((u) => ({ content: u, type: 'outfits', purpose: 'garment reference' })),
      },
    },
    userId,
  );

  console.log('=== [run] created ===');
  console.log(JSON.stringify(res, null, 2));

  const taskId = res.taskId;
  if (!taskId) process.exit(0);

  // 等待异步任务完成（最多 90s；失败也会退出）
  const repo = RepositoryFactory.createCGITaskRepository();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const t = await repo.findById(taskId, true);
    const status = t?.status;
    const prog = t?.progress;
    console.log(`[poll] status=${status} progress=${prog} updated_at=${t?.updated_at}`);
    if (status === 'completed' || status === 'failed' || status === 'network_error' || status === 'cancelled') {
      console.log('=== [run] final task snapshot ===');
      console.log(
        JSON.stringify(
          {
            id: t?.id,
            status: t?.status,
            error: (t as any)?.error_message,
            metadata: t?.metadata,
            output_data_keys: t?.output_data ? Object.keys(t.output_data as any) : null,
          },
          null,
          2,
        ),
      );
      return;
    }
    await sleep(1500);
  }

  console.log('[poll] timeout');
}

main().catch((e) => {
  console.error('[run] failed:', e);
  process.exit(1);
});

