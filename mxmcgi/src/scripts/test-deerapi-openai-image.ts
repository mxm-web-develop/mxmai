import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { DeerAPIClient } from '../models/deerapi/client';

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
  const baseUrl = process.env.DEERAPI_BASE_URL;
  const apiKey = process.env.DEERAPI_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('missing DEERAPI_BASE_URL/DEERAPI_API_KEY');

  const client = new DeerAPIClient({ baseUrl, apiKey, group: process.env.DEERAPI_GROUP });
  const model = process.env.DEERAPI_TEST_IMAGE_MODEL || 'gpt-image-2';
  const prompt = 'A simple studio photo of a red apple on a white background.';
  const res = await client.createOpenAIImageGeneration({
    model,
    prompt,
    size: '1024x1024',
    n: 1,
  });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error('test failed:', e);
  process.exit(1);
});

