/**
 * 停用已迁移的旧 video taskKey（edit/resource/storyboard/short/commercial）
 *
 * 用法:
 *   pnpm run deactivate:legacy-video-businesses
 *   MXM_SEED_PRODUCTION=1 pnpm run deactivate:legacy-video-businesses  # 生产
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }
  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error('MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL');
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

/** 旧 taskKey → 新 taskKey 映射（仅用于日志） */
const LEGACY_VIDEO_KEYS: Array<{ type: string; subtype: string | null; replacedBy: string }> = [
  { type: 'edit', subtype: 'voiceover-science-pop', replacedBy: 'autocut/voiceover-science-pop' },
  { type: 'edit', subtype: 'render', replacedBy: 'pipeline:video-timeline-render' },
  { type: 'resource', subtype: 'fragment', replacedBy: 'generator/fragment' },
  { type: 'storyboard', subtype: 'grid-r2v', replacedBy: 'generator/grid-r2v' },
  { type: 'short', subtype: 'default', replacedBy: 'generator/default' },
  { type: 'commercial', subtype: 'eshop-i2v', replacedBy: 'generator/eshop-i2v' },
];

/** 已改为管线内置节点，不再作为 DB 业务维护 */
const PIPELINE_ONLY_VIDEO_KEYS: Array<{ type: string; subtype: string | null }> = [
  { type: 'autocut', subtype: 'render' },
];

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  const results: Array<{ key: string; status: string; id?: string }> = [];

  for (const leg of LEGACY_VIDEO_KEYS) {
    const key = `video/${leg.type}/${leg.subtype ?? '-'}`;
    const row = await repo.findByKey('video', leg.type, leg.subtype);
    if (!row) {
      results.push({ key, status: 'not_found' });
      continue;
    }
    if (!row.is_active) {
      results.push({ key, status: 'already_inactive', id: row.id });
      continue;
    }
    await repo.upsert({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype,
      extra: row.extra ?? undefined,
      is_active: false,
      updated_by: null,
    });
    results.push({ key, status: 'deactivated', id: row.id, replacedBy: leg.replacedBy } as never);
  }

  for (const node of PIPELINE_ONLY_VIDEO_KEYS) {
    const key = `video/${node.type}/${node.subtype ?? '-'}`;
    const row = await repo.findByKey('video', node.type, node.subtype);
    if (!row) {
      results.push({ key, status: 'not_found' });
      continue;
    }
    if (!row.is_active) {
      results.push({ key, status: 'already_inactive_pipeline_node', id: row.id });
      continue;
    }
    await repo.upsert({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype,
      extra: row.extra ?? undefined,
      is_active: false,
      updated_by: null,
    });
    results.push({ key, status: 'deactivated_pipeline_node', id: row.id } as never);
  }

  console.log(JSON.stringify({ deactivated: results }, null, 2));
  console.log('\n✅ 旧 video 业务与 autocut/render 管线节点配置已停用。Admin 仅保留用户入口与 generator/*。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
