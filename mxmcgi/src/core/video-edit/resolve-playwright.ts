/**
 * pnpm monorepo 下 worker 从 mxmcgi/dist 启动时，裸 import('playwright') 常解析失败。
 * 与 smoke-gsap-render.mjs 一致：在 node_modules / .pnpm 中定位 playwright 包。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire, pathToFileURL } from 'node:url';
import { findRepoRoot } from '../utils/repo-root';

function resolveRepoRoot(): string {
  try {
    return findRepoRoot();
  } catch {
    return process.cwd();
  }
}

function findPlaywrightEntry(root: string): string | undefined {
  const candidates = [
    join(root, 'node_modules/playwright/index.mjs'),
    join(root, 'mxmcgi/node_modules/playwright/index.mjs'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const pnpmDir = join(root, 'node_modules/.pnpm');
  if (!existsSync(pnpmDir)) return undefined;
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith('playwright@')) continue;
    const p = join(pnpmDir, entry, 'node_modules/playwright/index.mjs');
    if (existsSync(p)) return p;
  }
  return undefined;
}

let cachedChromium: typeof import('playwright').chromium | null = null;

/** 加载 Playwright chromium（带 pnpm 路径回退） */
export async function loadPlaywrightChromium(): Promise<typeof import('playwright').chromium> {
  if (cachedChromium) return cachedChromium;

  try {
    const mod = await import('playwright');
    cachedChromium = mod.chromium;
    return cachedChromium;
  } catch {
    // fall through
  }

  const root = resolveRepoRoot();
  const entry = findPlaywrightEntry(root);
  if (!entry) {
    throw new Error(
      'playwright 未安装，无法服务端 GSAP 渲染（请在 mxmcgi 依赖中安装 playwright 并 pnpm install）'
    );
  }

  const mod = (await import(pathToFileURL(entry).href)) as typeof import('playwright');
  cachedChromium = mod.chromium;
  return cachedChromium;
}

/** 同步探测（日志/健康检查用） */
export function isPlaywrightAvailable(): boolean {
  if (cachedChromium) return true;
  const root = resolveRepoRoot();
  if (findPlaywrightEntry(root)) return true;
  try {
    const req = createRequire(join(root, 'mxmcgi/package.json'));
    req.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
