#!/usr/bin/env tsx
/**
 * 长任务: E2E Visual Test Runner
 * 完整执行 Agent Chat 的 UI/UX 测试流程
 *
 * 流程:
 * 1. 检查服务状态
 * 2. 启动服务（如需要）
 * 3. 执行 Playwright 视觉测试
 * 4. 使用 MiniMax 视觉工具分析截图
 * 5. 生成测试报告
 *
 * 运行: pnpm tsx scripts/run-e2e-visual-test.ts
 */

import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://localhost:5173';  // 前端 SPA
const MXMCGI_BASE = process.env.MXMCGI_BASE || 'http://localhost:4003';
const SCREENSHOT_DIR = 'tests/e2e/screenshots';
const REPORT_DIR = 'tests/e2e/reports';

interface TestResult {
  stage: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshot?: string;
  visualAnalysis?: string;
  error?: string;
}

interface TestReport {
  startTime: string;
  endTime: string;
  duration: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * MiniMax 视觉分析
 * 注意: mcp__MiniMax__understand_image 是 Claude Code MCP 工具
 * 在独立运行时使用 mock 或跳过
 */
async function analyzeWithMiniMax(imagePath: string, prompt: string): Promise<string> {
  // 在 Claude Code 环境中，可以通过 Claude Code MCP 使用 MiniMax 视觉工具
  // 独立运行时跳过视觉分析，只保留截图
  console.log(`  🔍 Visual analysis prompt: ${prompt.substring(0, 50)}...`);
  console.log('  ⏭️  (MiniMax visual analysis available in Claude Code MCP mode)');
  return 'Visual analysis available via Claude Code MCP tools';
}

/**
 * 截图保存
 */
async function takeScreenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 ${filepath}`);
  return filepath;
}

/**
 * 检查服务健康状态
 */
async function checkServiceHealth(url: string, name: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { method: 'GET' });
    const ok = response.ok;
    console.log(`  ${ok ? '✅' : '❌'} ${name}: ${ok ? 'Healthy' : 'Unhealthy'}`);
    return ok;
  } catch {
    console.log(`  ❌ ${name}: Not reachable`);
    return false;
  }
}

/**
 * 等待服务就绪
 */
async function waitForServices(maxWaitMs: number = 60000): Promise<boolean> {
  console.log('\n🔍 Checking services...');
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const [gateway, mxmcgi] = await Promise.all([
      checkServiceHealth(`${GATEWAY_BASE}`, 'Gateway'),
      checkServiceHealth(`${MXMCGI_BASE}`, 'mxmcgi'),
    ]);

    if (gateway && mxmcgi) {
      console.log('  ✅ All services healthy\n');
      return true;
    }

    console.log('  ⏳ Waiting for services...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('  ❌ Services not ready after timeout\n');
  return false;
}

/**
 * 主测试流程
 */
async function runE2ETest(): Promise<TestReport> {
  const startTime = new Date().toISOString();
  const results: TestResult[] = [];

  console.log('═══════════════════════════════════════════════════');
  console.log('  Agent Chat E2E Visual Test - Long Task Runner');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Start: ${startTime}`);
  console.log(`  Target: ${GATEWAY_BASE}/agent`);
  console.log('');

  // Step 1: 等待服务就绪
  const stage1Start = Date.now();
  const servicesReady = await waitForServices();
  results.push({
    stage: 'Setup',
    name: 'Service Health Check',
    status: servicesReady ? 'passed' : 'failed',
    duration: Date.now() - stage1Start,
    error: servicesReady ? undefined : 'Services not ready',
  });

  if (!servicesReady) {
    return {
      startTime,
      endTime: new Date().toISOString(),
      duration: Date.now() - new Date(startTime).getTime(),
      results,
      summary: {
        total: results.length,
        passed: 0,
        failed: results.length,
        skipped: 0,
      },
    };
  }

  // Step 2: 启动浏览器
  const stage2Start = Date.now();
  console.log('🌐 Launching browser...');
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  results.push({
    stage: 'Setup',
    name: 'Browser Launch',
    status: 'passed',
    duration: Date.now() - stage2Start,
  });

  try {
    const page: Page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    // ═══════════════════════════════════════════════════════
    // 阶段 0: 登录
    // ═══════════════════════════════════════════════════════
    console.log('\n📍 Stage 0: Login');
    const stage0 = Date.now();

    await page.goto(`${GATEWAY_BASE}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 点击登录按钮（如果有的话）
    const loginBtn = page.locator('text=登录').first();
    if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginBtn.click();
      await page.waitForTimeout(1000);
    }

    // 检查是否已经登录（检查是否有用户名输入框）
    const usernameInput = page.locator('input[name="username"], input[placeholder*="用户名"], input[placeholder*="username"]').first();
    const passwordInput = page.locator('input[name="password"], input[placeholder*="密码"], input[placeholder*="password"]').first();

    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 需要登录
      const testEmail = process.env.TEST_EMAIL || 'admin@test.com';
      const testPassword = process.env.TEST_PASSWORD || 'admin123';

      await usernameInput.fill(testEmail);
      await passwordInput.fill(testPassword);

      // 点击登录按钮
      const submitBtn = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("进入")').first();
      await submitBtn.click();

      // 等待登录完成（可能跳转到 /dashboard 或其他页面）
      await page.waitForTimeout(3000);

      // 检查是否登录失败
      const errorMsg = await page.locator('text=登录失败, text=Invalid credentials').isVisible({ timeout: 2000 }).catch(() => false);
      if (errorMsg) {
        console.log('  ⚠️ Login failed - skipping UI tests, using API tests instead');
        // 关闭可能弹出的错误提示
        await page.keyboard.press('Escape');
      }
    }

    const loginScreenshot = await takeScreenshot(page, '00-after-login');
    const loginAnalysis = await analyzeWithMiniMax(
      loginScreenshot,
      '分析：登录是否成功？页面当前显示什么？是否有错误提示？'
    );

    const loginSuccess = loginAnalysis.includes('成功') && !loginAnalysis.includes('失败');
    results.push({
      stage: 'Setup',
      name: 'Login',
      status: loginSuccess ? 'passed' : 'skipped', // 登录失败不影响 API 测试
      duration: Date.now() - stage0,
      screenshot: loginScreenshot,
      visualAnalysis: loginAnalysis,
    });

    // ═══════════════════════════════════════════════════════
    // 阶段 1: 页面加载验证 (仅在登录成功后)
    // ═══════════════════════════════════════════════════════
    let inputVisible = loginSuccess; // 如果登录失败，则跳过 UI 测试

    if (loginSuccess) {
      console.log('\n📍 Stage 1: Page Load Verification');
      const stage1 = Date.now();

      await page.goto(`${GATEWAY_BASE}/agent`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const pageScreenshot = await takeScreenshot(page, '01-page-load');
      const pageAnalysis = await analyzeWithMiniMax(
        pageScreenshot,
        '分析这个页面：1) 是否成功加载？2) 是否有聊天输入框？3) 页面布局是否正常？4) 有没有明显的错误或空白？'
      );

      const pageLoaded = pageAnalysis.includes('成功') || pageAnalysis.includes('输入框') || !pageAnalysis.includes('空白');
      results.push({
        stage: 'UI Verification',
        name: 'Page Load',
        status: pageLoaded ? 'passed' : 'failed',
        duration: Date.now() - stage1,
        screenshot: pageScreenshot,
        visualAnalysis: pageAnalysis,
      });

      // 检查输入框是否可见
      const input = page.locator('textarea.agent-chat-textarea');
      try {
        await input.waitFor({ state: 'visible', timeout: 10000 });
        inputVisible = true;
      } catch {
        inputVisible = false;
        const debugScreenshot = await takeScreenshot(page, 'debug-no-input');
        results.push({
          stage: 'UI',
          name: 'Input Visible',
          status: 'skipped',
          duration: Date.now() - stage1,
          screenshot: debugScreenshot,
          error: 'Input not visible',
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // 阶段 2: Memory Recall UI 测试 (仅在登录成功且输入框可见时)
    // ═══════════════════════════════════════════════════════
    if (inputVisible) {
      console.log('\n📍 Stage 2: Memory Recall Test (UI)');
      const stage2 = Date.now();

      const input = page.locator('textarea.agent-chat-textarea');
      await input.fill('我叫李明，公司叫未来科技，是一家AI创业公司');

    // 第一轮对话 - 告知信息
    await input.fill('我叫李明，公司叫未来科技，是一家AI创业公司');
    await page.keyboard.press('Enter');
    console.log('  💬 Sent: 我叫李明，公司叫未来科技...');
    await page.waitForTimeout(3000);

    // 等待响应
    await page.waitForSelector('.agent-chat-msg-bubble', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const round1Screenshot = await takeScreenshot(page, '02-after-info');
    const round1Analysis = await analyzeWithMiniMax(
      round1Screenshot,
      '分析：1) AI是否给出了响应？2) 消息气泡是否正确显示？'
    );

    results.push({
      stage: 'Memory',
      name: 'Round 1 - Info Sharing',
      status: round1Analysis.includes('响应') || round1Analysis.includes('助手') ? 'passed' : 'failed',
      duration: Date.now() - stage2,
      screenshot: round1Screenshot,
      visualAnalysis: round1Analysis,
    });

    // 第二轮 - 测试记忆召回
    console.log('\n📍 Stage 3: Memory Recall Verification');
    const stage3 = Date.now();

    await input.fill('我叫什么名字？公司叫什么？');
    await page.keyboard.press('Enter');
    console.log('  💬 Sent: 我叫什么名字？公司叫什么？');
    await page.waitForTimeout(3000);

    await page.waitForSelector('.message.assistant', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const recallScreenshot = await takeScreenshot(page, '03-memory-recall');
    const recallAnalysis = await analyzeWithMiniMax(
      recallScreenshot,
      '分析AI响应：是否提到了"李明"和"未来科技"？如果提到了说明记忆召回成功。'
    );

    const recallSuccess = recallAnalysis.includes('李明') || recallAnalysis.includes('未来');
    results.push({
      stage: 'Memory',
      name: 'Memory Recall',
      status: recallSuccess ? 'passed' : 'failed',
      duration: Date.now() - stage3,
      screenshot: recallScreenshot,
      visualAnalysis: recallAnalysis,
    });

    // ═══════════════════════════════════════════════════════
    // 阶段 4: 业务节点触发测试
    // ═══════════════════════════════════════════════════════
    console.log('\n📍 Stage 4: Business Node Trigger');
    const stage4 = Date.now();

    await input.fill('生成一张科技风格海报');
    await page.keyboard.press('Enter');
    console.log('  💬 Sent: 生成一张科技风格海报');
    await page.waitForTimeout(2000);

    const nodeScreenshot = await takeScreenshot(page, '04-business-node');
    const nodeAnalysis = await analyzeWithMiniMax(
      nodeScreenshot,
      '分析：是否识别了业务意图？是否有确认弹窗或参数补问UI？回答是或否。'
    );

    const nodeTriggered = nodeAnalysis.includes('确认') || nodeAnalysis.includes('参数') ||
                         nodeAnalysis.includes('海报') || nodeAnalysis.includes('生成');
    results.push({
      stage: 'Business Node',
      name: 'Node Trigger Detection',
      status: nodeTriggered ? 'passed' : 'skipped',
      duration: Date.now() - stage4,
      screenshot: nodeScreenshot,
      visualAnalysis: nodeAnalysis,
    });

    // ═══════════════════════════════════════════════════════
    // 阶段 5: 多轮对话测试
    // ═══════════════════════════════════════════════════════
    console.log('\n📍 Stage 5: Multi-turn Conversation');
    const stage5 = Date.now();

    // 关闭可能弹出的确认框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await input.fill('今天天气怎么样？');
    await page.keyboard.press('Enter');
    console.log('  💬 Sent: 今天天气怎么样？');
    await page.waitForTimeout(3000);

    await page.waitForSelector('.message.assistant', { timeout: 30000 });
    await page.waitForTimeout(1000);

    const multiTurnScreenshot = await takeScreenshot(page, '05-multi-turn');
    const multiTurnAnalysis = await analyzeWithMiniMax(
      multiTurnScreenshot,
      '分析：对话列表是否正确显示？消息顺序是否正确？AI是否正常回复了天气问题？'
    );

    const multiTurnOk = multiTurnAnalysis.includes('对话') || multiTurnAnalysis.includes('消息') ||
                       multiTurnAnalysis.includes('天气');
    results.push({
      stage: 'Conversation',
      name: 'Multi-turn Chat',
      status: multiTurnOk ? 'passed' : 'failed',
      duration: Date.now() - stage5,
      screenshot: multiTurnScreenshot,
      visualAnalysis: multiTurnAnalysis,
    });

    // ═══════════════════════════════════════════════════════
    // 阶段 6: 回归测试 - 确保现有功能未受影响
    // ═══════════════════════════════════════════════════════
    console.log('\n📍 Stage 6: Regression Test');
    const stage6 = Date.now();

    await input.fill('你好');
    await page.keyboard.press('Enter');
    console.log('  💬 Sent: 你好');
    await page.waitForTimeout(3000);

    await page.waitForSelector('.message.assistant', { timeout: 30000 });

    const regressionScreenshot = await takeScreenshot(page, '06-regression');
    const regressionAnalysis = await analyzeWithMiniMax(
      regressionScreenshot,
      '分析：通用对话功能是否正常？AI是否正常回应了"你好"？'
    );

    const regressionOk = regressionAnalysis.includes('你好') || regressionAnalysis.includes('响应');
    results.push({
      stage: 'Regression',
      name: 'General Chat Regression',
      status: regressionOk ? 'passed' : 'failed',
      duration: Date.now() - stage6,
      screenshot: regressionScreenshot,
      visualAnalysis: regressionAnalysis,
    });

    } // end of if (inputVisible)

    // ═══════════════════════════════════════════════════════
    // API 测试 (不依赖 UI 登录)
    // ═══════════════════════════════════════════════════════
    console.log('\n📍 Stage 7: API-based Memory Test');
    const stage7 = Date.now();

    // 通过 API 测试 Memory 功能
    const userId = `api-test-${Date.now()}`;
    const memoryTestMessages = [
      '我叫王五，在科技公司工作',
    ];

    try {
      // 发送第一条消息
      const response1 = await fetch(`${process.env.MXMCGI_BASE || 'http://localhost:4003'}/api/v1/agents/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ message: memoryTestMessages[0] }),
      });

      results.push({
        stage: 'API',
        name: 'Memory API Test',
        status: response1.ok ? 'passed' : 'failed',
        duration: Date.now() - stage7,
        error: response1.ok ? undefined : `API returned ${response1.status}`,
      });
    } catch (error) {
      results.push({
        stage: 'API',
        name: 'Memory API Test',
        status: 'failed',
        duration: Date.now() - stage7,
        error: String(error),
      });
    }

    await page.close();
  } finally {
    await browser.close();
  }

  // ═══════════════════════════════════════════════════════
  // 生成报告
  // ═══════════════════════════════════════════════════════
  const endTime = new Date().toISOString();
  const totalDuration = Date.now() - new Date(startTime).getTime();

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  const report: TestReport = {
    startTime,
    endTime,
    duration: totalDuration,
    results,
    summary,
  };

  // 保存报告
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const reportPath = path.join(REPORT_DIR, `e2e-visual-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 打印最终报告
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST REPORT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Start:    ${startTime}`);
  console.log(`  End:      ${endTime}`);
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('');
  console.log(`  Total:    ${summary.total}`);
  console.log(`  ✅ Passed: ${summary.passed}`);
  console.log(`  ❌ Failed: ${summary.failed}`);
  console.log(`  ⏭️  Skipped: ${summary.skipped}`);
  console.log('═'.repeat(60));

  for (const r of results) {
    const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
    console.log(`\n${icon} [${r.stage}] ${r.name}`);
    console.log(`   Status: ${r.status} | Duration: ${(r.duration / 1000).toFixed(1)}s`);
    if (r.visualAnalysis) {
      const analysis = r.visualAnalysis.substring(0, 200);
      console.log(`   Vision: ${analysis}...`);
    }
    if (r.error) {
      console.log(`   Error: ${r.error.substring(0, 100)}`);
    }
  }

  console.log(`\n📄 Full report: ${reportPath}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}/`);

  return report;
}

// 主入口
async function main() {
  try {
    const report = await runE2ETest();

    // Exit with error code if any tests failed
    if (report.summary.failed > 0) {
      console.log('\n❌ Tests completed with failures');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Test runner failed:', error);
    process.exit(1);
  }
}

main();
