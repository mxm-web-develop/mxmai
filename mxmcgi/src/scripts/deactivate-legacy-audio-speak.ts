/**
 * 停用全部废弃 audio/speak/*（规范仅允许 generator|group|series）。
 * 同时停用仅挂在 speak bundle 上的 text 子业务，并禁用 audio_scope_config 中 task_key=speak 的路由。
 *
 * 用法:
 *   pnpm run deactivate:legacy-audio-speak
 *   MXM_SEED_PRODUCTION=1 pnpm run deactivate:legacy-audio-speak
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

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

/** 仅服务于旧 speak 示例包的 text 子业务（包已删，定义一并停用） */
const SPEAK_ONLY_TEXT: Array<{ type: string; subtype: string }> = [
  { type: 'transform', subtype: 'course-glossary-extract' },
  { type: 'transform', subtype: 'course-outline-from-doc' },
  { type: 'transform', subtype: 'course-lecture-script-draft' },
  { type: 'transform', subtype: 'course-qa-card-gen' },
  { type: 'transform', subtype: 'course-lecture-tts-markup' },
  { type: 'transform', subtype: 'knowledge-show-script-draft' },
  { type: 'transform', subtype: 'knowledge-show-script-tts-markup' },
];

async function deactivatePrompt(
  repo: ReturnType<typeof RepositoryFactory.createPromptEngineeringConfigRepository>,
  scope: string,
  type: string,
  subtype: string | null,
  results: Array<Record<string, unknown>>
) {
  const key = `${scope}/${type}/${subtype ?? '-'}`;
  const row = await repo.findByKey(scope, type, subtype);
  if (!row) {
    results.push({ key, status: 'not_found' });
    return;
  }
  if (!row.is_active) {
    results.push({ key, status: 'already_inactive', id: row.id });
    return;
  }
  await repo.upsert({
    scope: row.scope,
    type: row.type,
    subtype: row.subtype,
    extra: row.extra ?? undefined,
    is_active: false,
    updated_by: null,
  });
  results.push({ key, status: 'deactivated', id: row.id });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const audioRepo = RepositoryFactory.createAudioScopeConfigRepository();
  const results: Array<Record<string, unknown>> = [];

  // 1) 停用所有 audio/speak/*
  const listed = await promptRepo.list({ scope: 'audio', type: 'speak', limit: 200 });
  const speakRows = listed.items ?? [];
  if (speakRows.length === 0) {
    // list 可能不支持 type 过滤：扫常见 subtype
    for (const subtype of [
      'voice-over-test',
      'online-course-series',
      'knowledge-show-episode',
      'default',
      null,
    ] as const) {
      await deactivatePrompt(promptRepo, 'audio', 'speak', subtype, results);
    }
  } else {
    for (const row of speakRows) {
      await deactivatePrompt(promptRepo, row.scope, row.type, row.subtype, results);
    }
  }

  // 2) 停用 speak-only text
  for (const t of SPEAK_ONLY_TEXT) {
    await deactivatePrompt(promptRepo, 'text', t.type, t.subtype, results);
  }

  // 3) 禁用 audio_scope_config 中 task_key=speak（勿用 findConfig：会 fallback 到 default 误判）
  const routes = await audioRepo.listConfigs({ scope: 'audio', task_key: 'speak', limit: 100 });
  if (!routes.items?.length) {
    results.push({ key: 'route:audio/speak/*', status: 'not_found' });
  }
  for (const cfg of routes.items ?? []) {
    const key = `route:audio/${cfg.task_key}/${cfg.sub_type}`;
    if (!cfg.task_key) {
      results.push({ key, status: 'skip_invalid', id: cfg.id });
      continue;
    }
    if (!cfg.enabled) {
      results.push({ key, status: 'already_disabled', id: cfg.id });
      continue;
    }
    await audioRepo.upsertConfig({
      scope: cfg.scope,
      task_key: cfg.task_key,
      sub_type: cfg.sub_type,
      provider: cfg.provider,
      model: cfg.model,
      enabled: false,
    });
    results.push({ key, status: 'route_disabled', id: cfg.id });
  }

  console.log(
    JSON.stringify(
      {
        note: 'audio type=speak 已废弃；现行 audio/generator|group|series',
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
