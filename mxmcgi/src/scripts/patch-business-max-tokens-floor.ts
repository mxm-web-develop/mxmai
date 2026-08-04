/**
 * 将 DB 中全部业务 generateParams.maxTokens 抬到 ≥ 20000（平台下限）。
 *
 * 用法（mxmcgi 目录）:
 *   pnpm exec tsx src/scripts/patch-business-max-tokens-floor.ts
 *   pnpm exec tsx src/scripts/patch-business-max-tokens-floor.ts --dry-run
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const FLOOR = 20_000;
const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }
  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error('MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL');
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

function bumpGenerateParams(extra: Record<string, unknown> | null | undefined): {
  next: Record<string, unknown> | null;
  from: number | null;
  to: number | null;
} {
  if (!extra || typeof extra !== 'object') return { next: null, from: null, to: null };
  const cloned = structuredClone(extra) as Record<string, unknown>;
  const tt = cloned.taskTemplate as Record<string, unknown> | undefined;
  if (!tt || typeof tt !== 'object') return { next: null, from: null, to: null };
  const ttExtra = (tt.extra ?? {}) as Record<string, unknown>;
  const gp = (ttExtra.generateParams ?? {}) as Record<string, unknown>;
  const mt = gp.maxTokens;
  const from = typeof mt === 'number' && Number.isFinite(mt) ? Math.floor(mt) : null;
  if (from != null && from >= FLOOR) return { next: null, from, to: null };
  const to = FLOOR;
  tt.extra = {
    ...ttExtra,
    generateParams: {
      ...gp,
      maxTokens: to,
    },
  };
  cloned.taskTemplate = tt;
  return { next: cloned, from, to };
}

async function main() {
  loadEnvOnce();
  const dryRun = process.argv.includes('--dry-run');
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  const pageSize = 100;
  let offset = 0;
  const updated: Array<{ key: string; from: number | null; to: number }> = [];
  const skipped: Array<{ key: string; maxTokens: number | null }> = [];

  for (;;) {
    const { items, total } = await repo.list({ limit: pageSize, offset });
    for (const row of items) {
      const key = `${row.scope}/${row.type}/${row.subtype ?? ''}`;
      const { next, from, to } = bumpGenerateParams(
        (row.extra ?? null) as Record<string, unknown> | null
      );
      if (!next || to == null) {
        skipped.push({ key, maxTokens: from });
        continue;
      }
      updated.push({ key, from, to });
      if (!dryRun) {
        await repo.upsert({
          scope: row.scope,
          type: row.type,
          subtype: row.subtype,
          extra: next,
          is_active: row.is_active,
          updated_by: null,
        });
      }
    }
    offset += items.length;
    if (offset >= total || items.length === 0) break;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        floor: FLOOR,
        updatedCount: updated.length,
        updated,
        skippedAlreadyOk: skipped.filter((s) => (s.maxTokens ?? 0) >= FLOOR).length,
        skippedNoGenerateParams: skipped.filter((s) => s.maxTokens == null).length,
      },
      null,
      2
    )
  );
  if (!dryRun) {
    console.log('\n✅ 已写入 DB。Task V2 运行时亦有 20k 下限兜底。');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
