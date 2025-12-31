/**
 * 数据库连接测试脚本
 * 用于验证数据库配置是否正确
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { RepositoryFactory } from '../factories/RepositoryFactory';
import { initSupabaseClient } from '../adapters/supabase/SupabaseClient';
import { initMinIOClient } from '../adapters/minio/MinIOClient';
import { loadDataConfig } from '../config/dataConfig';

// 从 mxmdata 目录加载 .env 文件
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testConnection() {
  console.log('🔍 开始测试数据库连接...\n');

  try {
    // 加载配置
    const config = loadDataConfig();
    console.log(`✅ 配置加载成功`);
    console.log(`   适配器: ${config.adapter}`);
    console.log(`   MinIO: ${config.minio.endPoint}:${config.minio.port}\n`);

    // 初始化 Repository Factory
    RepositoryFactory.init(config);
    console.log('✅ Repository Factory 初始化成功\n');

    // 测试数据库连接
    if (config.adapter === 'supabase' && config.supabase) {
      console.log('🔗 测试 Supabase 连接...');
      try {
        const client = initSupabaseClient(config.supabase);
        
        // 尝试查询一个简单的表（如果存在）
        const { data, error } = await client.from('users').select('count').limit(1);
        
        if (error && error.code !== 'PGRST116') {
          // PGRST116 表示表不存在，这是正常的（表可能还没创建）
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log('⚠️  表尚未创建，但连接正常');
            console.log('   提示: 请运行 SQL 迁移脚本创建表结构\n');
          } else {
            throw error;
          }
        } else {
          console.log('✅ Supabase 连接成功\n');
        }
      } catch (error: any) {
        console.error('❌ Supabase 连接失败:', error.message);
        console.error('   请检查 SUPABASE_URL 和 SUPABASE_ANON_KEY 是否正确\n');
        process.exit(1);
      }
    } else {
      console.error('❌ 不支持的适配器:', config.adapter);
      console.error('   当前只支持 Supabase 适配器');
      console.error('   提示: Supabase 基于 PostgreSQL，提供 REST API 和实时功能\n');
      process.exit(1);
    }

    // 测试 MinIO 连接
    console.log('🔗 测试 MinIO 连接...');
    try {
      const minioClient = initMinIOClient(config.minio);
      
      // 尝试列出存储桶
      const buckets = await minioClient.listBuckets();
      console.log('✅ MinIO 连接成功');
      console.log(`   可用存储桶: ${buckets.length} 个\n`);
    } catch (error: any) {
      console.error('❌ MinIO 连接失败:', error.message);
      console.error('   请检查 MinIO 服务是否运行，以及配置是否正确\n');
      process.exit(1);
    }

    // 测试 Repository
    console.log('🔗 测试 Repository 创建...');
    try {
      const userRepo = RepositoryFactory.createUserRepository();
      const storageRepo = RepositoryFactory.createStorageRepository();
      console.log('✅ Repository 创建成功');
      console.log(`   UserRepository: ${userRepo.constructor.name}`);
      console.log(`   StorageRepository: ${storageRepo.constructor.name}\n`);
    } catch (error: any) {
      console.error('❌ Repository 创建失败:', error.message);
      process.exit(1);
    }

    console.log('🎉 所有连接测试通过！数据库已就绪。\n');
    console.log('📝 下一步:');
    console.log('   1. 运行 SQL 迁移脚本创建表结构');
    console.log('   2. 开始使用 Repository 进行数据操作');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error('\n💡 提示:');
    console.error('   1. 检查 mxmdata/.env 文件配置是否正确');
    console.error('   2. 确保数据库服务正在运行');
    console.error('   3. 检查网络连接');
    process.exit(1);
  }
}

// 运行测试
testConnection();

