import { createZipBlob, downloadBlob } from '../utils/createZipBlob';

const SKILL_PATHS = [
  'SKILL.md',
  'INSTALL.md',
  'reference.md',
  '.env.example',
  'scripts/mxm-catalog.mjs',
] as const;

async function fetchSkillFile(relPath: string): Promise<string> {
  const url = `/agent-skill/mxm-agent-platform/${relPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`无法加载 Skill 模板 ${relPath} (${res.status})`);
  }
  return res.text();
}

export async function downloadMxmAgentSkillZip(baseUrl: string): Promise<void> {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const entries = await Promise.all(
    SKILL_PATHS.map(async (rel) => {
      let content = await fetchSkillFile(rel);
      if (rel === '.env.example') {
        content = content.replace(/^MXM_BASE_URL=.*$/m, `MXM_BASE_URL=${normalizedBase}`);
      }
      return { path: `mxm-agent-platform/${rel}`, content };
    })
  );
  const blob = createZipBlob(entries);
  downloadBlob(blob, 'mxm-agent-platform.zip');
}
