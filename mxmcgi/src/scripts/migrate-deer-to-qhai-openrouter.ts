/**
 * 将 DB 中仍指向 deer 的业务路由迁移到 qhai（图生）/ openrouter（文本），并可选克隆 provider_models。
 *
 * 用法（项目根或 mxmcgi 目录，需 .env 连 Supabase）：
 *   pnpm --filter mxmcgi run migrate:deer-to-qhai-openrouter
 *   pnpm --filter mxmcgi run migrate:deer-to-qhai-openrouter -- --clone-models
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const GRAPH_TABLES = ['graph_scope_config', 'graph_model_config'] as const;
const TEXT_TABLES = [
  'text_scope_config',
  'writing_scope_config',
  'outline_scope_config',
] as const;

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [path.join(projectRoot, '.env'), path.join(process.cwd(), '.env')]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

async function migrateTable(
  table: string,
  nextProvider: 'qhai' | 'openrouter',
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from(table)
    .update({ provider: nextProvider, updated_at: new Date().toISOString() })
    .eq('provider', 'deer')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

async function cloneProviderModelsFromDeer(): Promise<number> {
  const sb = getSupabaseClient();
  const { data: deerRows, error } = await sb
    .from('provider_models')
    .select('*')
    .eq('provider', 'deer')
    .eq('is_enabled', true);
  if (error) throw error;
  if (!deerRows?.length) return 0;

  let inserted = 0;
  for (const row of deerRows) {
    const modelKey = String(row.model_key || '');
    const scope = String(row.scope || 'graph');
    const targetProvider =
      scope === 'text' || scope === 'writing' || scope === 'outline' ? 'openrouter' : 'qhai';

    const { data: existing } = await sb
      .from('provider_models')
      .select('id')
      .eq('provider', targetProvider)
      .eq('model_key', modelKey)
      .eq('scope', scope)
      .maybeSingle();

    if (existing?.id) continue;

    const { error: insErr } = await sb.from('provider_models').insert({
      provider: targetProvider,
      scope: row.scope,
      model_key: row.model_key,
      upstream_model: row.upstream_model ?? modelKey,
      modality: row.modality,
      protocol: row.protocol,
      is_enabled: true,
      default_parameters: row.default_parameters,
      notes: row.notes ? `${row.notes} (migrated from deer)` : 'migrated from deer',
    });
    if (insErr) {
      console.warn(`[migrate] skip clone ${targetProvider}/${modelKey}:`, insErr.message);
      continue;
    }
    inserted += 1;
  }

  const { error: offErr } = await sb
    .from('provider_models')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('provider', 'deer');
  if (offErr) console.warn('[migrate] disable deer provider_models:', offErr.message);

  return inserted;
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const cloneModels = process.argv.includes('--clone-models');

  let total = 0;
  for (const t of GRAPH_TABLES) {
    const n = await migrateTable(t, 'qhai');
    console.log(`${t}: deer → qhai (${n} rows)`);
    total += n;
  }
  for (const t of TEXT_TABLES) {
    const n = await migrateTable(t, 'openrouter');
    console.log(`${t}: deer → openrouter (${n} rows)`);
    total += n;
  }

  const { data: pricingRows, error: pErr } = await getSupabaseClient()
    .from('business_pricing')
    .update({ provider: 'qhai', updated_at: new Date().toISOString() })
    .eq('provider', 'deer')
    .select('id');
  if (pErr) throw pErr;
  console.log(`business_pricing: deer → qhai (${pricingRows?.length ?? 0} rows)`);

  const { data: textPricing, error: tpErr } = await getSupabaseClient()
    .from('business_pricing')
    .update({ provider: 'openrouter', updated_at: new Date().toISOString() })
    .in('business_type', ['text-plan-eshop-garment-batch', 'text-format-gpt-image-2'])
    .eq('provider', 'deer')
    .select('id');
  if (tpErr) console.warn('business_pricing text patch:', tpErr.message);
  else console.log(`business_pricing (text): → openrouter (${textPricing?.length ?? 0} rows)`);

  if (cloneModels) {
    const cloned = await cloneProviderModelsFromDeer();
    console.log(`provider_models: cloned ${cloned} rows to qhai/openrouter, deer disabled`);
  } else {
    console.log('提示: 加 --clone-models 可从 deer 克隆物理模型到 qhai/openrouter 并禁用 deer 通道');
  }

  console.log(`\n✅ 路由迁移完成（共更新约 ${total} 条 scope 配置）`);
  console.log('请在 Admin 配置 QHAI_API_KEY / OPENROUTER_API_KEY，并重新 apply 业务 bundle（可选）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
