#!/usr/bin/env node
/**
 * 从 public/brand/grid-icon.svg 生成 PWA 图标（192 / 512 / apple-touch）
 *
 *   node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require(resolve(root, '../node_modules/sharp'));
} catch {
  try {
    sharp = require('sharp');
  } catch {
    console.error('未找到 sharp，请在 monorepo 根目录执行: pnpm install');
    process.exit(1);
  }
}

const svgPath = resolve(root, 'public/brand/grid-icon.svg');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath);

async function writeIcon(size, name, padding = 0.18) {
  const inner = Math.round(size * (1 - padding * 2));
  const pad = Math.round((size - inner) / 2);
  const buf = await sharp(svg)
    .resize(inner, inner, { fit: 'contain' })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 246, g: 243, b: 239, alpha: 1 },
    })
    .png()
    .toBuffer();
  const out = resolve(outDir, name);
  await sharp(buf).toFile(out);
  console.log('✓', out);
}

await writeIcon(192, 'icon-192.png');
await writeIcon(512, 'icon-512.png');
await writeIcon(180, 'apple-touch-icon.png', 0.16);
console.log('PWA 图标已生成。');
