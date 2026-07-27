import { test, expect } from '@playwright/test';

const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5173';

/**
 * Smartflow 业务节点配置测试
 * 验证 business_scope + taskKey + subtype 选择后：
 * 1. 画布节点正确显示 taskKey
 * 2. 参数表单正确渲染
 */
test.describe('Smartflow Business Node Configuration', () => {
  // 在所有测试前创建认证 token
  test.beforeAll(async ({ request }) => {
    // 创建测试用户并获取 token
    const timestamp = Date.now();
    const username = `sf_test_${timestamp}`;
    const email = `sf_test_${timestamp}@example.com`;

    const registerResponse = await request.post('http://localhost:4001/api/v1/account/register', {
      data: {
        username,
        email,
        password: 'testpassword123',
      },
    });

    if (registerResponse.ok()) {
      const data = await registerResponse.json();
      const token = data?.data?.tokens?.accessToken;
      if (token) {
        // 存储到全局变量供测试使用
        process.env.TEST_AUTH_TOKEN = token;
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    // 设置 localStorage mock auth
    const token = process.env.TEST_AUTH_TOKEN;
    if (token) {
      await page.goto(FRONTEND_BASE);
      await page.evaluate(([t]) => {
        localStorage.setItem('api_token', t);
        localStorage.setItem('user_id', 'test-user');
      }, [token]);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should update node display when business_scope and taskKey are selected', async ({ page }) => {
    // 1. 点击侧边栏的 Smartflow 进入页面
    const smartflowNav = page.locator('.nav-list button', { hasText: 'Smartflow' });
    await smartflowNav.click();
    await page.waitForTimeout(500);

    // 2. 点击侧边栏的"新 建"按钮（注意中间有空格）
    const newBtn = page.locator('button.sf-action-btn', { hasText: '新 建' });
    await newBtn.click();
    await page.waitForTimeout(800);

    // 3. 切换到画布 Tab
    const canvasTab = page.locator('.ant-tabs-tab', { hasText: '画布' });
    if (await canvasTab.isVisible()) {
      await canvasTab.click();
      await page.waitForTimeout(500);
    }

    // 4. 点击工具栏的"+ 业务节点"按钮
    const addBusinessBtn = page.locator('button', { hasText: '+ 业务节点' });
    await addBusinessBtn.click();
    await page.waitForTimeout(500);

    // 5. 选择画布上的业务节点（点击节点打开属性面板）
    // 点击最后一个节点（应该是刚添加的业务节点）
    const businessNode = page.locator('.sf-canvas-node').last();
    await businessNode.click();
    await page.waitForTimeout(1000);

    // 截图查看当前状态
    await page.screenshot({ path: `tests/visual/smartflow-after-node-click-${Date.now()}.png` });

    // 6. 验证右侧 Drawer 打开
    const drawer = page.locator('.ant-drawer');
    const drawerVisible = await drawer.isVisible();
    console.log('Drawer visible:', drawerVisible);

    // 打印 drawer 内的内容帮助调试
    if (!drawerVisible) {
      const drawerCount = await page.locator('.ant-drawer').count();
      console.log('Drawer count on page:', drawerCount);
    }

    await expect(drawer).toBeVisible({ timeout: 5000 });

    // 7. 选择 business_scope = writing（写作）- 在 drawer 内查找
    const scopeSelect = page.locator('.ant-drawer .ant-select').first();
    await expect(scopeSelect).toBeVisible();
    await scopeSelect.click();
    await page.waitForTimeout(500);

    // 列出所有下拉选项
    const dropdownItems = page.locator('.ant-select-dropdown .ant-select-item');
    const itemCount = await dropdownItems.count();
    console.log(`Dropdown items count: ${itemCount}`);
    for (let i = 0; i < itemCount; i++) {
      const text = await dropdownItems.nth(i).textContent();
      console.log(`  Item ${i}: "${text}"`);
    }

    await page.locator('.ant-select-dropdown .ant-select-item', { hasText: '写作 (writing)' }).click();
    await page.waitForTimeout(800);

    // 8. 验证 taskKey 下拉出现并选择 - 在 drawer 内查找
    const taskKeySelect = page.locator('.ant-drawer .ant-select').nth(1);
    await expect(taskKeySelect).toBeVisible();
    await taskKeySelect.click();
    await page.waitForTimeout(1500);

    // 使用键盘选择第二个选项（先按 Down 键，再按 Enter）
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);

    // 9. 新交互：选择即生效，参数表单应出现
    const paramsForm = page.locator('text=业务参数');
    await expect(paramsForm).toBeVisible({ timeout: 5000 });

    // 10. 画布节点应不再显示“未选择业务”
    await expect(businessNode).not.toContainText('未选择业务');

    // 10. 截图保存
    await page.screenshot({ path: `tests/visual/smartflow-business-node-${Date.now()}.png` });
  });

  test('should render params form after selecting taskKey', async ({ page }) => {
    // 进入 Smartflow 页面
    const smartflowNav = page.locator('.nav-list button', { hasText: 'Smartflow' });
    await smartflowNav.click();
    await page.waitForTimeout(500);

    // 点击"新 建"按钮（注意中间有空格）
    const newBtn = page.locator('button.sf-action-btn', { hasText: '新 建' });
    await newBtn.click();
    await page.waitForTimeout(800);

    // 切换到画布 Tab
    const canvasTab = page.locator('.ant-tabs-tab', { hasText: '画布' });
    if (await canvasTab.isVisible()) {
      await canvasTab.click();
      await page.waitForTimeout(500);
    }

    // 添加业务节点
    const addBusinessBtn = page.locator('button', { hasText: '+ 业务节点' });
    await addBusinessBtn.click();
    await page.waitForTimeout(500);

    // 选择业务节点打开属性面板（点击最后一个节点）
    const businessNode = page.locator('.sf-canvas-node').last();
    await businessNode.click();
    await page.waitForTimeout(1000);

    // 等待 Drawer 出现
    const drawer = page.locator('.ant-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // 选择 business_scope = writing - 在 drawer 内查找
    const scopeSelect = page.locator('.ant-drawer .ant-select').first();
    await scopeSelect.click();
    await page.waitForTimeout(300);
    await page.locator('.ant-select-dropdown .ant-select-item', { hasText: '写作 (writing)' }).click();
    await page.waitForTimeout(1000);

    // 选择 taskKey - 在 drawer 内查找
    const taskSelect = page.locator('.ant-drawer .ant-select').nth(1);
    await taskSelect.click();
    await page.waitForTimeout(1500);

    // 使用键盘选择第二个选项（先按 Down 键，再按 Enter）
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);

    // 检查参数表单是否出现
    const hasParamsForm = await page.locator('text=业务参数').isVisible();
    console.log('Params form visible:', hasParamsForm);
    expect(hasParamsForm).toBe(true);

    // 截图
    await page.screenshot({ path: `tests/visual/smartflow-params-${Date.now()}.png` });
  });
});

/**
 * 后端 API 测试 - 验证 form-config 接口
 */
test.describe('Smartflow Business Node Backend API', () => {
  test('should return correct form-config for writing/academy/wenxian', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/v2/tasks/form-config?scope=writing&taskKey=academy&subtype=wenxian');
    expect(response.ok()).toBe(true);

    const data = await response.json() as { success: boolean; data: { schema: { properties: Record<string, unknown> } } };
    expect(data.success).toBe(true);
    expect(data.data.schema.properties).toBeDefined();

    const props = Object.keys(data.data.schema.properties);
    console.log('writing/academy/wenxian properties:', props);

    // 应该包含这些字段
    expect(props).toContain('prompt');
    expect(props).toContain('topic');
  });

  test('should return task list for writing scope', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/v2/tasks/form-config/list?scope=writing');
    expect(response.ok()).toBe(true);

    const data = await response.json() as { success: boolean; data: { items: Array<{ taskKey: string; subtype: string }> } };
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.items)).toBe(true);
    expect(data.data.items.length).toBeGreaterThan(0);

    console.log('writing task options:', data.data.items);
  });
});

