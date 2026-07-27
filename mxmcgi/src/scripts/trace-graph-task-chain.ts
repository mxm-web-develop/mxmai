import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { resolveGraphModel } from '../core/graph/graph-model-routing';
import {
  buildReferenceImagePrompt,
  convertLegacyReferenceImage,
  extractBase64FromDataUri,
  isBase64,
  isUrl,
  processReferenceImages,
  type ReferenceImage,
} from '../core/graph/reference-image';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function detectLang(userPrompt: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(userPrompt) ? 'zh' : 'en';
}

async function checkUrlReachable(url: string): Promise<{ ok: boolean; status?: number; contentType?: string; error?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return { ok: resp.ok, status: resp.status, contentType: resp.headers.get('content-type') || undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function normalizeGraphParams(requestParams: any) {
  const inner = requestParams?.params || {};
  const merged: any = { ...inner, ...requestParams };
  delete merged.taskType;
  delete merged.graphType;
  delete merged.userId;
  delete merged.provider;
  if (merged.type === undefined || merged.type === null || merged.type === 'undefined' || merged.type === '') merged.type = null;
  return merged;
}

function normalizeReferenceImages(raw: any): ReferenceImage[] {
  if (!raw) return [];
  if (typeof raw === 'string') return convertLegacyReferenceImage(raw);
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (typeof raw[0] === 'string') return convertLegacyReferenceImage(raw as string[]);
    return raw as ReferenceImage[];
  }
  return [raw as ReferenceImage];
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const taskId = process.argv[2];
  if (!taskId) {
    console.error('Usage: tsx src/scripts/trace-graph-task-chain.ts <taskId>');
    process.exit(1);
  }

  const repo = RepositoryFactory.createCGITaskRepository();
  const task = await repo.findById(taskId, true);
  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const requestParams: any = task.input_data || {};
  const graphType = requestParams.graphType || requestParams?.params?.graphType;
  const type = requestParams.type ?? requestParams?.params?.type ?? null;
  const provider = (requestParams.provider || task.model_provider || undefined) as any;
  const userPrompt = String(requestParams.prompt ?? requestParams?.params?.prompt ?? '');
  const lang = detectLang(userPrompt);

  console.log('=== [trace] task basic ===');
  console.log(
    safeJson({
      id: task.id,
      status: task.status,
      task_type: task.task_type,
      model_name: task.model_name,
      model_provider: task.model_provider,
      created_at: task.created_at,
      graphType,
      type,
      promptLen: userPrompt.length,
      result_format: task.result_format,
    })
  );

  console.log('\n=== [trace] requestParams (input_data) keys ===');
  console.log(Object.keys(requestParams));
  if (requestParams?.params) {
    console.log('nested params keys:', Object.keys(requestParams.params));
  }

  console.log('\n=== [trace] prompt (input_data.prompt) prefix ===');
  console.log(userPrompt.slice(0, 600));

  const normalized = normalizeGraphParams(requestParams);
  const referenceImages = normalizeReferenceImages(normalized.referenceImage);
  console.log('\n=== [trace] reference images summary ===');
  console.log(
    safeJson({
      count: referenceImages.length,
      byType: referenceImages.reduce((acc: any, r: any) => {
        const k = r?.type || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      groups: referenceImages.reduce((acc: any, r: any) => {
        const k = r?.groupKey || 'none';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      samples: referenceImages.slice(0, 3).map((r: any) => ({
        type: r.type,
        groupKey: r.groupKey,
        purpose: r.purpose,
        contentPrefix: typeof r.content === 'string' ? r.content.slice(0, 80) : typeof r.content,
      })),
    })
  );

  console.log('\n=== [trace] referenceImagePrompt (for LLM) ===');
  console.log(buildReferenceImagePrompt(referenceImages, lang));

  if (!graphType || !['photograph', 'design', 'painting'].includes(graphType)) {
    console.log('\n=== [trace] ERROR: invalid graphType, stop ===');
    process.exit(0);
  }

  const resolved = await resolveGraphModel(graphType, type, provider);
  console.log('\n=== [trace] resolved model/provider ===');
  console.log(safeJson(resolved));

  const usedPrompt =
    (task.metadata as any)?.generated_prompt ||
    (task.metadata as any)?.generatedPrompt ||
    (task.metadata as any)?.prompt ||
    userPrompt;
  console.log('\n=== [trace] usedPrompt (generated_prompt if exists) prefix ===');
  console.log(String(usedPrompt).slice(0, 800));

  // Build imageParams similarly to generateGraphImage, but do NOT call provider.
  const modelName = resolved.modelName as any;
  const resolvedProvider = resolved.provider as any;
  const processed = referenceImages;
  const { urls, base64s } = processReferenceImages(processed, modelName);
  console.log('\n=== [trace] processReferenceImages result ===');
  console.log(safeJson({ urls: urls.length, base64s: base64s.length }));

  // Key risk: provider needs public URLs, or needs data-uri base64; validate a few URLs if present.
  const urlToCheck = urls.slice(0, 3);
  if (urlToCheck.length) {
    console.log('\n=== [trace] check reference URLs reachable (first 3) ===');
    for (const u of urlToCheck) {
      const r = await checkUrlReachable(u);
      console.log(safeJson({ url: u, ...r }));
    }
  }

  // For DeerAPI Gemini paths we usually convert URL->data-uri later; we show what we currently have.
  const imageParamShape =
    modelName === 'nano-banana-pro' || (modelName === 'nano-banana-2' && resolvedProvider === 'deer')
      ? 'expects data-uri/base64 (image/image_base64s)'
      : modelName === 'seedream-4' || modelName === 'seedream-5'
      ? 'seedream expects image_input (data-uri/base64) or image url depending provider'
      : 'may accept URLs';

  console.log('\n=== [trace] inference ===');
  console.log(
    safeJson({
      modelName,
      resolvedProvider,
      imageParamShape,
      hasReferenceImages: processed.length > 0,
      referenceUrlCount: urls.length,
      referenceBase64Count: base64s.length,
      note:
        resolvedProvider === 'atlascloud' && urls.length > 0
          ? 'atlascloud 路径通常要求 images 是公网可访问 URL；如果这些 URL 需要鉴权/内网，将导致参考图实际无效。'
          : undefined,
    })
  );

  // Optional: show if any referenceImage content is actually base64 in params.
  const contentKinds = processed.reduce(
    (acc: any, r: any) => {
      const c = r?.content;
      if (typeof c !== 'string') return acc;
      if (isBase64(c)) acc.base64++;
      else if (isUrl(c)) acc.url++;
      else acc.other++;
      return acc;
    },
    { base64: 0, url: 0, other: 0 }
  );
  console.log('\n=== [trace] reference image content kinds ===');
  console.log(safeJson(contentKinds));

  // If we had data-uri, show decoded size (rough).
  const dataUriSamples = processed
    .map((r: any) => (typeof r.content === 'string' ? r.content : ''))
    .filter((c: string) => c.startsWith('data:'))
    .slice(0, 1);
  if (dataUriSamples.length) {
    const b64 = extractBase64FromDataUri(dataUriSamples[0]);
    console.log('\n=== [trace] data-uri sample size ===');
    console.log(safeJson({ base64Length: b64.length, approxMB: b64.length / 1024 / 1024 }));
  }
}

main().catch((e) => {
  console.error('[trace] failed:', e);
  process.exit(1);
});

