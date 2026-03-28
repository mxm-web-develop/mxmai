/**
 * 规范化 provider_models.modality：
 * - graph -> image
 * - audio -> audio
 * - video -> video
 * - text/default/writing/outline -> text
 *
 * 用法：
 * - 预览（默认）：pnpm --filter @mxmai/mxmdata run migrate:normalize-provider-model-modality
 * - 执行写入：pnpm --filter @mxmai/mxmdata run migrate:normalize-provider-model-modality -- --apply
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { Client } from 'pg';

const MXMDATA_ROOT = process.cwd();
dotenv.config({ path: join(MXMDATA_ROOT, '.env') });
dotenv.config({ path: join(MXMDATA_ROOT, '../.env') });

type Row = {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  modality: string | null;
};

function normalizeModality(scope: string, modality: string | null): 'text' | 'image' | 'audio' | 'video' | null {
  const s = String(scope || '').toLowerCase();
  if (s === 'graph') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'video') return 'video';
  if (s === 'text' || s === 'default' || s === 'writing' || s === 'outline') return 'text';
  const m = (modality ?? '').toLowerCase();
  if (m === 'text' || m === 'image' || m === 'audio' || m === 'video') return m;
  return null;
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ 缺少 SUPABASE_DB_URL 或 DATABASE_URL');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const { rows } = await client.query<Row>(
      'SELECT id, provider, scope, model_key, modality FROM provider_models ORDER BY provider, scope, model_key'
    );

    const changes = rows
      .map((r) => ({
        ...r,
        normalized: normalizeModality(r.scope, r.modality),
      }))
      .filter((r) => (r.modality ?? null) !== (r.normalized ?? null));

    console.log(`📊 provider_models 共 ${rows.length} 条，需修正 ${changes.length} 条`);
    for (const c of changes.slice(0, 30)) {
      console.log(
        `- ${c.provider}/${c.scope}/${c.model_key}: ${c.modality ?? 'null'} -> ${c.normalized ?? 'null'}`
      );
    }
    if (changes.length > 30) {
      console.log(`... 其余 ${changes.length - 30} 条省略`);
    }

    if (!apply) {
      console.log('ℹ️ 当前为预览模式（未写入）。加 --apply 才会执行更新。');
      return;
    }

    await client.query('BEGIN');
    for (const c of changes) {
      await client.query(
        'UPDATE provider_models SET modality = $1, updated_at = NOW() WHERE id = $2',
        [c.normalized, c.id]
      );
    }
    await client.query('COMMIT');
    console.log(`✅ 已更新 ${changes.length} 条 provider_models.modality`);
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ 规范化失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();

