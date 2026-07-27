#!/usr/bin/env node
/**
 * 拉取 SuperMXMai Agent Catalog
 * 用法: node scripts/mxm-catalog.mjs [--pretty] [--out file.json]
 * 环境: MXM_BASE_URL, MXM_API_KEY（或 .env 文件）
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

const baseUrl = (process.env.MXM_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.MXM_API_KEY || '';

if (!baseUrl || !apiKey) {
  console.error('请设置 MXM_BASE_URL 与 MXM_API_KEY（可复制 .env.example 为 .env）');
  process.exit(1);
}

const args = process.argv.slice(2);
const pretty = args.includes('--pretty');
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

const url = `${baseUrl}/api/v1/agent/catalog`;

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
});

const body = await res.text();
let json;
try {
  json = JSON.parse(body);
} catch {
  console.error(`非 JSON 响应 (${res.status}):`, body.slice(0, 500));
  process.exit(1);
}

if (!res.ok) {
  console.error(`请求失败 (${res.status}):`, JSON.stringify(json, null, 2));
  process.exit(1);
}

const catalog = json.data ?? json;
const text = pretty ? JSON.stringify(catalog, null, 2) : JSON.stringify(catalog);

if (outFile) {
  writeFileSync(outFile, text, 'utf8');
  console.error(`已写入 ${outFile}（taskV2=${catalog.taskV2?.length ?? 0}, smartflows=${catalog.smartflows?.length ?? 0}）`);
} else {
  console.log(text);
}
