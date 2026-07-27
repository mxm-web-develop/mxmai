import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createProviderModelRepository();

  // 让 google provider 的 supportsModel() 能命中（依赖 provider_models onlyEnabled=true）
  const row = await repo.upsert({
    provider: 'google',
    scope: 'text',
    model_key: 'gemini-2.5-flash',
    upstream_model: 'gemini-2.5-flash',
    protocol: 'google-gemini-generateContent',
    modality: 'text',
    display_name: 'Gemini 2.5 Flash (Text)',
    description: 'Text-only Gemini model for prompt formatting tasks.',
    capabilities: { input: { text: true }, output: { text: true } },
    default_parameters: { temperature: 0.2, topP: 0.9 },
    is_enabled: true,
  } as any);

  console.log('seeded provider_models:', {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    model_key: row.model_key,
    upstream_model: row.upstream_model,
    is_enabled: (row as any).is_enabled,
  });
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});

