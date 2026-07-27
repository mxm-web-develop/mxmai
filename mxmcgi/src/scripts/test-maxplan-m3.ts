/**
 * 本地验证 maxplan MiniMax-M3 文本输出
 * 用法：pnpm --filter @mxmai/mxmcgi exec tsx src/scripts/test-maxplan-m3.ts
 */
import { loadMonorepoEnv } from '@mxmai/mxmdata';
import { MaxplanProvider } from '../models/maxplan/provider';
import { loadProviderModelCatalog, getByProviderAndModelKey } from '../models/provider-model-catalog';

loadMonorepoEnv({ service: 'mxmcgi' });

async function testModel(modelKey: string, prompt: string) {
  const p = new MaxplanProvider();
  const r = await p.generate(modelKey, {
    prompt,
    outputFormat: 'json',
    parameters: { max_tokens: 512, temperature: 0.3 },
  });
  const raw = r.metadata?.raw as Record<string, unknown> | undefined;
  const msg = (raw?.choices as Array<{ message?: Record<string, unknown> }> | undefined)?.[0]
    ?.message;
  const text = String(r.metadata?.text ?? '');
  return {
    textLen: text.length,
    textPreview: text.slice(0, 600),
    reasoningLen: String(msg?.reasoning_content ?? '').length,
    contentType: typeof msg?.content,
    baseResp: raw?.base_resp,
  };
}

async function main() {
  await loadProviderModelCatalog();
  const row = getByProviderAndModelKey('maxplan', 'MiniMax-M3');
  console.log('catalog:', row?.scope, row?.upstream_model, row?.is_enabled);

  const prompt = '用一句话介绍 MiniMax M3。';
  console.log('\n=== MiniMax-M3 ===');
  try {
    const out = await testModel('MiniMax-M3', prompt);
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('ERROR:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
