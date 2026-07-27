#!/usr/bin/env bash
# 生产/内网烟测：voiceover-science-pop 分镜脚本生成，并保存 JSON
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/artifacts/video-edit-smoke}"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
export OUT_FILE="$OUT_DIR/shot-list-${TS}.json"
export OUT_DIR
export MXM_TEST_USER_ID="${MXM_TEST_USER_ID:-8ee5db88-b157-4ce5-ab98-fcf7f2880f3b}"
export MXMCGI_INTERNAL_URL="${MXMCGI_INTERNAL_URL:-http://127.0.0.1:4003}"
export SMOKE_ROOT="${SMOKE_ROOT:-$ROOT}"

node --input-type=module <<'NODE'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.env.SMOKE_ROOT || process.cwd();
const USER_ID = process.env.MXM_TEST_USER_ID;
const BASE = (process.env.MXMCGI_INTERNAL_URL || 'http://127.0.0.1:4003').replace(/\/$/, '');
const OUT_FILE = process.env.OUT_FILE;
const POLL_MS = 4000;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 600_000);

async function api(path, init = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'x-user-id': USER_ID,
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path} HTTP ${resp.status} 非 JSON: ${text.slice(0, 300)}`); }
  if (!resp.ok) throw new Error(`${path} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 800)}`);
  return json;
}

function unwrap(body) {
  return body?.data && typeof body.data === 'object' ? body.data : body;
}

const sample = join(ROOT, 'mxmcgi/assets/minimax-voice-previews/v1/Chinese_Mandarin__Warm_Girl.mp3');
const buf = readFileSync(sample);
const form = new FormData();
form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'smoke-voiceover.mp3');
const upResp = await fetch(`${BASE}/upload/assets?storageMode=temp`, {
  method: 'POST',
  headers: { 'x-user-id': USER_ID },
  body: form,
});
const upJson = await upResp.json();
if (!upResp.ok) throw new Error(`upload failed: ${JSON.stringify(upJson).slice(0, 400)}`);
const audioUrl = String(unwrap(upJson).url || unwrap(upJson).proxyPath || '');
if (!audioUrl) throw new Error('upload 无 url');

const uid = `agent-shot-list-${Date.now()}`;
const runBody = {
  scope: 'video',
  taskKey: 'edit',
  subtype: 'voiceover-science-pop',
  params: {
    topic: '2026 人工智能发展趋势（Agent 分镜烟测）',
    voiceover_audio_url: audioUrl,
    audio_duration_seconds: 5,
    script:
      '2026 年，人工智能正在从聊天助手走向真正的生产力工具。大模型推理成本持续下降，多模态能力快速普及。本视频为自动剪辑分镜脚本烟测，用于验证 LLM 生成的切镜方案。',
    cut_rhythm: 'science-promo',
    edit_style: 'science-minimal',
    render_plan: ['gsap-html-animation', 'static-image', 'ai-video-gen'],
    aspectRatio: '16:9',
    uid,
    label: `Agent分镜烟测-${uid}`,
  },
};

console.log('[run] audioUrl=', audioUrl.slice(0, 100));
const runRaw = await api('/api/v2/tasks/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(runBody),
});
const taskId = String(runRaw.taskId || unwrap(runRaw).taskId || '');
if (!taskId) throw new Error(`无 taskId: ${JSON.stringify(runRaw).slice(0, 400)}`);
console.log('[run] taskId=', taskId);

const start = Date.now();
let done;
while (Date.now() - start < TIMEOUT_MS) {
  const raw = await api(`/api/v2/tasks/${taskId}`);
  const task = unwrap(raw);
  const status = String(task.status || '');
  const progress = task.progress || {};
  const err = progress.error || task.error;
  console.log(`[poll] ${taskId} status=${status} progress=${progress.progress ?? '?'}${err ? ` err=${String(err).slice(0, 120)}` : ''}`);
  if (status === 'awaiting_review' || status === 'completed') { done = task; break; }
  if (status === 'failed' || status === 'cancelled') {
    throw new Error(`Task ${status}: ${JSON.stringify(err || task).slice(0, 2000)}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
if (!done) throw new Error(`Timeout ${TIMEOUT_MS}ms`);

const meta = done.metadata || {};
const bps = meta.businessPipelineState || {};
const rp = done.requestParams || {};
const rpBps = rp.businessPipelineState || {};

function pickScript() {
  for (const [label, src] of [
    ['bps.videoEditScriptJson', bps],
    ['rpBps.videoEditScriptJson', rpBps],
    ['rp.videoEditScriptJson', rp],
    ['bps', bps],
    ['rpBps', rpBps],
  ]) {
    if (src.videoEditScriptJson) return { from: `${label}.videoEditScriptJson`, data: src.videoEditScriptJson };
    if (src.shotList) return { from: `${label}.shotList`, data: src.shotList };
  }
  const fa = bps.finalArtifact || rpBps.finalArtifact || bps.coreArtifact || rpBps.coreArtifact;
  if (fa?.text) {
    try { return { from: 'finalArtifact.text', data: JSON.parse(fa.text) }; } catch { return { from: 'finalArtifact.text', data: fa.text }; }
  }
  return null;
}

const picked = pickScript();
if (!picked) {
  const fallback = OUT_FILE.replace('.json', '-full-task.json');
  writeFileSync(fallback, JSON.stringify(done, null, 2), 'utf8');
  throw new Error(`未找到分镜 JSON，已保存完整 task 到 ${fallback}`);
}

const payload = {
  taskId,
  status: done.status,
  topic: runBody.params.topic,
  source: picked.from,
  generatedAt: new Date().toISOString(),
  manualReviewGate: meta.manualReviewGate || null,
  script: picked.data,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
console.log('[done] saved', OUT_FILE);
console.log('[done] source=', picked.from, 'status=', done.status);
NODE

echo "$OUT_FILE"
