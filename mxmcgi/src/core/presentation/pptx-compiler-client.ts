/**
 * PPTX 编译服务 HTTP 客户端（异步 job：提交 → 轮询 → 下载）。
 *
 * Env:
 * - PPTX_COMPILER_URL  默认 http://127.0.0.1:4010（同机）；设为空字符串则禁用 API、走 spawn
 * - PPTX_COMPILER_API_TOKEN  可选 Bearer
 * - PPTX_COMPILER_POLL_MS  默认 500
 * - PPTX_COMPILER_TIMEOUT_MS  默认 180000
 */
export type DeckCompilePayload = {
  title?: string;
  visual_system?: Record<string, unknown>;
  slides: unknown[];
  meta?: Record<string, unknown>;
};

export type CompileJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

function compilerBaseUrl(): string {
  const raw = process.env.PPTX_COMPILER_URL?.trim();
  // 同机部署默认本机 4010；显式设空字符串可强制走本地 spawn 兜底
  if (raw === '') return '';
  if (raw) return raw.replace(/\/$/, '');
  return 'http://127.0.0.1:4010';
}

function authHeaders(): Record<string, string> {
  const token = process.env.PPTX_COMPILER_API_TOKEN?.trim();
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function pollIntervalMs(): number {
  const n = Number(process.env.PPTX_COMPILER_POLL_MS ?? 500);
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 500;
}

function timeoutMs(): number {
  const n = Number(process.env.PPTX_COMPILER_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : 180_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isPptxCompilerApiConfigured(): boolean {
  // 空字符串 = 强制禁用 API，走 spawn；其它情况（含未设置）默认本机 4010
  return compilerBaseUrl() !== '';
}

export async function compileDeckViaApi(payload: DeckCompilePayload): Promise<Buffer> {
  const base = compilerBaseUrl();
  if (!base) {
    throw new Error('PPTX_COMPILER_URL 已禁用（空字符串）');
  }

  const createRes = await fetch(`${base}/v1/compile/jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: payload.title,
      visual_system: payload.visual_system ?? {},
      slides: payload.slides,
      meta: payload.meta ?? {},
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`pptx compile create ${createRes.status}: ${text.slice(0, 400)}`);
  }
  const created = (await createRes.json()) as {
    jobId?: string;
    pollUrl?: string;
    fileUrl?: string;
  };
  const jobId = String(created.jobId || '').trim();
  if (!jobId) throw new Error('pptx compile: missing jobId');

  const deadline = Date.now() + timeoutMs();
  const interval = pollIntervalMs();
  let lastStatus: CompileJobStatus | string = 'queued';

  while (Date.now() < deadline) {
    const stRes = await fetch(`${base}/v1/compile/jobs/${encodeURIComponent(jobId)}`, {
      headers: authHeaders(),
    });
    if (!stRes.ok) {
      const text = await stRes.text().catch(() => '');
      throw new Error(`pptx compile poll ${stRes.status}: ${text.slice(0, 400)}`);
    }
    const st = (await stRes.json()) as {
      status?: CompileJobStatus;
      error?: string | null;
      fileUrl?: string | null;
    };
    lastStatus = st.status || lastStatus;
    if (st.status === 'failed') {
      throw new Error(`pptx compile failed: ${st.error || 'unknown'}`);
    }
    if (st.status === 'succeeded') {
      const fileRes = await fetch(`${base}/v1/compile/jobs/${encodeURIComponent(jobId)}/file`, {
        headers: {
          ...authHeaders(),
          Accept:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation,application/octet-stream',
        },
      });
      if (!fileRes.ok) {
        const text = await fileRes.text().catch(() => '');
        throw new Error(`pptx compile download ${fileRes.status}: ${text.slice(0, 400)}`);
      }
      const ab = await fileRes.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length < 64) throw new Error('pptx compile: file too small');
      return buf;
    }
    await sleep(interval);
  }

  throw new Error(`pptx compile timeout after ${timeoutMs()}ms (last=${lastStatus}, jobId=${jobId})`);
}
