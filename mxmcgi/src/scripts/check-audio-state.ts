/**
 * 诊断：现行 audio 路由（generator|group|series）与 maxplan speech 模型
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

dotenv.config({ path: join(process.cwd(), '.env'), override: false });
dotenv.config({ path: join(process.cwd(), '..', '.env'), override: false });
RepositoryFactory.init();

async function main() {
  const audioRepo = RepositoryFactory.createAudioScopeConfigRepository();
  console.log('=== audio scope routes (generator|group|series) ===');
  for (const taskKey of ['generator', 'group', 'series'] as const) {
    for (const sub of ['voice-over-test', 'multi-voice', 'default']) {
      const cfg = await audioRepo.findConfig('audio', taskKey, sub);
      console.log(
        `  ${taskKey}/${sub}:`,
        cfg ? `enabled=${cfg.enabled} model=${cfg.model} provider=${cfg.provider}` : 'NOT FOUND'
      );
    }
  }

  // 确认 speak 已禁用
  console.log('\n=== legacy speak (should be disabled / absent) ===');
  const speak = await audioRepo.listConfigs({ scope: 'audio', task_key: 'speak', limit: 50 });
  if (!speak.items.length) console.log('  (no speak routes)');
  for (const cfg of speak.items) {
    console.log(`  speak/${cfg.sub_type}: enabled=${cfg.enabled}`);
  }

  const pm = RepositoryFactory.createProviderModelRepository();
  const all = await pm.list({ onlyEnabled: true });
  const maxplanAudio = all.filter((m) => m.scope === 'audio' && m.provider === 'maxplan');
  console.log(`\n=== maxplan audio provider_models (enabled): ${maxplanAudio.length} ===`);
  for (const m of maxplanAudio) {
    console.log(`  - ${m.model_key}  (display=${m.display_name ?? m.upstream_model})`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
