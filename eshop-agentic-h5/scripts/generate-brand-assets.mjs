#!/usr/bin/env node
/**
 * 用启航 AI 生成品牌 / 品类卡片插图（勿将 API Key 提交到 Git）
 *
 *   QHAI_API_KEY=sk-xxx node scripts/generate-brand-assets.mjs
 *   QHAI_API_KEY=sk-xxx node scripts/generate-brand-assets.mjs --hero
 *   QHAI_API_KEY=sk-xxx node scripts/generate-brand-assets.mjs --only=women,men
 *   QHAI_MODEL=gpt-image-2
 *   QHAI_RETRIES=4 QHAI_RETRY_MS=3000
 *
 * 默认生成品类卡插图 → public/brand/line-*.png
 * 文档：https://www.qhaigc.net/docs/api-reference/images/generate
 */
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

/** 读取 eshop-agentic-h5/.env（不覆盖已有环境变量） */
function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(projectRoot, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* no .env */
  }
}

loadDotEnv();

const key = process.env.QHAI_API_KEY?.trim();
const model = process.env.QHAI_MODEL?.trim() || 'gpt-image-2';
const size = process.env.QHAI_SIZE?.trim() || '1024x1024';
const baseUrl = (process.env.QHAI_BASE_URL || 'https://api.qhaigc.net/v1').replace(/\/$/, '');
const withHero = process.argv.includes('--hero');
const delayMs = Number(process.env.QHAI_DELAY_MS || 1500);
const maxRetries = Number(process.env.QHAI_RETRIES || 4);
const retryBaseMs = Number(process.env.QHAI_RETRY_MS || 3000);

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyIds = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : null;

/**
 * 品牌色见 app/globals.css — 暖米 #F6F3EF、陶土 #C45C4A、品类点缀
 * 目标：同一套「线性扁平 app 图标」，非人台/非人物/非场景插画
 */
const SERIES_STYLE = [
  'Matching set of 5 minimal LINE-ART app icons for warm-tone ecommerce UI, identical stroke width and corner radius,',
  'full-bleed flat background EXACTLY warm cream color #F6F3EF (not pink, not blue, not gradient sky),',
  'icon glyph only in bottom-right 45% of canvas, top-left 55% completely empty cream for text,',
  '2-tone line icon style: outline #57534E + one soft fill accent color, no shadows no 3D no depth no texture,',
  'looks like iOS SF Symbol fashion icons or Figma icon set, vector clean edges,',
  'FORBIDDEN: mannequin, human, face, photo, realistic, anime, leaves, waves, sparkles, decorative background shapes, text',
].join(' ');

const LINE_PROMPTS = [
  {
    id: 'women',
    out: 'public/brand/line-women.png',
    prompt: `${SERIES_STYLE} glyph: simple A-line dress outline, fill accent #E8A0B4`,
  },
  {
    id: 'men',
    out: 'public/brand/line-men.png',
    prompt: `${SERIES_STYLE} glyph: suit jacket on clothes hanger outline, fill accent #7B9EB8`,
  },
  {
    id: 'kids',
    out: 'public/brand/line-kids.png',
    prompt: `${SERIES_STYLE} glyph: kids t-shirt outline with small star on chest, fill accent #8FBC9A`,
  },
  {
    id: 'accessories',
    out: 'public/brand/line-accessories.png',
    prompt: `${SERIES_STYLE} glyph: ring and pendant necklace outline only, fill accent #D4B896`,
  },
  {
    id: 'shoes-hats',
    out: 'public/brand/line-shoes.png',
    prompt: `${SERIES_STYLE} glyph: one sneaker side view plus baseball cap outline, fill accent #C4B5A0`,
  },
];

