/**
 * 将 text/plan/eshop-garment-batch 路由与计价改为 gemini-3.5-flash（不碰 formSchema / prompt）
 *
 * 用法：pnpm run patch:text-plan-eshop-routing-gemini-35
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MODEL = 'gemini-3.5-flash';
const PROVIDER = 'openrouter';

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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const sb = getSupabaseClient();

  const { data: route, error: routeErr } = await sb
    .from('text_scope_config')
    .update({ model: MODEL, provider: PROVIDER, updated_at: new Date().toISOString() })
    .eq('scope', 'text')
    .eq('task_key', 'plan')
    .eq('sub_type', 'eshop-garment-batch')
    .select('model, provider')
    .single();
  if (routeErr) throw routeErr;

  const { data: pricingRows } = await sb
    .from('business_pricing')
    .select('id, model_key')
    .eq('business_type', 'text-plan-eshop-garment-batch');

  if (pricingRows?.length) {
    const { error: priceErr } = await sb
      .from('business_pricing')
      .update({ model_key: MODEL, provider: PROVIDER, updated_at: new Date().toISOString() })
      .eq('business_type', 'text-plan-eshop-garment-batch');
    if (priceErr) throw priceErr;
  }

  console.log('text_scope_config:', route);
  console.log('business_pricing rows updated:', pricingRows?.length ?? 0);
  console.log(`✅ text/plan/eshop-garment-batch → ${PROVIDER} / ${MODEL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
