/**
 * 本地模式对齐香港生产：
 * 1) 港机有、本地缺的 provider_pricing → 补齐
 * 2) 本地有、港机无的 provider_models → 删除（连同同键 pricing）
 * 3) 测试阶段业务路由：writing/text → maxplan/MiniMax-M3；graph → atlascloud
 *
 * 用法（本地 .env 指向 localhost）：
 *   pnpm --filter @mxmai/mxmcgi exec tsx src/scripts/sync-local-provider-from-hk.ts \
 *     --hk-models /tmp/hk-provider-models.json \
 *     --hk-pricing /tmp/hk-provider-pricing.json
 *
 *   # 仅预览
 *   ... --dry-run
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

type Row = Record<string, unknown>;

function loadEnv() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const root = path.resolve(__dirname, '../../..');
  for (const p of [path.join(root, '.env'), path.join(root, 'mxmcgi', '.env')]) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
}

function keyOf(p: string, s: string, m: string) {
  return `${p}||${s}||${m}`;
}

function parseArgs(argv: string[]) {
  let hkModels = '/tmp/hk-provider-models.json';
  let hkPricing = '/tmp/hk-provider-pricing.json';
  let dryRun = false;
  let skipRoutes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hk-models') hkModels = argv[++i] ?? hkModels;
    else if (a === '--hk-pricing') hkPricing = argv[++i] ?? hkPricing;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--skip-routes') skipRoutes = true;
  }
  return { hkModels, hkPricing, dryRun, skipRoutes };
}

/** 有意义的成本：unit / input / output 任一 > 0 */
function hasMeaningfulCost(row: {
  unit_price?: number | null;
  input_unit_price?: number | null;
  output_unit_price?: number | null;
}): boolean {
  const u = Number(row.unit_price ?? 0);
  const i = Number(row.input_unit_price ?? 0);
  const o = Number(row.output_unit_price ?? 0);
  return u > 0 || i > 0 || o > 0;
}

const WRITING_TEXT_TO_MAXPLAN: Array<{ table: string; task_key: string; sub_type: string }> = [
  { table: 'writing_scope_config', task_key: 'academy', sub_type: 'wenxian' },
  { table: 'writing_scope_config', task_key: 'acdemy', sub_type: 'news' },
  { table: 'writing_scope_config', task_key: 'basic-text', sub_type: 'default' },
  { table: 'writing_scope_config', task_key: 'business', sub_type: 'ad' },
  { table: 'writing_scope_config', task_key: 'generator', sub_type: 'warp-demo-daily' },
  { table: 'writing_scope_config', task_key: 'outlines', sub_type: 'default' },
  { table: 'writing_scope_config', task_key: 'resumes', sub_type: 'it' },
  { table: 'writing_scope_config', task_key: 'voice-scripts', sub_type: 'default' },
  { table: 'text_scope_config', task_key: 'format', sub_type: 'gpt-image-2' },
  { table: 'text_scope_config', task_key: 'format', sub_type: 'nano-banana-format' },
  { table: 'text_scope_config', task_key: 'plan', sub_type: 'eshop-garment-batch' },
  { table: 'text_scope_config', task_key: 'plan', sub_type: 'roadmap' },
  { table: 'text_scope_config', task_key: 'plan', sub_type: 'video-edit-script' },
  { table: 'text_scope_config', task_key: 'think', sub_type: 'reasoning' },
  { table: 'text_scope_config', task_key: 'transform', sub_type: 'graph' },
  // MiniMax-M3 官方原生多模态（image/video），视觉业务可走 maxplan
  { table: 'text_scope_config', task_key: 'transform', sub_type: 'vf-character-pack' },
  { table: 'text_scope_config', task_key: 'transform', sub_type: 'vf-style-frame' },
  { table: 'text_scope_config', task_key: 'transform', sub_type: 'vf-writing-frame' },
  { table: 'text_scope_config', task_key: 'transform', sub_type: 'vf-writing-pack' },
];

const GRAPH_TO_ATLAS: Array<{ task_key: string; sub_type: string; model: string }> = [
  { task_key: 'eshop', sub_type: 'clothes', model: 'gpt-image-2' },
  { task_key: 'photograph', sub_type: 'cinematic', model: 'gpt-image-2' },
  { task_key: 'photograph', sub_type: 'default', model: 'nano-banana-2' },
  { task_key: 'photograph', sub_type: 'taobaonvzhuang', model: 'nano-banana-2' },
  { task_key: 'photograph', sub_type: 'taobaonvzhuang-2', model: 'gpt-image-2' },
  { task_key: 'photograph', sub_type: 'test', model: 'gpt-image-2' },
];

