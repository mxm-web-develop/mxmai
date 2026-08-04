/**
 * 冒烟：DB 中 Core Skill 切片是否可 load
 *   pnpm exec tsx src/scripts/smoke-core-skill-load.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');
process.env.DOTENV_CONFIG_DEBUG = 'false';
dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_ANON_KEY（请检查仓库根 .env）');
  }
  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  const { loadTaskDefinition } = await import('../tasks/task-definition');
  const { hasCoreSkillMode, readSkillPack, getSkillFile, SKILL_MD_PATH } = await import(
    '../tasks/skill/pack'
  );
  const { CORE_SKILL_ALL_SLICES, skillSliceId } = await import('../tasks/skill/slice');

  RepositoryFactory.init();
  const failures: string[] = [];
  for (const s of CORE_SKILL_ALL_SLICES) {
    const id = skillSliceId(s);
    try {
      const def = await loadTaskDefinition({
        scope: s.scope as any,
        taskKey: s.kind,
        subtype: s.subtype,
      });
      const extra = (def.template.extra ?? {}) as Record<string, unknown>;
      const pack = readSkillPack(extra);
      const skill = pack ? getSkillFile(pack, SKILL_MD_PATH) : null;
      const contract = pack ? getSkillFile(pack, 'references/contract.md') : null;
      const rules = pack ? getSkillFile(pack, 'references/rules.md') : null;
      if (!hasCoreSkillMode(extra) || !skill?.content?.trim() || !contract?.content?.trim()) {
        failures.push(
          `${id}: mode=${String(extra.skillMode)} files=${pack?.files?.length ?? 0}`
        );
      } else {
        console.log(
          `OK ${id} files=${pack!.files.length} skill=${skill!.content.length} rules=${rules?.content?.length ?? 0}`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      failures.push(`${id}: ${msg}`);
    }
  }
  if (failures.length) {
    console.error('\nFAIL');
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\n✅ ${CORE_SKILL_ALL_SLICES.length} slices OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
