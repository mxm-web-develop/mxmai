/**
 * 创建 Admin 用户脚本
 * 
 * 用法：
 *   tsx src/scripts/create-admin-user.ts
 *   tsx src/scripts/create-admin-user.ts <username> <email> <password>
 * 
 * 示例：
 *   tsx src/scripts/create-admin-user.ts
 *   tsx src/scripts/create-admin-user.ts myadmin admin@example.com mypassword123
 */

import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bcrypt from 'bcrypt';
import { RepositoryFactory } from '../factories/RepositoryFactory';

// ES 模块中获取 __dirname 的等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
const envPaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✅ 已加载环境变量: ${envPath}`);
    break;
  }
}

// 密码加密函数（直接使用 bcrypt，本地脚本，不通过 Gateway）
async function hashPassword(password: string): Promise<string> {
  // 直接使用 bcrypt，这是本地脚本，直接在系统内部操作，不通过 Gateway
  // bcrypt 已安装在项目根目录，使用 ES 模块导入
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  return await bcrypt.hash(password, saltRounds);
}

async function createAdminUser() {
  const username = process.argv[2] || 'admin';
  const email = process.argv[3] || 'admin@example.com';
  const password = process.argv[4] || 'admin123';

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 创建 Admin 用户');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   用户名: ${username}`);
  console.log(`   邮箱: ${email}`);
  console.log(`   密码: ${'*'.repeat(password.length)}`);
  console.log('');

  try {
    // 初始化 RepositoryFactory
    RepositoryFactory.init();
    console.log('✅ RepositoryFactory 已初始化');

    const userRepo = RepositoryFactory.createUserRepository();

    // 检查用户是否已存在
    let user;
    try {
      user = await userRepo.findByUsername(username);
      if (user) {
        console.log('⚠️  用户已存在，更新为 admin 角色...');
        await userRepo.update(user.id, { 
          role: 'admin',
          status: 'active',
        });
        console.log('✅ Admin 角色已更新');
        console.log('');
        console.log('📋 用户信息:');
        console.log(`   ID: ${user.id}`);
        console.log(`   用户名: ${user.username}`);
        console.log(`   邮箱: ${user.email || '未设置'}`);
        console.log(`   角色: admin`);
        console.log(`   状态: ${user.status}`);
        return;
      }
    } catch (error: any) {
      // 用户不存在，继续创建
      if (error.code !== 'NOT_FOUND') {
        throw error;
      }
    }

    // 生成密码哈希
    console.log('🔒 生成密码哈希...');
    const passwordHash = await hashPassword(password);
    console.log('✅ 密码哈希已生成');

    // 创建用户
    console.log('📝 创建用户...');
    user = await userRepo.create({
      username,
      email,
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
      level: 10,
      membership_type: 'premium',
    });

    console.log('✅ Admin 用户创建成功');
    console.log('');
    console.log('📋 用户信息:');
    console.log(`   ID: ${user.id}`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   邮箱: ${user.email || '未设置'}`);
    console.log(`   角色: ${user.role}`);
    console.log(`   状态: ${user.status}`);
    console.log(`   等级: ${user.level}`);
    console.log(`   会员类型: ${user.membership_type}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 完成！');
    console.log('');
    console.log('💡 下一步：');
    console.log('   使用以下命令登录：');
    console.log(`   curl -X POST http://localhost:3000/api/v1/account/login \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"username": "${username}", "password": "${password}"}'`);
    console.log('');
  } catch (error: any) {
    console.error('');
    console.error('❌ 创建失败:', error.message);
    if (error.code === 'DUPLICATE') {
      console.error('   提示: 用户名或邮箱已存在');
    }
    console.error('');
    process.exit(1);
  }
}

createAdminUser();


