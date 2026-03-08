// 简单脚本检查provider_pricing和provider_balances表
// 需要先设置环境变量

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, 'mxmdata/.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:3001';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误：缺少SUPABASE_URL或SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY环境变量');
  process.exit(1);
}

console.log('连接到Supabase:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function checkPricing() {
  try {
    // 检查provider_pricing表
    const { data: pricingData, error: pricingError } = await supabase
      .from('provider_pricing')
      .select('*')
      .limit(10);

    if (pricingError) {
      console.error('查询provider_pricing表错误:', pricingError);
      return;
    }

    console.log(`\n=== provider_pricing表记录数: ${pricingData?.length || 0} ===`);
    if (pricingData && pricingData.length > 0) {
      pricingData.forEach((row, i) => {
        console.log(`[${i+1}] provider: ${row.provider}, scope: ${row.scope}, model_key: ${row.model_key}, charge_mode: ${row.charge_mode}`);
        console.log(`     unit_price: ${row.unit_price}, platform_unit_price: ${row.platform_unit_price || 'NULL'}`);
      });
    } else {
      console.log('表中无记录');
    }

    // 检查provider_balances表
    const { data: balancesData, error: balancesError } = await supabase
      .from('provider_balances')
      .select('*')
      .limit(10);

    if (balancesError) {
      console.error('查询provider_balances表错误:', balancesError);
      return;
    }

    console.log(`\n=== provider_balances表记录数: ${balancesData?.length || 0} ===`);
    if (balancesData && balancesData.length > 0) {
      balancesData.forEach((row, i) => {
        console.log(`[${i+1}] provider: ${row.provider}, balance: ${row.balance} ${row.currency}`);
      });
    } else {
      console.log('表中无记录');
    }

    // 检查deer provider的定价（最常见的）
    const { data: deerPricing, error: deerError } = await supabase
      .from('provider_pricing')
      .select('*')
      .eq('provider', 'deer')
      .limit(5);

    if (deerError) {
      console.error('查询deer provider定价错误:', deerError);
    } else {
      console.log(`\n=== deer provider定价记录数: ${deerPricing?.length || 0} ===`);
      if (deerPricing && deerPricing.length > 0) {
        deerPricing.forEach((row, i) => {
          console.log(`[${i+1}] scope: ${row.scope}, model_key: ${row.model_key}, charge_mode: ${row.charge_mode}`);
        });
      } else {
        console.log('警告：deer provider没有定价记录！这可能导致"服务价格报错"');
      }
    }

    // 检查deer provider余额
    const { data: deerBalance, error: deerBalanceError } = await supabase
      .from('provider_balances')
      .select('*')
      .eq('provider', 'deer')
      .single();

    if (deerBalanceError) {
      if (deerBalanceError.code === 'PGRST116') {
        console.log('\n=== deer provider余额: 无记录 (需要添加) ===');
      } else {
        console.error('查询deer provider余额错误:', deerBalanceError);
      }
    } else {
      console.log(`\n=== deer provider余额: ${deerBalance.balance} ${deerBalance.currency} ===`);
      if (parseFloat(deerBalance.balance) <= 0) {
        console.log('警告：deer provider余额不足或为0！');
      }
    }

  } catch (err) {
    console.error('脚本执行错误:', err);
  }
}

checkPricing();