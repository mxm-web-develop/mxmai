/**
 * mxmauth API 测试脚本
 * 用于测试用户注册、登录、Token 刷新等功能
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// 动态导入 axios（如果未安装会提示）
let axios: any;
try {
  axios = require('axios');
} catch (error) {
  console.error('❌ 请先安装 axios: pnpm add axios -w');
  process.exit(1);
}

// 从 mxmdata 目录加载 .env 文件（如果存在）
dotenv.config({ path: resolve(__dirname, '../../../mxmdata/.env') });
dotenv.config(); // 也尝试从当前目录加载

const BASE_URL = process.env.API_URL || 'http://localhost:4001';
const API_BASE = `${BASE_URL}/api/v1/account`;

interface TestResult {
  name: string;
  success: boolean;
  message?: string;
  data?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>): Promise<void> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    const result = await fn();
    results.push({ name, success: true, data: result });
    console.log(`✅ 通过`);
  } catch (error: any) {
    results.push({ name, success: false, message: error.message });
    console.log(`❌ 失败: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 开始测试 mxmauth API...\n');
  console.log(`📍 API 地址: ${BASE_URL}\n`);

  let accessToken = '';
  let refreshToken = '';
  let userId = '';
  let username = '';

  // 测试 1: 健康检查
  await test('健康检查', async () => {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    return response.data;
  });

  // 测试 2: 用户注册
  await test('用户注册', async () => {
    const timestamp = Date.now();
    username = `testuser_${timestamp}`;
    const response = await axios.post(`${API_BASE}/register`, {
      username,
      email: `test_${timestamp}@example.com`,
      password: 'testpassword123',
    });

    if (response.status !== 201) {
      throw new Error(`Expected 201, got ${response.status}`);
    }

    const { user, tokens } = response.data.data;
    userId = user.id;
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;

    console.log(`   用户 ID: ${userId}`);
    console.log(`   用户名: ${username}`);
    return { user, tokens };
  });

  // 测试 3: 用户登录
  await test('用户登录', async () => {
    const response = await axios.post(`${API_BASE}/login`, {
      username,
      password: 'testpassword123',
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const { user, tokens } = response.data.data;
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;

    return { user, tokens };
  });

  // 测试 4: 获取用户信息（需要认证）
  await test('获取用户信息', async () => {
    const response = await axios.get(`${API_BASE}/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data.data;
  });

  // 测试 5: 更新用户信息
  await test('更新用户信息', async () => {
    const response = await axios.put(
      `${API_BASE}/profile`,
      {
        avatar_url: 'https://example.com/avatar.jpg',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data.data;
  });

  // 测试 6: 获取用户设置
  await test('获取用户设置', async () => {
    const response = await axios.get(`${API_BASE}/settings`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data.data;
  });

  // 测试 7: 更新用户设置
  await test('更新用户设置', async () => {
    const response = await axios.put(
      `${API_BASE}/settings`,
      {
        theme: 'dark',
        language: 'en',
        notifications_enabled: true,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data.data;
  });

  // 测试 8: 获取账户余额（已删除，钱包逻辑完善后再添加）
  // await test('获取账户余额', async () => {
  //   const response = await axios.get(`${API_BASE}/balance`, {
  //     headers: {
  //       Authorization: `Bearer ${accessToken}`,
  //     },
  //   });
  //
  //   if (response.status !== 200) {
  //     throw new Error(`Expected 200, got ${response.status}`);
  //   }
  //
  //   return response.data.data;
  // });

  // 测试 9: 获取会员信息
  await test('获取会员信息', async () => {
    const response = await axios.get(`${API_BASE}/membership`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data.data;
  });

  // 测试 10: 刷新 Token
  await test('刷新 Token', async () => {
    const response = await axios.post(`${API_BASE}/refresh-token`, {
      refresh_token: refreshToken,
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const tokens = response.data.data;
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;

    return tokens;
  });

  // 测试 11: 用户登出
  await test('用户登出', async () => {
    const response = await axios.post(
      `${API_BASE}/logout`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return response.data;
  });

  // 测试 12: 重复注册（应该失败）
  await test('重复注册（应该失败）', async () => {
    try {
      await axios.post(`${API_BASE}/register`, {
        username,
        email: `test_${Date.now()}@example.com`,
        password: 'testpassword123',
      });
      throw new Error('应该返回 409 错误');
    } catch (error: any) {
      if (error.response?.status === 409) {
        return { message: '正确捕获重复错误' };
      }
      throw error;
    }
  });

  // 测试 13: 无效 Token（应该失败）
  await test('无效 Token（应该失败）', async () => {
    try {
      await axios.get(`${API_BASE}/profile`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });
      throw new Error('应该返回 401 错误');
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { message: '正确拒绝无效 Token' };
      }
      throw error;
    }
  });

  // 输出测试结果
  console.log('\n\n📊 测试结果汇总:');
  console.log('='.repeat(50));
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.success && result.message) {
      console.log(`   错误: ${result.message}`);
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`通过: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试运行失败:', error);
  process.exit(1);
});

