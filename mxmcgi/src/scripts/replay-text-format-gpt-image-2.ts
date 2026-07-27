import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { runTaskV2 } from '../tasks/task-engine';

function loadEnvOnce() {
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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const taskId = process.argv[2];
  if (!taskId) {
    console.error('Usage: tsx src/scripts/replay-text-format-gpt-image-2.ts <taskId>');
    process.exit(1);
  }

  const repo = RepositoryFactory.createCGITaskRepository();
  const task = await repo.findById(taskId, true);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const userId = (task.input_data as any)?.userId || task.user_id;
  const prompt = String((task.input_data as any)?.prompt ?? '');
  if (!userId) throw new Error('missing userId on task');
  if (!prompt.trim()) throw new Error('missing prompt on task.input_data.prompt');

  const result = await runTaskV2(
    {
      scope: 'text',
      taskKey: 'format',
      subtype: 'gpt-image-2',
      params: { prompt },
    },
    userId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('replay failed:', e);
  process.exit(1);
});

