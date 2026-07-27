# 前端测试方案：Playwright + Claude Code + MiniMax 视觉 MCP

## 概述

本方案针对 React SPA 架构，结合 Playwright 自动化测试、Claude Code 智能分析、MiniMax 视觉 MCP 实现端到端测试 + 视觉回归检测。

## 核心挑战与解决方案

### SPA 认证难点

| 问题 | 原因 | 解决思路 |
|------|------|---------|
| localStorage 存储 token | AuthContext 初始化时读取 | 使用 Playwright storageState() 预填充 |
| 401 错误触发 logout() | 清除 localStorage | 测试前禁用 401 监听或 mock 响应 |
| 路由守卫跳转 | 未登录时重定向到 /login | 直接导航到目标页面绕过守卫 |

## 方案一：Playwright + MiniMax 视觉 MCP（推荐）

### 核心思路

1. **Playwright** 负责页面操作、元素交互、网络拦截
2. **MiniMax 视觉 MCP** (`mcp__MiniMax__understand_image`) 分析截图，检测 UI 异常
3. **Claude Code** 生成测试代码、分析失败原因

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Playwright Test Runner                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ auth.setup │  │  page actions │  │  screenshot capture │ │
│  │ (storageState) │  │  (click/nav) │  │  (page.screenshot) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│              MiniMax Vision MCP (视觉分析)                   │
│         mcp__MiniMax__understand_image(prompt, image)       │
├─────────────────────────────────────────────────────────────┤
│                    Claude Code (AI 分析)                     │
│            分析测试失败原因、生成修复建议、视觉diff            │
└─────────────────────────────────────────────────────────────┘
```

### 目录结构

```
tests/
├── e2e/
│   ├── auth.setup.ts          # 认证 fixture
│   ├── visual-regression.spec.ts  # 视觉回归测试
│   ├── agent-chat.spec.ts      # 已有 - Agent Chat 测试
│   └── smartflow.spec.ts       # Smartflow E2E
├── visual/
│   ├── baseline/               # 基准截图
│   └── diff/                  # 差异截图
└── utils/
    ├── vision.ts              # MiniMax 视觉分析封装
    └── ai-analyzer.ts        # Claude 分析封装
```

### 1. 认证 Fixture (auth.setup.ts)

```typescript
import { test as setup, expect } from '@playwright/test';
import { FRONTEND_BASE } from '../config';

