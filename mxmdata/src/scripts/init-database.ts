/**
 * 数据库初始化脚本
 * 自动执行 src/database/schemas 下的所有 schema SQL，创建系统所需表结构
 *
 * 仅适用于 Supabase/Postgres，要求提供只在后端使用的数据库连接串：
 * - SUPABASE_DB_URL 或 DATABASE_URL
 */

import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

// 使用进程工作目录作为 mxmdata 包根目录（通过 pnpm --filter 运行时，cwd 即为 mxmdata）
const MXMDATA_ROOT = process.cwd();

// 从 mxmdata 目录加载 .env 文件（优先本包 .env，其次仓库根 .env）
dotenv.config({ path: join(MXMDATA_ROOT, '.env') });
dotenv.config({ path: join(MXMDATA_ROOT, '../.env') });

async function runSqlFile(client: Client, filePath: string) {
  const sql = readFileSync(filePath, 'utf8');
  const fileName = filePath.split('/').pop() || filePath;

  console.log(`\n📄 执行 SQL 文件: ${fileName}`);

  try {
    await client.query(sql);
    console.log(`✅ 执行成功: ${fileName}`);
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || '';
    
    // 处理"已存在"类的错误（表、索引、trigger、function 等），这些是幂等的，只记录警告
    if (
      errorMsg.includes('already exists') ||
      errorMsg.includes('duplicate') ||
      (errorMsg.includes('relation') && errorMsg.includes('already'))
    ) {
      console.warn(`⚠️  ${fileName} 执行时检测到已存在的对象，跳过（这是正常的幂等行为）`);
      console.warn(`   详情: ${error.message}`);
      return; // 不抛出错误，继续执行下一个文件
    }
    
    // 处理"列不存在"类的错误（可能是表结构版本不一致，允许跳过但给出警告）
    if (
      errorMsg.includes('does not exist') &&
      (errorMsg.includes('column') || errorMsg.includes('attribute'))
    ) {
      console.warn(`⚠️  ${fileName} 执行时检测到列不存在，可能是表结构版本不一致`);
      console.warn(`   详情: ${error.message}`);
      console.warn(`   提示: 如果表已存在但结构不完整，可能需要手动更新表结构或重新创建表`);
      return; // 不抛出错误，继续执行下一个文件
    }
    
    // 其他错误仍然抛出
    console.error(`❌ 执行失败: ${fileName}`);
    console.error(`   错误信息: ${error.message}`);
    throw error;
  }
}

async function initDatabase() {
  console.log('🚀 开始自动初始化数据库表结构...\n');

  const connectionString =
    process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      '❌ 缺少数据库连接串，请在环境变量中配置 SUPABASE_DB_URL 或 DATABASE_URL',
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('🔗 已连接到数据库\n');

    // 简单检查 Supabase/Postgres 是否可用
    const ping = await client.query('SELECT 1 as test');
    if (!ping.rows[0] || ping.rows[0].test !== 1) {
      throw new Error('数据库 ping 结果异常');
    }

    const schemaDir = join(MXMDATA_ROOT, 'src/database/schemas');

    // 按依赖顺序执行各模块的 schema
    const orderedFiles = [
      'supabase-init.sql', // 扩展/基础配置
      'mxmauth.sql', // 用户/认证
      'mxmcgi.sql', // CGI 任务
      'mxmnotify.sql', // 通知
      'mxmpay.sql', // 支付/钱包
      'mxmprompt.sql', // Prompt 优化
      'knowledge_base.sql', // 知识库
      // Agent/Smartflow 相关（如果暂时不用也可以安全执行）
      'mxmagent.sql',
      'mxmagent_smartflow.sql',
      'mxmagent_final.sql',
      'mxmagent_complete.sql',
      'mxmagent_final_safe.sql',
      // 预留：create-admin-user.sql 这类数据脚本可按需执行
    ];

    // 验证文件是否存在，避免路径错误
    const existingFiles = new Set(readdirSync(schemaDir));

    // 每个 schema 对应的“核心表/对象”列表，用于判断是否需要执行该 SQL
    const fileChecks: Record<string, string[]> = {
      'supabase-init.sql': ['vector'], // 扩展名，单独用 pg_extension 检查
      'mxmauth.sql': ['users'],
      'mxmcgi.sql': ['cgi_tasks'],
      'mxmnotify.sql': ['generation_tasks', 'notifications'],
      'mxmpay.sql': ['assets', 'wallets', 'payment_orders'],
      'mxmprompt.sql': ['prompt_templates'],
      'knowledge_base.sql': ['knowledge_bases', 'knowledge_base_documents'],
      'mxmagent.sql': ['agents'],
      'mxmagent_smartflow.sql': ['smartflows'],
      'mxmagent_final.sql': ['smartflow_executions'],
      'mxmagent_complete.sql': [],
      'mxmagent_final_safe.sql': [],
    };

    // 检查某个表是否存在于 public schema 中
    async function tableExists(table: string): Promise<boolean> {
      const res = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table],
      );
      return (res.rowCount ?? 0) > 0;
    }

    // 检查 pgvector 扩展是否已安装
    async function vectorExtensionExists(): Promise<boolean> {
      const res = await client.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`,
      );
      return (res.rowCount ?? 0) > 0;
    }

    for (const file of orderedFiles) {
      if (!existingFiles.has(file)) {
        console.warn(`⚠️ 跳过不存在的 SQL 文件: ${file}`);
        continue;
      }

      const checks = fileChecks[file] || [];

      // 特殊处理 pgvector 扩展
      if (file === 'supabase-init.sql') {
        const hasVector = await vectorExtensionExists();
        if (hasVector) {
          console.log('✅ 已检测到 pgvector 扩展，跳过 supabase-init.sql');
          continue;
        }
        const fullPath = join(schemaDir, file);
        await runSqlFile(client, fullPath);
        continue;
      }

      // 如果声明了需要检查的表，并且这些表都已存在，则跳过执行
      if (checks.length > 0) {
        let allExist = true;
        for (const table of checks) {
          const exists = await tableExists(table);
          if (!exists) {
            allExist = false;
            break;
          }
        }
        if (allExist) {
          console.log(
            `✅ 检测到 ${file} 中核心表已存在（${checks.join(
              ', ',
            )}），跳过该 schema`,
          );
          continue;
        }
      }

      const fullPath = join(schemaDir, file);
      await runSqlFile(client, fullPath);
    }

    console.log('\n🎉 所有 schema SQL 执行完成，数据库表结构已初始化');
  } catch (error: any) {
    console.error('\n❌ 初始化数据库失败:', error.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

initDatabase();

