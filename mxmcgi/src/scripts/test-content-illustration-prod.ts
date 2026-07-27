/**
 * 端到端测试 graph/design/content-illustration（内容配图）
 * 用法（生产服务器）：
 *   cd /opt/supermxmai/mxmcgi && node ../node_modules/tsx/dist/cli.mjs src/scripts/test-content-illustration-prod.ts
 *
 * 本地（需 GATEWAY + worker）：
 *   MXM_BASE_URL=http://localhost:3000 MXM_TEST_TOKEN=your-admin-test-token-here \
 *     pnpm --filter @mxmai/mxmcgi exec tsx src/scripts/test-content-illustration-prod.ts
 */
import { loadMonorepoEnv } from '@mxmai/mxmdata';

loadMonorepoEnv({ service: 'mxmcgi' });

const BASE = (process.env.MXM_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = process.env.MXM_TEST_TOKEN || process.env.ADMIN_TOKEN || 'your-admin-test-token-here';
const POLL_MS = 3000;
const TIMEOUT_MS = 180_000;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(`${path} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }
  return json as T;
}

function unwrap<T>(body: Record<string, unknown>): T {
  if (body.data && typeof body.data === 'object') return body.data as T;
  return body as T;
}

async function pollTask(taskId: string) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const raw = await api<Record<string, unknown>>(`/api/v2/tasks/${taskId}`);
    const task = unwrap<Record<string, unknown>>(raw);
    const status = String(task.status ?? '');
    const progress = task.progress as Record<string, unknown> | undefined;
    console.log(`[poll] ${taskId} status=${status} progress=${progress?.progress ?? '?'}`);
    if (status === 'completed') return task;
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`Task ${status}: ${JSON.stringify(task.error ?? task.result ?? task).slice(0, 1200)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout after ${TIMEOUT_MS}ms`);
}

async function main() {
  console.log('BASE:', BASE);
  const health = await api<Record<string, unknown>>('/health');
  console.log('health:', JSON.stringify(health));

  const runBody = {
    scope: 'graph',
    taskKey: 'design',
    subtype: 'content-illustration',
    params: {
      core_content: '远程团队协作的三步流程：沟通、同步、交付',
      usage_context: 'web_content',
      aspect_ratio: '16:9',
      illustration_style: 'realistic_illustration',
      flat_visual_tone: 'realistic_illustration',
      prompt: '简洁扁平插画，适合博客头图',
    },
  };

  console.log('\n--- POST /api/v2/tasks/run ---');
  const runRaw = await api<Record<string, unknown>>('/api/v2/tasks/run', {
    method: 'POST',
    body: JSON.stringify(runBody),
  });
  const run = unwrap<Record<string, unknown>>(runRaw);
  const taskId = String(run.taskId ?? '');
  if (!taskId) throw new Error(`No taskId: ${JSON.stringify(runRaw).slice(0, 500)}`);
  console.log('taskId:', taskId);

  const done = await pollTask(taskId);
  const result = done.result as Record<string, unknown> | undefined;
  const mediaUrls = result?.mediaUrls as string[] | undefined;
  console.log('\n=== RESULT ===');
  console.log('status: completed');
  console.log('mediaUrls:', mediaUrls?.slice(0, 3));
  console.log('metadata keys:', result?.metadata ? Object.keys(result.metadata as object) : []);
  if (!mediaUrls?.length) {
    console.log('full result:', JSON.stringify(result, null, 2).slice(0, 2000));
    process.exit(1);
  }
  console.log('\n✅ 内容配图生成成功');
}

main().catch((e) => {
  console.error('\n❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
