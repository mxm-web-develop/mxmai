// 验证定价配置
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

async function verify() {
  try {
    console.log('\n🔍 验证图片生成定价配置\n');

    // 检查provider_pricing表中deer的记录
    const { data: pricingData, error: pricingError } = await supabase
      .from('provider_pricing')
      .select('*')
      .eq('provider', 'deer')
      .in('model_key', ['nano-banana', 'seedream-4', 'flux-2-pro'])
      .order('model_key', { ascending: true })
      .order('scope', { ascending: true });

    if (pricingError) {
      console.error('查询provider_pricing表错误:', pricingError);
      return;
    }

    console.log('✅ DeerAPI定价配置:');
    const requiredModels = ['nano-banana', 'seedream-4', 'flux-2-pro'];
    const requiredScopes = ['graph', 'default'];

    for (const model of requiredModels) {
      const modelRecords = pricingData?.filter(r => r.model_key === model) || [];
      const hasGraph = modelRecords.some(r => r.scope === 'graph');
      const hasDefault = modelRecords.some(r => r.scope === 'default');

      console.log(`\n  ${model}:`);
      console.log(`    graph scope: ${hasGraph ? '✅' : '❌'}`);
      console.log(`    default scope: ${hasDefault ? '✅' : '❌'}`);

      if (modelRecords.length > 0) {
        for (const record of modelRecords) {
          console.log(`      - ${record.scope}: ${record.unit_price} ${record.currency} (成本) → ${record.platform_unit_price || '未设置'} MXM-TOKEN (平台)`);
        }
      }
    }

    // 检查provider_balances
    const { data: balanceData, error: balanceError } = await supabase
      .from('provider_balances')
      .select('*')
      .eq('provider', 'deer')
      .single();

    if (balanceError) {
      if (balanceError.code === 'PGRST116') {
        console.log('\n❌ DeerAPI余额: 未配置');
      } else {
        console.error('查询provider_balances表错误:', balanceError);
      }
    } else {
      const balance = parseFloat(balanceData.balance);
      console.log(`\n✅ DeerAPI余额: ${balance} ${balanceData.currency} ${balance > 0 ? '✅' : '❌ (余额不足)'}`);
    }

    // 检查charge_mode是否正确
    console.log('\n📊 计费模式检查:');
    const incorrectModes = pricingData?.filter(r => r.charge_mode !== 'per_image') || [];
    if (incorrectModes.length > 0) {
      console.log('⚠️  以下记录的计费模式可能不正确（图片生成应为per_image）:');
      incorrectModes.forEach(r => {
        console.log(`    ${r.model_key} (${r.scope}): ${r.charge_mode}`);
      });
    } else {
      console.log('✅ 所有图片生成模型的计费模式均为per_image');
    }

    // 总结
    console.log('\n📋 配置状态总结:');

    const allModelsHaveGraphScope = requiredModels.every(model =>
      pricingData?.some(r => r.model_key === model && r.scope === 'graph')
    );

    const allModelsHaveDefaultScope = requiredModels.every(model =>
      pricingData?.some(r => r.model_key === model && r.scope === 'default')
    );

    const hasBalance = balanceData && parseFloat(balanceData.balance) > 0;

    console.log(`  ✅ 所有模型都有graph scope: ${allModelsHaveGraphScope ? '是' : '否'}`);
    console.log(`  ✅ 所有模型都有default scope: ${allModelsHaveDefaultScope ? '是' : '否'}`);
    console.log(`  ✅ DeerAPI余额充足: ${hasBalance ? '是' : '否'}`);

    if (allModelsHaveGraphScope && allModelsHaveDefaultScope && hasBalance) {
      console.log('\n🎉 所有检查通过！图片生成应该可以正常工作。');
      console.log('\n💡 下一步:');
      console.log('  1. 重启mxmcgi服务: pnpm dev:mxmcgi');
      console.log('  2. 发送图片生成请求测试');
      console.log('  3. 检查任务状态和日志');
    } else {
      console.log('\n⚠️  配置不完整，请修复上述问题。');
    }

  } catch (err) {
    console.error('验证过程中出错:', err);
  }
}

verify();