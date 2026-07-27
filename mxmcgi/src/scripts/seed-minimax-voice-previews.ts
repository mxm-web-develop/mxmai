/**
 * 批量生成 MiniMax 系统音色 5 秒试听并上传 system_static
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run seed:minimax-voice-previews
 *   pnpm --filter @mxmai/mxmcgi run seed:minimax-voice-previews -- --force
 *   pnpm --filter @mxmai/mxmcgi run seed:minimax-voice-previews -- --limit 5
 *
 * 生产（含 Supabase + 存储 + maxplan Key）：
 *   bash scripts/seed-minimax-voice-previews-production.sh
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadMonorepoEnv } from '@mxmai/mxmdata';
import { listMaxplanVoices } from '../core/audio/maxplan-voice-service';
import {
  classifyVoiceLanguage,
  isCatalogVisibleVoice,
} from '../core/audio/minimax-voice-taxonomy';
import {
  PREVIEW_TEXT,
  synthesizeMaxplanVoicePreview,
  uploadVoicePreviewToSystemStatic,
  voiceIdToPreviewFilename,
} from '../core/audio/minimax-voice-preview';

loadMonorepoEnv({ service: 'mxmcgi' });

const args = process.argv.slice(2);
const force = args.includes('--force');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const delayMs = Number(process.env.VOICE_PREVIEW_DELAY_MS || 2000);
const maxRetries = Number(process.env.VOICE_PREVIEW_MAX_RETRIES || 4);

const LOCAL_DIR = path.resolve(
  __dirname,
  '../../assets/minimax-voice-previews/v1',
);
const LEGACY_LOCAL_DIR = path.resolve(__dirname, '../../assets/minimax/voice-previews');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('1002') || /rate limit/i.test(msg);
}

async function synthesizeWithRetry(voiceId: string, text: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await synthesizeMaxplanVoicePreview({ voiceId, text });
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt >= maxRetries) break;
      const wait = delayMs * (attempt + 2);
      console.log(`  rate-limit ${voiceId}, retry in ${wait}ms…`);
      await sleep(wait);
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });

  const voices = (await listMaxplanVoices('system')).filter(isCatalogVisibleVoice);
  const targets = typeof limit === 'number' && Number.isFinite(limit) ? voices.slice(0, limit) : voices;

  console.log(`[seed-voice-previews] 目录可见音色 ${voices.length} 个，待处理 ${targets.length}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const voice of targets) {
    const filename = voiceIdToPreviewFilename(voice.voice_id);
    const localPath = path.join(LOCAL_DIR, filename);
    const legacyPath = path.join(LEGACY_LOCAL_DIR, filename);

    if (
      !force &&
      ((fs.existsSync(localPath) && fs.statSync(localPath).size > 0) ||
        (fs.existsSync(legacyPath) && fs.statSync(legacyPath).size > 0))
    ) {
      skipped += 1;
      console.log(`  skip ${voice.voice_id} (local exists)`);
      continue;
    }

    const language = voice.language ?? classifyVoiceLanguage(voice);
    const text = PREVIEW_TEXT[language];

    try {
      console.log(`  synth ${voice.voice_id} (${language})…`);
      const buffer = await synthesizeWithRetry(voice.voice_id, text);
      fs.writeFileSync(localPath, buffer);

      if (process.env.VOICE_PREVIEW_ASSETS_ONLY !== '1') {
        const uploaded = await uploadVoicePreviewToSystemStatic({
          voiceId: voice.voice_id,
          buffer,
        });
        console.log(`  ok   ${voice.voice_id} → ${uploaded.url}`);
      } else {
        console.log(`  ok   ${voice.voice_id} → ${localPath}`);
      }
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `  fail ${voice.voice_id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    count: ok,
    voices: targets.map((v) => ({
      voice_id: v.voice_id,
      filename: voiceIdToPreviewFilename(v.voice_id),
      gender: v.gender,
      language: v.language,
    })),
  };
  fs.writeFileSync(path.join(LOCAL_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `[seed-voice-previews] 完成 ok=${ok} skipped=${skipped} failed=${failed} → ${LOCAL_DIR}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[seed-voice-previews] fatal:', error);
  process.exit(1);
});
