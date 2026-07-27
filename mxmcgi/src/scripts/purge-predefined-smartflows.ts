/**
 * 从 DB 删除历史硬编码 seed 的 Smartflow（启动注入已移除，本脚本用于一次性清理残留）
 *
 *   cd mxmcgi && pnpm run purge:predefined-smartflows
 *   cd mxmcgi && pnpm run purge:predefined-smartflows -- --dry-run
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();

const LEGACY_PREDEFINED_IDS = [
  'photography-analysis-v2',
  'writing-article-default',
  'writing-script-default',
  'design-poster-default',
  'video-generate-default',
  'audio-tts-default',
  'audio-music-default',
  'smart-search-default',
  'code-assistant-default',
  'composite-reflection-draft',
  'composite-plan-execute',
  'composite-research-summary',
];

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(MXMCGI_ROOT, '..', '.env') });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  RepositoryFactory.init();
  const { smartflowRepository } = await import('../smartflow/core/engine/repository');

  const deleted: string[] = [];
  const missing: string[] = [];

  for (const id of LEGACY_PREDEFINED_IDS) {
    const row = await smartflowRepository.findById(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    if (!dryRun) {
      await smartflowRepository.delete(id);
    }
    deleted.push(id);
  }

  console.log(JSON.stringify({ dryRun, deleted, missing }, null, 2));
  if (!dryRun && deleted.length > 0) {
    console.log('\n✅ 已从 DB 删除历史预置 Smartflow。重启 mxmcgi 后刷新列表不应再出现。');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
