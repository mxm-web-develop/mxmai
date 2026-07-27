import { test, expect } from '@playwright/test';

test('debug taskKey selection step by step', async ({ page }) => {
  // Capture console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  // 1. Setup auth
  const timestamp = Date.now();
  const registerResponse = await fetch('http://localhost:4001/api/v1/account/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `debug_${timestamp}`,
      email: `debug_${timestamp}@example.com`,
      password: 'testpassword123',
    }),
  });
  const registerData = await registerResponse.json() as { data?: { tokens?: { accessToken?: string } } };
  const token = registerData?.data?.tokens?.accessToken;
  if (!token) throw new Error('No token');

  await page.goto('http://localhost:5173');
  await page.evaluate(([t]) => {
    localStorage.setItem('api_token', t);
    localStorage.setItem('user_id', 'test-user');
  }, [token]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 2. Navigate to Smartflow
  await page.locator('.nav-list button', { hasText: 'Smartflow' }).click();
  await page.waitForTimeout(500);

  // 3. Click 新建
  await page.locator('button.sf-action-btn', { hasText: '新 建' }).click();
  await page.waitForTimeout(800);

  // 4. Switch to canvas tab
  await page.locator('.ant-tabs-tab', { hasText: '画布' }).click();
  await page.waitForTimeout(500);

  // 5. Add business node
  await page.locator('button', { hasText: '+ 业务节点' }).click();
  await page.waitForTimeout(500);

  // 6. Click the business node to select it
  await page.locator('.sf-canvas-node').last().click();
  await page.waitForTimeout(1000);

  // Verify drawer is open
  const drawer = page.locator('.ant-drawer');
  await expect(drawer).toBeVisible();

  // 7. Select business_scope = writing
  console.log('=== Step 7: Select business_scope ===');
  const scopeSelect = page.locator('.ant-drawer .ant-select').first();
  await scopeSelect.click();
  await page.waitForTimeout(500);

  // Click "写作 (writing)"
  await page.locator('.ant-select-dropdown .ant-select-item', { hasText: '写作 (writing)' }).click();
  await page.waitForTimeout(800);

  // 8. Select taskKey using keyboard (like the original test does)
  console.log('=== Step 8: Select taskKey ===');
  const taskSelect = page.locator('.ant-drawer .ant-select').nth(1);
  await taskSelect.click();
  await page.waitForTimeout(1500);

  // Use keyboard navigation to select
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Click confirm button
  const confirmBtn = page.locator('.ant-drawer button', { hasText: '确认选择' });
  await confirmBtn.click();
  await page.waitForTimeout(2000);

  // 9. Check if params form appeared
  console.log('=== Step 9: Check params form ===');
  const paramsForm = page.locator('text=业务参数');
  const paramsVisible = await paramsForm.isVisible();
  console.log(`Params form visible: ${paramsVisible}`);

  // 10. Check canvas node display
  console.log('=== Step 10: Check canvas node ===');
  await page.screenshot({ path: `/tmp/debug-taskkey-${Date.now()}.png`, fullPage: true });
  const canvasNodeText = await page.locator('.sf-canvas-node').last().textContent();
  console.log(`Canvas node text: "${canvasNodeText}"`);

  // Print any console errors collected
  if (consoleErrors.length > 0) {
    console.log('=== Console Errors ===');
    consoleErrors.forEach(e => console.log(e));
  } else {
    console.log('No console errors detected');
  }

  expect(paramsVisible).toBe(true);
});