setup('authenticate', async ({ page }) => {
  // 直接访问 API 获取 token（绕过登录 UI）
  const response = await fetch('http://localhost:4001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL || 'test@example.com',
      password: process.env.TEST_PASSWORD || 'testpassword',
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`);
  }

  const { data } = await response.json();
  const token = data.token;

  // 设置 localStorage（模拟 AuthContext 初始化）
  await page.goto(FRONTEND_BASE);
  await page.evaluate(([t]) => {
    localStorage.setItem('api_token', t);
    localStorage.setItem('user_id', 'test-user-id');
  }, [token]);

  // 访问目标页面确认认证生效
  await page.goto(`${FRONTEND_BASE}/agent-chat`);
  await page.waitForTimeout(1000);
});
```

### 2. 视觉回归测试 (visual-regression.spec.ts)

```typescript
import { test, expect } from '@playwright/test';
import { mcp__MiniMax__understand_image } from '@anthropic-ai/claude-code';

const FRONTEND_BASE = process.env.FRONTEND_BASE || 'http://localhost:5173';

test.describe('视觉回归测试', () => {

  test('Agent Chat 页面截图分析', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/agent-chat`);
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({
      fullPage: true,
      path: `tests/visual/baseline/agent-chat-${Date.now()}.png`
    });

    // MiniMax 视觉分析
    const analysis = await mcp__MiniMax__understand_image({
      prompt: `分析这个 Agent Chat 页面截图，检测：
1. 是否有明显的 UI 异常（布局错乱、元素缺失）
2. 侧边栏是否正常显示
3. 聊天区域是否可见
4. 是否有错误提示或空白状态
5. 整体视觉质量评分 1-10`,
      image_source: screenshot,
    });

    console.log('视觉分析结果:', analysis);

    // 断言：检测无严重异常
    const hasSevereIssues = analysis.toLowerCase().includes('严重') ||
                            analysis.toLowerCase().includes('错误') ||
                            analysis.toLowerCase().includes('缺失');
    expect(hasSevereIssues).toBe(false);
  });

  test('Smartflow 页面截图分析', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/smartflow`);
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({
      fullPage: true,
      path: `tests/visual/baseline/smartflow-${Date.now()}.png`
    });

    const analysis = await mcp__MiniMax__understand_image({
      prompt: `分析 Smartflow 页面，检测工作流列表、创建按钮是否正常显示`,
      image_source: screenshot,
    });

    expect(analysis).not.toContain('错误');
  });
});
```

### 3. 元素交互 + 视觉验证

```typescript
test('发送消息后聊天区域更新', async ({ page }) => {
  await page.goto(`${FRONTEND_BASE}/agent-chat`);
  await page.waitForLoadState('networkidle');

  // 操作前截图
  const beforeScreenshot = await page.screenshot({
    path: `tests/visual/before-chat-${Date.now()}.png`
  });

  // 输入消息
  const input = page.locator('textarea[placeholder*="输入"]').first();
  await input.fill('你好');
  await input.press('Enter');

  // 等待响应（最多 10 秒）
  await page.waitForTimeout(5000);

  // 操作后截图
  const afterScreenshot = await page.screenshot({
    fullPage: true,
    path: `tests/visual/after-chat-${Date.now()}.png`
  });

  // 视觉对比分析
  const beforeAnalysis = await mcp__MiniMax__understand_image({
    prompt: '描述这个聊天界面的状态',
    image_source: beforeScreenshot,
  });

  const afterAnalysis = await mcp__MiniMax__understand_image({
    prompt: '分析聊天区域是否显示了助手回复消息',
    image_source: afterScreenshot,
  });

  // 验证响应出现
  const responseAppeared = !afterAnalysis.toLowerCase().includes('没有回复');
  expect(responseAppeared).toBe(true);
});
```

## 方案二：AI 驱动的测试失败分析

当测试失败时，利用 Claude Code + MiniMax 视觉 MCP 进行根因分析。

### 测试失败自动分析 (utils/ai-analyzer.ts)

```typescript
import { mcp__MiniMax__understand_image } from '@anthropic-ai/claude-code';
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface TestFailureContext {
  testName: string;
  errorMessage: string;
  screenshotPath?: string;
  consoleLogs?: string[];
  networkLogs?: string[];
}

export async function analyzeTestFailure(context: TestFailureContext): Promise<string> {
  let analysis = `测试失败分析\n`;
  analysis += `测试名称: ${context.testName}\n`;
  analysis += `错误信息: ${context.errorMessage}\n\n`;

  // 1. 截图视觉分析
  if (context.screenshotPath) {
    const fs = await import('fs');
    const screenshot = fs.readFileSync(context.screenshotPath);

    const visualAnalysis = await mcp__MiniMax__understand_image({
      prompt: `这是一个 Playwright 测试失败时的截图。分析：
1. 页面上显示了什么？
2. 是否有错误提示？
3. UI 元素是否正常渲染？
4. 可能导致测试失败的原因？`,
      image_source: `data:image/png;base64,${screenshot.toString('base64')}`,
    });

    analysis += `【视觉分析】\n${visualAnalysis}\n\n`;
  }

  // 2. 控制台日志分析
  if (context.consoleLogs?.length) {
    analysis += `【控制台错误】\n`;
    analysis += context.consoleLogs.slice(-20).join('\n');
    analysis += `\n\n`;
  }

  // 3. Claude Code 综合诊断
  const diagnosis = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `作为高级测试工程师，分析以下测试失败：

${analysis}

基于以上信息：
1. 给出最可能的失败根因
2. 提供修复建议
3. 提出预防措施`,
    }],
  });

  return diagnosis.content[0].type === 'text' ? diagnosis.content[0].text : '';
}
```

## 方案三：Playwright + 视觉 Diff（无 MCP）

使用 Playwright 内置截图对比 + AI 分析差异。

```typescript
import { test, expect } from '@playwright/test';

test('视觉 diff 检测', async ({ page }) => {
  const baselinePath = 'tests/visual/baseline/dashboard.png';
  const currentPath = 'tests/visual/current/dashboard.png';

  await page.goto('http://localhost:5173/dashboard');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: currentPath });

  // 使用 page.matchLeg() 进行像素对比
  const diff = await page.locator('body').screenshot({
    animations: 'disabled',
  });

  // 或使用 Playwright 的 toMatchSnapshot
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixels: 100,
  });
});
```

## 完整测试流程

```
┌────────────────────────────────────────────────────────────────┐
│                        测试执行流程                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. auth.setup.ts                                              │
│     └─> 调用登录 API 获取 token                                  │
│     └─> 写入 localStorage                                       │
│     └─> storageState 保存到 .auth/admin.json                    │
│                                                                 │
│  2. 运行测试（使用 @playwright/test --project=chromium）         │
│     └─> 测试使用 authenticated state                            │
│     └─> 截图保存到 tests/visual/current/                       │
│                                                                 │
│  3. 视觉分析                                                    │
│     └─> MiniMax Vision MCP 分析截图                             │
│     └─> Claude Code 生成测试报告                                 │
│                                                                 │
│  4. 失败诊断                                                    │
│     └─> 调用 ai-analyzer.ts 进行根因分析                        │
│     └─> 输出修复建议                                             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## 运行命令

```bash
# 安装依赖
pnpm add -D @playwright/test @anthropic-ai/claude-code

# 运行所有测试（包含视觉测试）
pnpm playwright test

# 仅运行视觉回归测试
pnpm playwright test tests/e2e/visual-regression.spec.ts

# 生成测试报告
pnpm playwright test --reporter=html
```

## 测试覆盖矩阵

| 页面/功能 | 交互测试 | 视觉测试 | 视觉 MCP 分析 | 备注 |
|-----------|----------|----------|---------------|------|
| Agent Chat 发送消息 | ✅ | ✅ | ✅ | 验证消息发送和响应 |
| Agent Chat 侧边栏 | ✅ | ✅ | ✅ | 验证导航正常 |
| Smartflow 列表 | ✅ | ✅ | ✅ | 验证工作流显示 |
| Smartflow 创建 | ✅ | ✅ | ✅ | 验证创建流程 |
| Smartflow 执行 | ✅ | ✅ | ✅ | 验证节点执行 |
| Dashboard | ✅ | ✅ | ✅ | 验证整体布局 |
| 登录/登出 | ✅ | ✅ | - | 验证认证流程 |

## 优势

1. **MiniMax 视觉 MCP**：无需 GPU，直接调用 API 分析截图，检测 UI 异常
2. **Claude Code**：测试失败时自动诊断，生成修复建议
3. **storageState()**：解决 SPA 认证难题，无需 UI 模拟登录
4. **视觉回归**：检测布局错乱、元素缺失等人工难以发现的问题
5. **CI/CD 集成**：可集成到 GitHub Actions，每次 PR 自动运行
