/**
 * 开放 API 发布 — 集成测试（需本地 Gateway + mxmcgi + DB 迁移）
 *
 * 环境变量：
 *   OPEN_API_TEST_BASE_URL=http://localhost:3000
 *   OPEN_API_TEST_KEY=mxm_...
 *   OPEN_API_TEST_SLUG=writing-business-ad  （已发布的 slug）
 *
 * 运行：pnpm exec playwright test tests/integration/open-api-publish.test.ts
 * 或：npx playwright test tests/integration/open-api-publish.test.ts
 */
import { test, expect } from '@playwright/test';

const base = process.env.OPEN_API_TEST_BASE_URL || 'http://localhost:3000';
const apiKey = process.env.OPEN_API_TEST_KEY || '';
const slug = process.env.OPEN_API_TEST_SLUG || '';

test.describe('open api publish', () => {
  test.skip(!apiKey || !slug, '需要 OPEN_API_TEST_KEY 与 OPEN_API_TEST_SLUG');

  test('GET manifest requires auth and returns schema', async ({ request }) => {
    const res = await request.get(`${base}/api/v1/open/${slug}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.slug).toBe(slug);
    expect(body.data?.inputSchema).toBeTruthy();
  });

  test('POST run rejects invalid params', async ({ request }) => {
    const res = await request.post(`${base}/api/v1/open/${slug}/run`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: { params: { __invalid_field_xyz__: true } },
    });
    expect([400, 422]).toContain(res.status());
  });
});
