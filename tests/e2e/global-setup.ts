import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 登录获取认证 token
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.fill('input[name="email"]', process.env.TEST_EMAIL || 'admin@test.com');
  await page.fill('input[name="password"]', process.env.TEST_PASSWORD || 'password');
  await page.click('button[type="submit"]');

  // 等待登录完成
  await page.waitForURL('**/dashboard');

  // 保存认证状态
  await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });

  await browser.close();
}

export default globalSetup;
