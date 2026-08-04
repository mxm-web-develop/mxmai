/**
 * 冒烟：从 DB 加载切片业务，确认 skillPack 可被 runtime 识别
 *   pnpm exec tsx ./src/tasks/skill/smoke-core-skill-load.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');
dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });

async function main() {
  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  const { loadTaskDefinition } = await import('../task-definition');
  const { hasCoreSkillMode, readSkillPack, getSkillFile, SKILL_MD_PATH } = await import('./pack');
  const { CORE_SKILL_ALL_SLICES, skillSliceId } = await import('./slice');

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
      const ok = hasCoreSkillMode(extra);
      const pack = readSkillPack(extra);
      const skill = pack ? getSkillFile(pack, SKILL_MD_PATH) : null;
      const rules = pack ? getSkillFile(pack, 'references/rules.md') : null;
      const contract = pack ? getSkillFile(pack, 'references/contract.md') : null;
      if (!ok || !skill?.content?.trim() || !contract?.content?.trim()) {
        failures.push(
          `${id}: skillMode=${String(extra.skillMode)} files=${pack?.files?.length ?? 0} skill=${Boolean(skill?.content)} contract=${Boolean(contract?.content)} rules=${Boolean(rules?.content)}`
        );
      } else {
        console.log(
          `OK ${id} files=${pack!.files.length} skillChars=${skill!.content.length} rulesChars=${rules?.content?.length ?? 0}`
        );
      }
    } catch (e) {
      failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failures.length) {
    console.error('\nFAIL');
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\n✅ all ${CORE_SKILL_ALL_SLICES.length} slices loadable with Core Skill pack`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
