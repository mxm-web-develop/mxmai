/**
 * 检查并设置生图所需的 provider_pricing 和 provider_balances
 * 运行: cd 项目根目录 && pnpm exec tsx scripts/check-and-setup-pricing.ts
 */
import { Client } from 'pg';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), 'mxmdata/.env') });

const connStr = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

async function main() {
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    console.log('✅ 已连接数据库');

    // 1. 检查 provider_pricing
    const { rows: pricingRows } = await client.query(
      `SELECT provider, scope, model_key, charge_mode, unit_price FROM provider_pricing WHERE provider = 'deer' ORDER BY model_key`
    );
    console.log('\n=== provider_pricing (deer) ===');
    if (pricingRows.length === 0) {
      console.log('❌ 无记录，需要插入 nano-banana、nano-banana-pro 和 seedream-4 定价');
      await client.query(`
        INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency)
        VALUES 
          ('deer', 'graph', 'nano-banana', 'per_image', 0.005, 'USD'),
          ('deer', 'graph', 'nano-banana-pro', 'per_image', 0.01, 'USD'),
          ('deer', 'graph', 'seedream-4', 'per_image', 0.03, 'USD')
        ON CONFLICT (provider, scope, model_key) DO NOTHING
      `);
      console.log('✅ 已插入 nano-banana、nano-banana-pro 和 seedream-4 定价');
    } else {
      pricingRows.forEach((r) => console.log(`  ${r.provider} | ${r.scope} | ${r.model_key} | ${r.charge_mode} | ${r.unit_price}`));
    }

    // 2. 检查 provider_balances
    const { rows: balanceRows } = await client.query(
      `SELECT provider, balance, currency FROM provider_balances WHERE provider = 'deer'`
    );
    console.log('\n=== provider_balances (deer) ===');
    if (balanceRows.length === 0) {
      console.log('❌ 无记录，需要插入 deer 余额');
      await client.query(`
        INSERT INTO provider_balances (provider, balance, currency)
        VALUES ('deer', 100.00, 'USD')
        ON CONFLICT (provider) DO UPDATE SET balance = 100.00
      `);
      console.log('✅ 已插入 deer 余额 100 USD');
    } else {
      const bal = balanceRows[0];
      console.log(`  provider=${bal.provider} balance=${bal.balance} ${bal.currency}`);
      if (parseFloat(String(bal.balance)) <= 0) {
        await client.query(`UPDATE provider_balances SET balance = 100.00 WHERE provider = 'deer'`);
        console.log('⚠️ 余额为 0，已更新为 100 USD');
      }
    }

    // 3. 再次验证
    const { rows: afterPricing } = await client.query(
      `SELECT model_key FROM provider_pricing WHERE provider = 'deer' AND scope = 'graph'`
    );
    const hasNano = afterPricing.some((r) => r.model_key === 'nano-banana') || afterPricing.some((r) => r.model_key === 'nano-banana-pro');
    const hasSeedream = afterPricing.some((r) => r.model_key === 'seedream-4');
    console.log('\n=== 验证 ===');
    console.log(`  nano-banana / nano-banana-pro 定价: ${hasNano ? '✅' : '❌'}`);
    console.log(`  seedream-4 定价: ${hasSeedream ? '✅' : '❌'}`);
  } catch (e: any) {
    console.error('❌ 错误:', e.message);
    if (e.code === '42P01') {
      console.log('  表不存在，请先运行: pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing');
      console.log('  pnpm --filter @mxmai/mxmdata run migrate:provider-balances');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
