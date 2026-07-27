/**
 * Playwright Auth Setup Fixture
 *
 * 使用 storageState() 解决 SPA 认证难题：
 * 1. 通过 API 直接获取 token（绕过登录 UI）
 * 2. 将 token 写入 localStorage
 * 3. 保存认证状态供后续测试使用
 */

import { test as setup } from '@playwright/test';

const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5173';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://localhost:4001';

setup('authenticate via API', async ({ page }) => {
  // 1. 直接调用登录 API 获取 token
  const loginResponse = await fetch(`${AUTH_BACKEND}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'testpassword123',
    }),
  });

  if (!loginResponse.ok) {
    const text = await loginResponse.text();
    throw new Error(`Login API failed (${loginResponse.status}): ${text}`);
  }

  const { data: loginData } = await loginResponse.json() as { data: { token: string; user: any } };
  const token = loginData.token;
  const userId = loginData.user?.id || 'test-user-id';

  // 2. 初始化 localStorage（模拟 AuthContext 首次加载）
  await page.goto(FRONTEND_BASE);
  await page.addInitScript((params) => {
    localStorage.setItem('api_token', params.token);
    localStorage.setItem('user_id', params.userId);
  }, { token, userId });

  // 3. 验证认证生效（访问需要认证的页面）
  await page.goto(`${FRONTEND_BASE}/agent-chat`);
  await page.waitForTimeout(2000);

  // 4. 检查是否有 401 错误（说明认证未生效）
  const has401Error = await page.evaluate(() => {
    return localStorage.getItem('api_token') === null;
  });

  if (has401Error) {
    throw new Error('Auth token was cleared - possibly 401 error handler fired');
  }

  console.log('✅ Auth setup completed successfully');
});

// 可选：创建带 API Token 的 storageState（用于无浏览器 UI 测试）
setup('create storage state file', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginResponse = await fetch(`${AUTH_BACKEND}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'testpassword123',
    }),
  });

  if (loginResponse.ok) {
    const { data: loginData } = await loginResponse.json() as { data: { token: string } };

    await page.goto(FRONTEND_BASE);
    await page.addInitScript((token) => {
      localStorage.setItem('api_token', token);
    }, loginData.token);

    // 保存认证状态到文件
    await context.storageState({
      path: 'tests/.auth/admin.json',
    });
    console.log('✅ Storage state saved to tests/.auth/admin.json');
  }

  await context.close();
});