async function main() {
  loadEnv();
  const { hkModels, hkPricing, dryRun, skipRoutes } = parseArgs(process.argv.slice(2));
  RepositoryFactory.init();
  const sb = getSupabaseClient();
  const url = process.env.SUPABASE_URL ?? '';
  console.log('目标:', url, dryRun ? '(dry-run)' : '');

  const hkModelRows = JSON.parse(fs.readFileSync(hkModels, 'utf8')) as Row[];
  const hkPriceRows = JSON.parse(fs.readFileSync(hkPricing, 'utf8')) as Row[];
  const hkModelKeys = new Set(
    hkModelRows.map((m) => keyOf(String(m.provider), String(m.scope), String(m.model_key))),
  );
  const hkPriceMap = new Map(
    hkPriceRows.map((p) => [
      keyOf(String(p.provider), String(p.scope), String(p.model_key)),
      p,
    ]),
  );

  const { data: localModels, error: mErr } = await sb.from('provider_models').select('*');
  if (mErr) throw new Error(mErr.message);
  const { data: localPricing, error: pErr } = await sb.from('provider_pricing').select('*');
  if (pErr) throw new Error(pErr.message);

  const localPriceKeys = new Set(
    (localPricing ?? []).map((p) =>
      keyOf(String(p.provider), String(p.scope), String(p.model_key)),
    ),
  );

  // 1) 删除港机没有的本地模型
  const toDelete = (localModels ?? []).filter(
    (m) => !hkModelKeys.has(keyOf(String(m.provider), String(m.scope), String(m.model_key))),
  );
  console.log(`\n[delete] 港机无对应物理模型: ${toDelete.length}`);
  for (const m of toDelete) {
    const k = keyOf(String(m.provider), String(m.scope), String(m.model_key));
    console.log(`  - ${k} id=${m.id}`);
    if (dryRun) continue;
    await sb.from('provider_pricing').delete().eq('provider', m.provider).eq('scope', m.scope).eq('model_key', m.model_key);
    const { error } = await sb.from('provider_models').delete().eq('id', m.id);
    if (error) console.error('    delete model failed:', error.message);
  }

  // 2) 补齐缺失定价（仅港机有有效成本的）
  //    另：writing MiniMax-M3-highspeed 港机成本为 0 → 用 text/MiniMax-M3 价回填
  const m3TextPrice = hkPriceMap.get(keyOf('maxplan', 'text', 'MiniMax-M3'));
  let filled = 0;
  for (const m of localModels ?? []) {
    const k = keyOf(String(m.provider), String(m.scope), String(m.model_key));
    if (toDelete.some((d) => d.id === m.id)) continue;
    if (localPriceKeys.has(k)) continue;
    let src = hkPriceMap.get(k);
    if (src && !hasMeaningfulCost(src as { unit_price?: number | null })) {
      if (
        m.provider === 'maxplan' &&
        String(m.model_key).startsWith('MiniMax-M3') &&
        m3TextPrice &&
        hasMeaningfulCost(m3TextPrice as { unit_price?: number | null })
      ) {
        src = { ...m3TextPrice, scope: m.scope, model_key: m.model_key };
        console.log(`  [fallback] ${k} ← text/MiniMax-M3 价`);
      } else {
        console.log(`  [skip] ${k} 港机亦无有效成本`);
        continue;
      }
    }
    if (!src) {
      console.log(`  [skip] ${k} 港机无定价行`);
      continue;
    }
    const patch = {
      provider: String(m.provider),
      scope: String(m.scope),
      model_key: String(m.model_key),
      charge_mode: src.charge_mode ?? 'token_based',
      currency: src.currency ?? 'USD',
      unit_price: src.unit_price ?? 0,
      input_unit_price: src.input_unit_price ?? null,
      output_unit_price: src.output_unit_price ?? null,
      platform_unit_price: src.platform_unit_price ?? null,
      platform_input_unit_price: src.platform_input_unit_price ?? null,
      platform_output_unit_price: src.platform_output_unit_price ?? null,
      platform_min_charge: src.platform_min_charge ?? null,
      metadata: {
        ...((src.metadata as object) || {}),
        synced_from: 'hk',
        synced_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    console.log(`  [fill] ${k}`);
    filled++;
    if (dryRun) continue;
    const { error } = await sb.from('provider_pricing').upsert(patch, {
      onConflict: 'provider,scope,model_key',
    });
    if (error) console.error('    upsert pricing failed:', error.message);
  }
  console.log(`[fill] 写入定价 ${filled} 条`);

  // 2b) 确保 text/MiniMax-M3 有价（写作业务 writing↔text 回落依赖）
  if (m3TextPrice && hasMeaningfulCost(m3TextPrice as { unit_price?: number | null })) {
    const k = keyOf('maxplan', 'text', 'MiniMax-M3');
    if (!localPriceKeys.has(k) || dryRun) {
      console.log(`  [ensure] ${k}`);
      if (!dryRun) {
        await sb.from('provider_pricing').upsert(
          {
            provider: 'maxplan',
            scope: 'text',
            model_key: 'MiniMax-M3',
            charge_mode: m3TextPrice.charge_mode ?? 'token_based',
            currency: m3TextPrice.currency ?? 'USD',
            unit_price: m3TextPrice.unit_price ?? 0,
            input_unit_price: m3TextPrice.input_unit_price ?? null,
            output_unit_price: m3TextPrice.output_unit_price ?? null,
            platform_unit_price: m3TextPrice.platform_unit_price ?? null,
            platform_input_unit_price: m3TextPrice.platform_input_unit_price ?? null,
            platform_output_unit_price: m3TextPrice.platform_output_unit_price ?? null,
            platform_min_charge: m3TextPrice.platform_min_charge ?? null,
            metadata: { synced_from: 'hk', synced_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'provider,scope,model_key' },
        );
      }
    }
  }

  // 2c) 修港机零成本 writing/MiniMax-M3-highspeed（若本地仍保留该行）
  if (m3TextPrice && !dryRun) {
    const { data: zeroRows } = await sb
      .from('provider_pricing')
      .select('id,provider,scope,model_key,unit_price,input_unit_price,output_unit_price')
      .eq('provider', 'maxplan')
      .eq('model_key', 'MiniMax-M3-highspeed');
    for (const z of zeroRows ?? []) {
      if (hasMeaningfulCost(z)) continue;
      console.log(`  [fix-zero] maxplan/${z.scope}/MiniMax-M3-highspeed`);
      await sb
        .from('provider_pricing')
        .update({
          charge_mode: 'token_based',
          unit_price: 0,
          input_unit_price: m3TextPrice.input_unit_price,
          output_unit_price: m3TextPrice.output_unit_price,
          platform_unit_price: 0,
          platform_input_unit_price: m3TextPrice.platform_input_unit_price,
          platform_output_unit_price: m3TextPrice.platform_output_unit_price,
          platform_min_charge: m3TextPrice.platform_min_charge ?? 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', z.id);
    }
  }

  if (skipRoutes) {
    console.log('\n[routes] skipped');
    return;
  }

  // 3) 业务路由切到首选 Provider
  console.log('\n[routes] writing/text → maxplan/MiniMax-M3');
  for (const r of WRITING_TEXT_TO_MAXPLAN) {
    const { data: hit } = await sb
      .from(r.table)
      .select('id,provider,model')
      .eq('task_key', r.task_key)
      .eq('sub_type', r.sub_type)
      .maybeSingle();
    if (!hit) {
      console.log(`  skip missing ${r.table} ${r.task_key}/${r.sub_type}`);
      continue;
    }
    if (hit.provider === 'maxplan' && hit.model === 'MiniMax-M3') {
      console.log(`  ok ${r.task_key}/${r.sub_type}`);
      continue;
    }
    console.log(`  ${r.task_key}/${r.sub_type}: ${hit.provider}/${hit.model} → maxplan/MiniMax-M3`);
    if (dryRun) continue;
    const { error } = await sb
      .from(r.table)
      .update({
        provider: 'maxplan',
        model: 'MiniMax-M3',
        updated_at: new Date().toISOString(),
      })
      .eq('id', hit.id);
    if (error) console.error('    update failed:', error.message);
  }

  console.log('\n[routes] graph deer → atlascloud');
  for (const r of GRAPH_TO_ATLAS) {
    const { data: hit } = await sb
      .from('graph_scope_config')
      .select('id,provider,model')
      .eq('task_key', r.task_key)
      .eq('sub_type', r.sub_type)
      .maybeSingle();
    if (!hit) {
      console.log(`  skip missing graph ${r.task_key}/${r.sub_type}`);
      continue;
    }
    if (hit.provider === 'atlascloud' && hit.model === r.model) {
      console.log(`  ok ${r.task_key}/${r.sub_type}`);
      continue;
    }
    console.log(
      `  ${r.task_key}/${r.sub_type}: ${hit.provider}/${hit.model} → atlascloud/${r.model}`,
    );
    if (dryRun) continue;
    const { error } = await sb
      .from('graph_scope_config')
      .update({
        provider: 'atlascloud',
        model: r.model,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hit.id);
    if (error) console.error('    update failed:', error.message);
  }

  console.log('\n完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
