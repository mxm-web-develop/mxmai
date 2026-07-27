/**
 * 科普口播剪辑（voiceover-science-pop）生产烟测
 * 验证：ffprobe → FunASR ASR → nestedText → awaiting_review
 *
 * HTTP 模式（需个人访问凭证或有效 JWT）：
 *   MXM_BASE_URL=http://127.0.0.1:3000 MXM_TEST_TOKEN=... tsx src/scripts/test-voiceover-science-pop-prod.ts
 *
 * 内网直连 Task 引擎（主服务器推荐）：
 *   MXM_TEST_USER_ID=<uuid> tsx src/scripts/test-voiceover-science-pop-prod.ts --internal
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMonorepoEnv } from '@mxmai/mxmdata';

loadMonorepoEnv({ service: 'mxmcgi' });

const INTERNAL = process.argv.includes('--internal');
const BASE = (process.env.MXM_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = process.env.MXM_TEST_TOKEN || process.env.ADMIN_TOKEN || '';
const TEST_USER_ID = process.env.MXM_TEST_USER_ID || process.argv.find((a) => a.startsWith('--user='))?.slice(7) || '';
const POLL_MS = 4000;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 600_000;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!TOKEN) throw new Error('缺少 MXM_TEST_TOKEN 或 ADMIN_TOKEN');
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await resp.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${path} HTTP ${resp.status} 非 JSON: ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    throw new Error(`${path} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }
  return json as T;
}

function unwrap<T>(body: Record<string, unknown>): T {
  if (body.data && typeof body.data === 'object') return body.data as T;
  return body as T;
}

async function uploadSampleMp3Http(): Promise<string> {
  const sample = join(
    process.cwd(),
    'assets/minimax/voice-previews/Chinese_Mandarin__Warm_Girl.mp3'
  );
  const buf = readFileSync(sample);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'smoke-voiceover.mp3');
  const resp = await fetch(`${BASE}/api/v1/cgi/upload/assets?storageMode=temp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const json = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(`upload HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const data = unwrap<Record<string, unknown>>(json);
  const url = String(data.url || data.proxyPath || '');
  if (!url) throw new Error(`upload 无 url: ${JSON.stringify(json).slice(0, 400)}`);
  return url;
}

async function uploadSampleMp3Internal(userId: string): Promise<string> {
  const sample = join(
    process.cwd(),
    'assets/minimax/voice-previews/Chinese_Mandarin__Warm_Girl.mp3'
  );
  const buf = readFileSync(sample);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'smoke-voiceover.mp3');
  const mxmcgiBase = (process.env.MXMCGI_INTERNAL_URL || 'http://127.0.0.1:4003').replace(/\/$/, '');
  const resp = await fetch(`${mxmcgiBase}/upload/assets?storageMode=temp`, {
    method: 'POST',
    headers: { 'x-user-id': userId },
    body: form,
  });
  const json = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(`upload HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const data = unwrap<Record<string, unknown>>(json);
  const url = String(data.url || data.proxyPath || '');
  if (!url) throw new Error(`upload 无 url: ${JSON.stringify(json).slice(0, 400)}`);
  return url;
}

async function uploadSampleMp3(userId?: string): Promise<string> {
  if (INTERNAL) {
    if (!userId) throw new Error('--internal 模式需要 MXM_TEST_USER_ID');
    return uploadSampleMp3Internal(userId);
  }
  return uploadSampleMp3Http();
}

async function pollTaskInternal(taskId: string, userId: string) {
  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  RepositoryFactory.init();
  const repo = RepositoryFactory.createCGITaskRepository();
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const task = await repo.findById(taskId, true);
    if (!task) throw new Error(`task not found: ${taskId}`);
    const status = String(task.status ?? '');
    const progress = task.progress as Record<string, unknown> | undefined;
    const err = progress?.error ?? (task as { error?: unknown }).error;
    console.log(
      `[poll] ${taskId} status=${status} progress=${progress?.progress ?? '?'}${err ? ` err=${String(err).slice(0, 120)}` : ''}`
    );
    if (status === 'awaiting_review' || status === 'completed') return task;
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`Task ${status}: ${JSON.stringify(err ?? task).slice(0, 1500)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout after ${TIMEOUT_MS}ms`);
}

async function pollTask(taskId: string, userId?: string) {
  if (INTERNAL) return pollTaskInternal(taskId, userId!);
  return pollTaskHttp(taskId);
}

async function pollTaskHttp(taskId: string) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const raw = await api<Record<string, unknown>>(`/api/v2/tasks/${taskId}`);
    const task = unwrap<Record<string, unknown>>(raw);
    const status = String(task.status ?? '');
    const progress = task.progress as Record<string, unknown> | undefined;
    const err = progress?.error ?? task.error;
    console.log(
      `[poll] ${taskId} status=${status} progress=${progress?.progress ?? '?'}${err ? ` err=${String(err).slice(0, 120)}` : ''}`
    );
    if (status === 'awaiting_review') return task;
    if (status === 'completed') return task;
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`Task ${status}: ${JSON.stringify(err ?? task).slice(0, 1500)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout after ${TIMEOUT_MS}ms`);
}

async function main() {
  const userId = TEST_USER_ID;
  if (INTERNAL && !userId) {
    throw new Error('内网模式请设置 MXM_TEST_USER_ID 或 --user=<uuid>');
  }

  console.log('mode:', INTERNAL ? 'internal' : 'http', 'userId:', userId || '(from token)');
  if (!INTERNAL) {
    console.log('BASE:', BASE);
    const health = await api<Record<string, unknown>>('/health');
    console.log('health:', JSON.stringify(health));
  }

  console.log('\n--- upload sample mp3 ---');
  const audioUrl = await uploadSampleMp3(userId);
  console.log('audioUrl:', audioUrl);

  const uid = `smoke-vo-${Date.now()}`;
  const runBody = {
    scope: 'video' as const,
    taskKey: 'edit',
    subtype: 'voiceover-science-pop',
    params: {
      topic: '黑巧克力与心血管健康（生产烟测）',
      voiceover_audio_url: audioUrl,
      edit_style: 'science-minimal',
      render_plan: ['gsap-html-animation'],
      aspectRatio: '16:9',
      uid,
      label: '科普口播烟测',
      // 无 Deer 额度时跳过 ASR，仍验证 ffprobe → nestedText → awaiting_review
      ...(process.env.SMOKE_SKIP_ASR === '1'
        ? {
            script:
              '黑巧克力富含可可多酚，适量摄入可能有助于心血管健康。本视频为生产环境烟测口播稿，用于验证分镜生成与审核闸门。',
          }
        : {}),
    },
  };

  let taskId: string;
  if (INTERNAL) {
    const mxmcgiBase = (process.env.MXMCGI_INTERNAL_URL || 'http://127.0.0.1:4003').replace(/\/$/, '');
    console.log('\n--- POST /api/v2/tasks/run (mxmcgi internal) ---');
    const resp = await fetch(`${mxmcgiBase}/api/v2/tasks/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(runBody),
    });
    const runRaw = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      throw new Error(`run HTTP ${resp.status}: ${JSON.stringify(runRaw).slice(0, 800)}`);
    }
    taskId = String(runRaw.taskId ?? '');
  } else {
    console.log('\n--- POST /api/v2/tasks/run ---');
    const runRaw = await api<Record<string, unknown>>('/api/v2/tasks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runBody),
    });
    const run = unwrap<Record<string, unknown>>(runRaw);
    taskId = String(run.taskId ?? '');
  }
  if (!taskId) throw new Error('No taskId');
  console.log('taskId:', taskId);

  const done = await pollTask(taskId, userId);
  const meta = done.metadata as Record<string, unknown> | undefined;
  const bps = meta?.businessPipelineState as Record<string, unknown> | undefined;
  console.log('\n=== RESULT ===');
  console.log('status:', done.status);
  console.log('nestedTextLast:', bps?.nestedTextLast ? 'present' : 'missing');
  console.log('manualReviewGate:', meta?.manualReviewGate ? 'present' : 'missing');
  if (done.status !== 'awaiting_review' && done.status !== 'completed') {
    process.exit(1);
  }
  console.log('\n✅ 科普口播前置管线烟测通过（到达审核/完成）');
}

main().catch((e) => {
  console.error('\n❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
