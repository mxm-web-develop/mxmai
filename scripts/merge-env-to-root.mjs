#!/usr/bin/env node
/**
 * 将各模块遗留 .env 合并到项目根 .env（不覆盖根目录已有键）
 * PORT 会按服务重命名为 GATEWAY_PORT / MXMAUTH_PORT 等，避免统一 .env 端口冲突
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** 各模块 PORT= 合并时的目标键 */
const PORT_KEY_BY_SOURCE = {
  'mxmauth/.env': 'MXMAUTH_PORT',
  'gateway/.env': 'GATEWAY_PORT',
  'mxmpay/.env': 'MXMPAY_PORT',
  'mxmcgi/.env': 'MXMCGI_PORT',
  'mxmdata/.env': null,
};

const SOURCES = [
  'mxmdata/.env',
  'mxmcgi/.env',
  'mxmauth/.env',
  'gateway/.env',
  'mxmpay/.env',
];

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map.set(key, value);
  }
  return map;
}

const rootEnvPath = path.join(root, '.env');
const existing = fs.existsSync(rootEnvPath) ? parseEnv(fs.readFileSync(rootEnvPath, 'utf8')) : new Map();
const merged = new Map(existing);
const added = [];
const skipped = [];

for (const rel of SOURCES) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const incoming = parseEnv(fs.readFileSync(p, 'utf8'));
  for (const [k, v] of incoming) {
    let key = k;
    if (k === 'PORT') {
      const mapped = PORT_KEY_BY_SOURCE[rel];
      if (!mapped) continue;
      key = mapped;
    }
    if (merged.has(key)) {
      skipped.push({ key, from: rel, original: k });
      continue;
    }
    merged.set(key, v);
    added.push({ key, from: rel, original: k });
  }
}

if (added.length === 0) {
  console.log('没有需要合并的新变量（根 .env 已包含全部键，或模块 .env 不存在）。');
  process.exit(0);
}

const lines = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, 'utf8').trimEnd() : '';
const appendix = [
  '',
  '# --- 以下由 merge-env-to-root.mjs 自动合并 ---',
  ...added.map(({ key, from, original }) =>
    original !== key ? `# from ${from} (${original}→${key})` : `# from ${from}`
  ),
  ...added.map(({ key }) => `${key}=${merged.get(key)}`),
].join('\n');

fs.writeFileSync(rootEnvPath, lines + appendix + '\n', 'utf8');

console.log(`✅ 已写入 ${rootEnvPath}`);
console.log(`   新增 ${added.length} 个变量:`);
for (const { key, from, original } of added) {
  const note = original !== key ? ` (${original}→${key})` : '';
  console.log(`   - ${key}${note}  ← ${from}`);
}
if (skipped.length > 0) {
  console.log(`   跳过 ${skipped.length} 个（根 .env 已存在同名键）`);
}
console.log('\n请重启 dev:all-with-web。勿在根 .env 使用单一 PORT=，见 docs/ENV.md');