test.describe('Smartflow Composite Nodes UI', () => {
  test.beforeEach(async ({ page }) => {
    const token = process.env.TEST_AUTH_TOKEN;
    if (token) {
      await page.goto(FRONTEND_BASE);
      await page.evaluate(([t]) => {
        localStorage.setItem('api_token', t);
        localStorage.setItem('user_id', 'test-user');
      }, [token]);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  });

  async function openCanvas(page: import('@playwright/test').Page) {
    const smartflowNav = page.locator('.nav-list button', { hasText: 'Smartflow' });
    await smartflowNav.click();
    await page.waitForTimeout(400);
    const newBtn = page.locator('button.sf-action-btn', { hasText: '新 建' });
    await newBtn.click();
    await page.waitForTimeout(600);
    const canvasTab = page.locator('.ant-tabs-tab', { hasText: '画布' });
    if (await canvasTab.isVisible()) {
      await canvasTab.click();
      await page.waitForTimeout(400);
    }
  }

  test('left palette adds reflection composite node', async ({ page }) => {
    await openCanvas(page);
    const paletteBtn = page.locator('.sf-palette-item', { hasText: '反思环' });
    await expect(paletteBtn).toBeVisible({ timeout: 8000 });
    await paletteBtn.click();
    await page.waitForTimeout(400);
    const node = page.locator('.sf-canvas-node--reflection');
    await expect(node).toBeVisible();
  });

  test('pane context menu opens quick-add panel', async ({ page }) => {
    await openCanvas(page);
    const pane = page.locator('.react-flow__pane');
    await pane.click({ button: 'right', position: { x: 200, y: 200 } });
    await page.waitForTimeout(300);
    const panel = page.locator('.sf-quick-add-panel');
    await expect(panel).toBeVisible();
    const planItem = panel.locator('.sf-quick-add-item', { hasText: '计划执行' });
    await planItem.click();
    await page.waitForTimeout(400);
    await expect(page.locator('.sf-canvas-node--plan_execute')).toBeVisible();
  });
});