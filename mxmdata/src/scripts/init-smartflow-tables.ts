/**
 * 初始化 Smartflow 相关数据库表
 * 用于创建 smartflows 和 smartflow_executions 表
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initSupabaseClient } from '../adapters/supabase/SupabaseClient';
import { loadDataConfig } from '../config/dataConfig';

// ES module 中获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function initSmartflowTables() {
  console.log('🚀 开始初始化 Smartflow 数据库表...\n');

  try {
    const config = loadDataConfig();

    if (config.adapter !== 'supabase') {
      console.error('❌ 当前只支持 Supabase 适配器');
      process.exit(1);
    }

    if (!config.supabase) {
      console.error('❌ Supabase 配置缺失');
      process.exit(1);
    }

    console.log('🔗 连接到 Supabase...');
    const client = initSupabaseClient(config.supabase);
    console.log('✅ 连接成功\n');

    // 读取 SQL 文件
    const sqlPath = resolve(__dirname, '../database/schemas/mxmagent_final.sql');
    console.log(`📄 读取 SQL 文件: ${sqlPath}`);
    const sql = readFileSync(sqlPath, 'utf-8');
    console.log('✅ SQL 文件读取成功\n');

    // 执行 SQL
    console.log('📝 执行 SQL 语句...');
    const { error } = await client.rpc('exec_sql', { sql_text: sql });

    if (error) {
      // 如果 exec_sql 函数不存在，尝试直接执行
      console.log('⚠️  尝试直接执行 SQL...');
      
      // 分割 SQL 语句（按分号分割，但要注意函数定义中的分号）
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            // 使用 Supabase 的 REST API 执行 SQL
            // 注意：Supabase 的 REST API 不支持直接执行任意 SQL
            // 需要使用 Supabase Dashboard 或 CLI
            console.log('⚠️  无法通过代码直接执行 SQL');
            console.log('   请使用以下方式之一：');
            console.log('   1. Supabase Dashboard SQL Editor');
            console.log('   2. Supabase CLI: supabase db push');
            console.log('\n📄 SQL 文件位置:');
            console.log(`   ${sqlPath}\n`);
            break;
          } catch (err: any) {
            console.error(`❌ 执行 SQL 失败: ${err.message}`);
          }
        }
      }
    } else {
      console.log('✅ SQL 执行成功\n');
    }

    console.log('💡 建议使用 Supabase Dashboard 执行 SQL:');
    console.log('   1. 登录 Supabase Dashboard');
    console.log('   2. 选择你的项目');
    console.log('   3. 进入 SQL Editor');
    console.log('   4. 复制并运行以下文件中的 SQL:');
    console.log(`      ${sqlPath}\n`);

  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    console.error('\n💡 请手动执行 SQL 文件创建表结构');
    process.exit(1);
  }
}

initSmartflowTables();
