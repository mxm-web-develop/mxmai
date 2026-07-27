/**
 * 一次性诊断脚本：检查 maxplan audio 模型 / knowledge-show-episode 路由在 DB 中的状态
 * 生产 / 本地通用：env 由调用方注入
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import { loadMonorepoEnv } from '../config/loadEnv';

loadMonorepoEnv();
RepositoryFactory.init();

async function main() {
  const audioRepo = RepositoryFactory.createAudioScopeConfigRepository();
  console.log('=== audio scope routes (knowledge-show-episode / voice-over-test / default) ===');
  for (const sub of ['knowledge-show-episode', 'voice-over-test', 'default']) {
    const cfg = await audioRepo.findConfig('audio', 'speak', sub);
    console.log(`  speak/${sub}:`, cfg ? `enabled=${cfg.enabled} model=${cfg.model} provider=${cfg.provider}` : 'NOT FOUND');
  }

  const pm = RepositoryFactory.createProviderModelRepository();
  const all = await pm.list({ onlyEnabled: true });
  const audio = all.filter((m) => m.scope === 'audio');
  const maxplanAudio = audio.filter((m) => m.provider === 'maxplan');
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