const HERO_PROMPT = {
  id: 'hero',
  out: 'public/brand/hero-illustration.png',
  prompt: [
    'Mobile app hero banner illustration, same flat editorial style as icon pack above,',
    'warm cream #F6F3EF background, terracotta #C45C4A and blush #E8A0B4 accents,',
    'abstract 3x3 grid of soft rounded photo tiles suggesting ecommerce product shots, airy minimal, no text',
  ].join(' '),
};

if (!key) {
  console.error('请设置环境变量 QHAI_API_KEY');
  process.exit(1);
}

let jobs = [...LINE_PROMPTS, ...(withHero ? [HERO_PROMPT] : [])];
if (onlyIds?.size) {
  jobs = jobs.filter((j) => onlyIds.has(j.id));
  if (!jobs.length) {
    console.error('无匹配任务，--only= 可用 id:', LINE_PROMPTS.map((j) => j.id).join(', '));
    process.exit(1);
  }
}

const RETRYABLE = new Set([
  'upstream_error',
  'server_error',
  'rate_limit_exceeded',
  'timeout',
  'service_unavailable',
]);

function isRetryable(json, status) {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const code = json?.error?.code ?? '';
  const type = json?.error?.type ?? '';
  return RETRYABLE.has(code) || RETRYABLE.has(type);
}

function formatApiError(json, status) {
  const e = json?.error;
  if (!e) return `HTTP ${status}`;
  return `${e.code ?? e.type ?? 'error'}: ${e.message ?? JSON.stringify(e)}`;
}

async function requestImage(prompt) {
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { error: { code: 'invalid_json', message: await res.text().catch(() => '') } };
  }
  return { res, json };
}

async function generateOne({ out, prompt, id }) {
  const label = id ?? out;
  console.log(`\n[${label}] 模型 ${model} · ${size}`);

  let lastErr = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      const wait = retryBaseMs * attempt;
      console.log(`  重试 ${attempt}/${maxRetries}，等待 ${(wait / 1000).toFixed(0)}s …`);
      await sleep(wait);
    }

    const { res, json } = await requestImage(prompt);
    const url = json?.data?.[0]?.url;

    if (url) {
      const img = await fetch(url);
      if (!img.ok) {
        lastErr = `下载失败 HTTP ${img.status}`;
        if (attempt < maxRetries) continue;
        throw new Error(`${label}: ${lastErr}`);
      }
      await mkdir(dirname(out), { recursive: true });
      const fs = await import('node:fs/promises');
      await fs.writeFile(out, Buffer.from(await img.arrayBuffer()));
      console.log('✓ 已写入', out);
      return;
    }

    lastErr = formatApiError(json, res.status);
    console.warn(`  失败 (${attempt}/${maxRetries}):`, lastErr);

    if (!isRetryable(json, res.status) || attempt >= maxRetries) {
      console.error('  响应:', JSON.stringify(json, null, 2));
      break;
    }
  }

  throw new Error(`${label}: ${lastErr}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log(`将生成 ${jobs.length} 张（模型 ${model}，失败最多重试 ${maxRetries} 次）`);

const failed = [];
for (let i = 0; i < jobs.length; i++) {
  try {
    await generateOne(jobs[i]);
  } catch (e) {
    failed.push({ id: jobs[i].id, error: e instanceof Error ? e.message : String(e) });
    console.error('✗', jobs[i].id, e instanceof Error ? e.message : e);
  }
  if (i < jobs.length - 1) await sleep(delayMs);
}

if (failed.length) {
  console.error('\n未完成:', failed.map((f) => f.id).join(', '));
  console.error(
    'upstream_error / 服务异常 多为启航或上游模型短暂故障，请稍后重试：\n' +
      '  QHAI_API_KEY=… pnpm run generate:line-art --only=' +
      failed.map((f) => f.id).join(',') +
      '\n' +
      '或换模型：QHAI_MODEL=nano-banana-2 / qh-draw-x1-pro / qh-draw-x2-preview'
  );
  process.exit(1);
}

console.log('\n完成。刷新 /start 即可看到品类卡插图。');
