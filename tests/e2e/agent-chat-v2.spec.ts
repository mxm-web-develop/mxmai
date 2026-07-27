/**
 * Agent Chat v2 e2e（需本地 gateway + mxmcgi api/worker + 已登录环境变量）
 *
 * AGENT_E2E_TOKEN — JWT
 * GATEWAY_BASE — 默认 http://localhost:3000
 * FRONTEND_BASE — 默认 http://localhost:5173
 */
import { test, expect } from '@playwright/test';

const GATEWAY = process.env.GATEWAY_BASE || 'http://localhost:3000';
const FRONTEND = process.env.FRONTEND_BASE || 'http://localhost:5173';
const TOKEN = process.env.AGENT_E2E_TOKEN || '';

test.describe('Agent Chat v2 API', () => {
  test.skip(!TOKEN, '需要 AGENT_E2E_TOKEN');

  test('创建会话 → 发消息 → 收到 stream 事件', async () => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    };

    const createRes = await fetch(`${GATEWAY}/api/v2/agent/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'e2e-agent-v2' }),
    });
    expect(createRes.ok).toBe(true);
    const created = (await createRes.json()) as { data: { id: string } };
    const conversationId = created.data.id;
    expect(conversationId).toBeTruthy();

    const msgRes = await fetch(`${GATEWAY}/api/v2/agent/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '你好，请用一句话介绍你自己' }),
    });
    expect(msgRes.ok).toBe(true);
    const msgJson = (await msgRes.json()) as { data: { runId: string } };
    expect(msgJson.data.runId).toBeTruthy();

    const streamRes = await fetch(
      `${GATEWAY}/api/v2/agent/conversations/${conversationId}/stream?cursor=0`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    expect(streamRes.ok).toBe(true);
    expect(streamRes.headers.get('content-type') || '').toContain('text/event-stream');

    const reader = streamRes.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawTextOrComplete = false;
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      const { done, value } = await reader!.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (
        buffer.includes('"text_delta"') ||
        buffer.includes('"run_completed"') ||
        buffer.includes('"run_failed"')
      ) {
        sawTextOrComplete = true;
        break;
      }
    }
    expect(sawTextOrComplete).toBe(true);

    await fetch(`${GATEWAY}/api/v2/agent/conversations/${conversationId}`, {
      method: 'DELETE',
      headers,
    });
  });
});

test.describe('Agent Chat v2 UI', () => {
  test.skip(!TOKEN, '需要 AGENT_E2E_TOKEN');

  test('页面可打开并显示会话侧栏', async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('api_token', token as string);
      localStorage.setItem('api_base_url', '');
    }, TOKEN);

    await page.goto(`${FRONTEND}/`);
    // SPA page id 导航：尝试点击 Agent Chat 导航项
    const nav = page.getByText(/助手|Agent|对话/i).first();
    if (await nav.isVisible().catch(() => false)) {
      await nav.click();
    }
    await expect(page.locator('.agent-chat-page--v2, .agent-chat-page')).toBeVisible({ timeout: 15000 });
  });
});
