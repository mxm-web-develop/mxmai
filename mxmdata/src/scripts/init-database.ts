/**
 * 数据库初始化脚本
 * 用于创建必要的表结构（仅适用于 Supabase）
 * 
 * 注意：对于 Supabase，建议使用 Supabase Dashboard 的 SQL Editor 运行 SQL 脚本
 * 或者使用 Supabase CLI
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initSupabaseClient } from '../adapters/supabase/SupabaseClient';
import { loadDataConfig } from '../config/dataConfig';

// 从 mxmdata 目录加载 .env 文件
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function initDatabase() {
  console.log('🚀 开始初始化数据库...\n');

  try {
    const config = loadDataConfig();

    if (config.adapter !== 'supabase') {
      console.error('❌ 当前只支持 Supabase 适配器');
      console.error('   请设置 DATA_ADAPTER=supabase 并使用 Supabase\n');
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
    // 注意：这里假设 SQL 文件在 mxmauth 模块中
    // 实际使用时，应该根据模块需要加载对应的 SQL 文件
    console.log('📝 提示:');
    console.log('   对于 Supabase，建议使用以下方式初始化数据库:');
    console.log('   1. 使用 Supabase Dashboard 的 SQL Editor');
    console.log('   2. 使用 Supabase CLI: supabase db push');
    console.log('   3. 或者手动运行 SQL 迁移脚本\n');

    console.log('📄 SQL 文件位置:');
    console.log('   - mxmdata/src/database/schemas/mxmauth.sql\n');

    console.log('💡 如果使用 Supabase Dashboard:');
    console.log('   1. 登录 Supabase Dashboard');
    console.log('   2. 选择你的项目');
    console.log('   3. 进入 SQL Editor');
    console.log('   4. 复制并运行 schema.sql 中的 SQL 语句\n');

  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

initDatabase();

