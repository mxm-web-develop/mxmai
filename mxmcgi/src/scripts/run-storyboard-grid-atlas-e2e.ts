/**
 * 宫格分镜 → Atlas uploadMedia → reference_images 端到端烟测
 *
 * Usage:
 *   pnpm exec tsx src/scripts/run-storyboard-grid-atlas-e2e.ts [imagePath]
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { uid } from 'uid';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { processStoryboardGridForVideoTask } from '../core/video/video-grid-storyboard';
import { isAtlasCloudHostedUrl } from '../models/atlascloud/upload-media';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.resolve(projectRoot, '.env'),
    path.resolve(projectRoot, 'mxmcgi/.env'),
    path.resolve(process.cwd(), '.env'),
  ]) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const imagePath =
    process.argv[2] ||
    path.resolve(projectRoot(), 'graph-c59c0486d60642575bfd5-1.png');
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found:', imagePath);
    process.exit(1);
  }

  const buf = fs.readFileSync(imagePath);
  const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64 = `data:${mime};base64,${buf.toString('base64')}`;
  const taskId = uid(21);

  const params: Record<string, unknown> = {
    provider: 'atlascloud',
    storyboard_grid: {
      enabled: true,
      layout: '3x3',
      auto_detect_layout: true,
      source_image: { content: base64, type: 'main-subject' },
      cells: Array.from({ length: 9 }, (_, index) => ({ index, purpose: `panel-${index}` })),
      first_frame_index: 0,
      last_frame_index: 8,
    },
  };

  console.log('[e2e] taskId:', taskId);
  console.log('[e2e] image:', imagePath, `(${Math.round(buf.length / 1024)} KB)`);
  console.log('[e2e] processing storyboard grid with provider=atlascloud ...');

  const meta = await processStoryboardGridForVideoTask(taskId, params, { provider: 'atlascloud' });
  const refs = params.reference_images as string[] | undefined;

  console.log('[e2e] tempR2Keys:', meta?.tempR2Keys?.length ?? 0);
  console.log('[e2e] reference_images:', refs?.length ?? 0);
  if (!refs?.length) {
    console.error('[e2e] FAIL: no reference_images');
    process.exit(1);
  }

  for (const [i, url] of refs.entries()) {
    const ok = isAtlasCloudHostedUrl(url);
    console.log(`  [${i}] ${ok ? 'OK' : 'BAD'} ${url.slice(0, 100)}...`);
    if (!ok) process.exit(1);
  }

  console.log('[e2e] PASS: all reference_images are Atlas-hosted URLs');
}

function projectRoot() {
  return path.resolve(__dirname, '../../..');
}

main().catch((err) => {
  console.error('[e2e] FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
