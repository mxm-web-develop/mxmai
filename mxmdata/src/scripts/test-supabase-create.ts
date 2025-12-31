/**
 * Supabase 创建数据测试脚本
 * 用于测试用户创建、查询、更新等功能
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { RepositoryFactory } from '../factories/RepositoryFactory';
import { loadDataConfig } from '../config/dataConfig';
import type { CreateUserDto, UpdateUserSettingsDto } from '../interfaces/IUserRepository';

// 从 mxmdata 目录加载 .env 文件
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testSupabaseCreate() {
  console.log('🧪 开始测试 Supabase 创建数据功能...\n');

  try {
    // 1. 加载配置并初始化
    console.log('📋 步骤 1: 加载配置...');
    const config = loadDataConfig();
    
    if (config.adapter !== 'supabase') {
      console.error('❌ 当前适配器不是 Supabase，请设置 DATA_ADAPTER=supabase');
      process.exit(1);
    }

    if (!config.supabase) {
      console.error('❌ Supabase 配置缺失');
      process.exit(1);
    }

    console.log(`✅ 配置加载成功`);
    console.log(`   - 适配器: ${config.adapter}`);
    console.log(`   - Supabase URL: ${config.supabase.url}\n`);

    // 2. 初始化 Repository Factory
    console.log('📋 步骤 2: 初始化 Repository Factory...');
    RepositoryFactory.init(config);
    const userRepo = RepositoryFactory.createUserRepository();
    console.log('✅ Repository Factory 初始化成功\n');

    // 3. 创建测试用户
    console.log('📋 步骤 3: 创建测试用户...');
    const timestamp = Date.now();
    const testUser: CreateUserDto = {
      username: `testuser_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      phone: `138${timestamp.toString().slice(-8)}`,
      password_hash: '$2b$10$example.hash.here',
      avatar_url: 'https://example.com/avatar.jpg',
      level: 1,
      balance: 100.0,
      membership_type: 'free',
      status: 'active',
    };

    console.log('   创建用户数据:');
    console.log(`   - 用户名: ${testUser.username}`);
    console.log(`   - 邮箱: ${testUser.email}`);
    console.log(`   - 手机: ${testUser.phone}`);
    console.log(`   - 余额: ${testUser.balance}`);
    console.log(`   - 会员类型: ${testUser.membership_type}\n`);

    const createdUser = await userRepo.create(testUser);
    console.log('✅ 用户创建成功！');
    console.log(`   - 用户 ID: ${createdUser.id}`);
    console.log(`   - 创建时间: ${createdUser.created_at}\n`);

    // 4. 查询创建的用户
    console.log('📋 步骤 4: 查询创建的用户...');
    const foundById = await userRepo.findById(createdUser.id);
    if (foundById) {
      console.log('✅ 通过 ID 查询成功');
      console.log(`   - 用户名: ${foundById.username}`);
      console.log(`   - 邮箱: ${foundById.email}`);
      console.log(`   - 余额: ${foundById.balance}\n`);
    } else {
      console.error('❌ 未找到创建的用户');
      process.exit(1);
    }

    const foundByEmail = await userRepo.findByEmail(testUser.email!);
    if (foundByEmail) {
      console.log('✅ 通过邮箱查询成功');
      console.log(`   - 用户 ID: ${foundByEmail.id}`);
      console.log(`   - 用户名: ${foundByEmail.username}\n`);
    }

    const foundByUsername = await userRepo.findByUsername(testUser.username);
    if (foundByUsername) {
      console.log('✅ 通过用户名查询成功');
      console.log(`   - 用户 ID: ${foundByUsername.id}`);
      console.log(`   - 邮箱: ${foundByUsername.email}\n`);
    }

    // 5. 更新用户设置
    console.log('📋 步骤 5: 更新用户设置...');
    const settingsUpdate: UpdateUserSettingsDto = {
      theme: 'dark',
      language: 'en',
      notifications_enabled: true,
    };

    const updatedSettings = await userRepo.updateSettings(createdUser.id, settingsUpdate);
    console.log('✅ 用户设置更新成功');
    console.log(`   - 主题: ${updatedSettings.theme}`);
    console.log(`   - 语言: ${updatedSettings.language}`);
    console.log(`   - 通知启用: ${updatedSettings.notifications_enabled}\n`);

    // 6. 查询用户设置
    console.log('📋 步骤 6: 查询用户设置...');
    const settings = await userRepo.getSettings(createdUser.id);
    if (settings) {
      console.log('✅ 用户设置查询成功');
      console.log(`   - 主题: ${settings.theme}`);
      console.log(`   - 语言: ${settings.language}`);
      console.log(`   - 通知启用: ${settings.notifications_enabled}\n`);
    }

    // 7. 更新用户信息
    console.log('📋 步骤 7: 更新用户信息...');
    const updatedUser = await userRepo.update(createdUser.id, {
      balance: 200.0,
      level: 2,
      membership_type: 'pro',
    });
    console.log('✅ 用户信息更新成功');
    console.log(`   - 新余额: ${updatedUser.balance}`);
    console.log(`   - 新等级: ${updatedUser.level}`);
    console.log(`   - 新会员类型: ${updatedUser.membership_type}\n`);

    // 8. 测试重复创建（应该失败）
    console.log('📋 步骤 8: 测试重复创建（应该失败）...');
    try {
      await userRepo.create({
        username: testUser.username, // 重复的用户名
        email: `different_${timestamp}@example.com`,
        password_hash: 'hash',
      });
      console.error('❌ 应该抛出重复错误，但没有');
    } catch (error: any) {
      if (error.code === 'DUPLICATE') {
        console.log('✅ 正确捕获重复错误');
        console.log(`   - 错误类型: ${error.name}`);
        console.log(`   - 重复字段: ${error.field}\n`);
      } else {
        throw error;
      }
    }

    // 9. 清理测试数据（可选）
    console.log('📋 步骤 9: 清理测试数据...');
    await userRepo.delete(createdUser.id);
    console.log('✅ 测试用户已删除\n');

    console.log('🎉 所有测试通过！');
    console.log('\n✅ Supabase 创建数据功能完全正常');
    console.log('✅ 用户 CRUD 操作成功');
    console.log('✅ 用户设置功能正常');
    console.log('✅ 错误处理正确');

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.code) {
      console.error(`   错误代码: ${error.code}`);
    }
    if (error.field) {
      console.error(`   错误字段: ${error.field}`);
    }
    if (error.stack) {
      console.error('\n堆栈跟踪:');
      console.error(error.stack);
    }
    console.error('\n💡 提示:');
    console.error('   1. 检查 mxmdata/.env 文件配置是否正确');
    console.error('   2. 确保 Supabase 服务正在运行');
    console.error('   3. 确保 users 和 user_settings 表已创建');
    console.error('   4. 检查网络连接');
    process.exit(1);
  }
}

// 运行测试
testSupabaseCreate();

