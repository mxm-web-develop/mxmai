import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
for (const p of [path.join(root, '.env'), path.join(root, 'mxmcgi', '.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}
if (!process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_KEY;
}

import { RepositoryFactory } from '@mxmai/mxmdata';
import { BillingService } from '../statistics/billing-service';

async function main() {
  RepositoryFactory.init();
  const r1 = await BillingService.checkBalance({
    userId: '00000000-0000-0000-0000-000000000001',
    provider: 'atlascloud',
    modelKey: 'gpt-image-2',
    scope: 'graph',
    estimatedImageCount: 1,
  });
  console.log('gpt-image-2', {
    allowed: r1.allowed,
    est: r1.estimatedTokens,
    hasPricing: r1.hasPricing,
    code: r1.code,
    bal: r1.currentBalance,
  });

  const r2 = await BillingService.estimateTokens({
    provider: 'atlascloud',
    modelKey: 'gpt-image-2',
    scope: 'graph',
    estimatedImageCount: 1,
  });
  console.log('estimate', r2);

  try {
    await BillingService.estimateTokens({
      provider: 'atlascloud',
      modelKey: 'nonexistent-model-xyz',
      scope: 'graph',
      estimatedImageCount: 1,
    });
  } catch (e: any) {
    console.log('misconfigured OK', e.message, e.code);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
