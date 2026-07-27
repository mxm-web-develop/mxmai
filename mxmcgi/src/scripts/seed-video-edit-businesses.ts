/**
 * Seed 视频剪辑相关业务 bundle：
 * - text/plan/video-edit-script（LLM → 人工审核 → nestedVideo render）
 * - videoTimelineRender（管线内置节点，非 DB 业务）
 *
 * 用法（在 mxmcgi 目录）：
 *   pnpm run seed:video-edit-businesses
 */
import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { BusinessBundle } from '../routes/business-bundle-types';
import { applyMxmBusinessBundleImport } from '../routes/business-bundle-import-apply';

const MXMCGI_ROOT = join(__dirname, '../..');
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

const BUNDLES = [
  'src/tasks/examples/text-video-edit-script.business.json',
  'src/tasks/examples/text-science-pop-video-script.business.json',
  'src/tasks/examples/text-science-pop-script-draft.business.json',
  'src/tasks/examples/text-video-cut-beat.business.json',
  'src/tasks/examples/text-video-shot-list.business.json',
  'src/tasks/examples/video-voiceover-science-pop.business.json',
  'src/tasks/examples/video-resource-fragment.business.json',
];

async function applyBundle(relPath: string) {
  const abs = join(MXMCGI_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`bundle 不存在: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const bundle = JSON.parse(raw) as BusinessBundle;
  const data = await applyMxmBusinessBundleImport({
    bundle,
    conflictPolicy: 'upsert',
    userId: null,
  });
  console.log(`[seed] ${relPath}`, JSON.stringify(data));
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  for (const rel of BUNDLES) {
    await applyBundle(rel);
  }
  console.log('\n✅ 视频剪辑业务 bundle 已写入 DB。请在 Admin 刷新业务列表。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
