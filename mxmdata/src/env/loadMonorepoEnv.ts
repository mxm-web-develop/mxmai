/**
 * 全 monorepo 唯一环境变量入口：项目根目录 .env / .env.local
 * 或按 MXM_ENV 加载 .env.{profile} / .env.{profile}.local（如 test → .env.test）
 */
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const LEGACY_ENV_RELATIVE = [
  'mxmdata/.env',
  'mxmcgi/.env',
  'mxmauth/.env',
  'gateway/.env',
  'mxmpay/.env',
] as const;

let loaded = false;

/** 从 startDir 向上查找含 pnpm-workspace.yaml 的目录 */
export function findMonorepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

export interface LoadMonorepoEnvOptions {
  /** 日志前缀，如 mxmcgi / gateway */
  service?: string;
  /** 发现模块级 .env 时打印迁移提示（默认 true） */
  warnLegacy?: boolean;
}

/** 当前生效的环境 profile（由 shell 设置 MXM_ENV=test，勿写入 .env 文件） */
export function getMonorepoEnvProfile(): string | undefined {
  const profile = process.env.MXM_ENV?.trim();
  return profile && profile !== 'local' ? profile : undefined;
}

function resolveEnvPaths(root: string): { primary: string; local: string; label: string } {
  const profile = getMonorepoEnvProfile();
  if (profile) {
    return {
      primary: path.join(root, `.env.${profile}`),
      local: path.join(root, `.env.${profile}.local`),
      label: `.env.${profile}`,
    };
  }
  return {
    primary: path.join(root, '.env'),
    local: path.join(root, '.env.local'),
    label: '.env',
  };
}

function warnLegacyEnvFiles(root: string, service?: string): void {
  const found = LEGACY_ENV_RELATIVE.filter((rel) => fs.existsSync(path.join(root, rel)));
  if (found.length === 0) return;
  const tag = service ? `[${service}] ` : '';
  console.warn(
    `${tag}[env] 检测到模块级 .env（已弃用，请合并到项目根 .env）：${found.join(', ')}。` +
      `运行 node scripts/merge-env-to-root.mjs 可自动合并。见 docs/ENV.md`
  );
}

/**
 * 加载环境变量（幂等，全进程只执行一次）
 * 默认：.env → .env.local（后者覆盖）
 * MXM_ENV=test：.env.test → .env.test.local（不加载 .env，避免与本地 dev 混用）
 */
export function loadMonorepoEnv(options: LoadMonorepoEnvOptions = {}): string {
  if (loaded) {
    return findMonorepoRoot();
  }
  loaded = true;

  process.env.DOTENV_CONFIG_DEBUG = 'false';

  const root = findMonorepoRoot();
  const { primary: envPath, local: localPath, label } = resolveEnvPaths(root);
  const profile = getMonorepoEnvProfile();

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
  if (fs.existsSync(localPath)) {
    dotenv.config({ path: localPath, override: true });
  }

  if (options.warnLegacy !== false) {
    warnLegacyEnvFiles(root, options.service);
  }

  if (!fs.existsSync(envPath) && !fs.existsSync(localPath)) {
    const tag = options.service ? `[${options.service}] ` : '';
    const hint = profile
      ? `请运行 pnpm setup:env:test 从主服务器生成 ${label}（见 docs/ENV.md#本地-test-环境）`
      : `请复制 .env.example 为 .env 并填写配置（见 docs/ENV.md）`;
    console.warn(`${tag}[env] 未找到 ${envPath}，${hint}`);
  } else if (profile) {
    const tag = options.service ? `[${options.service}] ` : '';
    console.info(`${tag}[env] 使用 profile=${profile}（${label}）`);
  }

  return root;
}
