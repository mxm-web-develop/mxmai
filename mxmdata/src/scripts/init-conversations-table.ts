/**
 * 初始化 conversations 表
 * 执行 mxmagent.sql 中的 SQL 语句
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { initSupabaseClient } from '../adapters/supabase/SupabaseClient';
import { loadDataConfig } from '../config/dataConfig';

// 从 mxmdata 目录加载 .env 文件
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function initConversationsTable() {
  console.log('🚀 开始初始化 conversations 表...\n');

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
    const sqlPath = resolve(__dirname, '../database/schemas/mxmagent.sql');
    console.log(`📄 读取 SQL 文件: ${sqlPath}`);
    const sql = readFileSync(sqlPath, 'utf-8');
    console.log('✅ SQL 文件读取成功\n');

    // 执行 SQL
    console.log('📝 执行 SQL 语句...');
    const { error } = await client.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // 如果 RPC 函数不存在，尝试直接执行 SQL（需要 service key）
      console.log('⚠️  RPC 函数不存在，尝试直接执行 SQL...');
      
      // 使用 service key 重新初始化客户端
      if (config.supabase.serviceKey) {
        const serviceClient = initSupabaseClient({
          url: config.supabase.url,
          anonKey: config.supabase.anonKey,
          serviceKey: config.supabase.serviceKey,
        });

        // 分割 SQL 语句（按分号分割）
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          if (statement.trim()) {
            console.log(`执行: ${statement.substring(0, 50)}...`);
            // 注意：Supabase JS 客户端不直接支持执行原始 SQL
            // 需要通过 REST API 或使用 PostgreSQL 客户端
            // 这里我们提示用户使用其他方式
          }
        }
      }

      console.log('\n💡 提示: Supabase JS 客户端无法直接执行原始 SQL');
      console.log('   请使用以下方式之一:');
      console.log('   1. 使用 Supabase Dashboard 的 SQL Editor');
      console.log('   2. 使用 Supabase CLI: supabase db push');
      console.log('   3. 使用 psql 直接连接数据库\n');
      
      console.log('📋 SQL 内容:');
      console.log('─'.repeat(60));
      console.log(sql);
      console.log('─'.repeat(60));
      
      return;
    }

    console.log('✅ conversations 表初始化成功！\n');
  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    console.error('\n💡 提示: 请手动在 Supabase Dashboard 的 SQL Editor 中执行 SQL');
    process.exit(1);
  }
}

initConversationsTable();
