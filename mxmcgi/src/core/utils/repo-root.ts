import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** ESM（vitest/tsx）下的模块目录；CJS bundle 回退 process.cwd() */
export function resolveModuleDirname(): string {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return dirname(fileURLToPath(import.meta.url));
  }
  return process.cwd();
}

export function findRepoRoot(marker = 'pnpm-workspace.yaml'): string {
  const starts = new Set<string>([process.cwd(), resolveModuleDirname()]);
  for (const start of starts) {
    let dir = start;
    while (dir !== dirname(dir)) {
      if (existsSync(join(dir, marker))) return dir;
      dir = dirname(dir);
    }
  }
  throw new Error(`无法定位 monorepo 根目录（缺少 ${marker}）`);
}
