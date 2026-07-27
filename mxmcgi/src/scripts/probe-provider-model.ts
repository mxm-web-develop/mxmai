/**
 * Provider 模型冒烟：atlascloud / maxplan（以及其它已注册 Provider）。
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run probe:provider-model -- \
 *     --provider maxplan --model MiniMax-M3
 *   pnpm --filter @mxmai/mxmcgi run probe:provider-model -- \
 *     --provider atlascloud --model google/nano-banana-2 --timeout-ms 180000
 *
 * 退出码：0 成功；1 失败。未通过则禁止把模型当「可用」同步生产。
 */

import { loadMonorepoEnv } from '@mxmai/mxmdata';
import { providerFactory } from '../core/providers';
import {
  loadProviderModelCatalog,
  getByProviderAndModelKey,
} from '../models/provider-model-catalog';
import type { GenerateParams } from '../core/providers';

loadMonorepoEnv({ service: 'mxmcgi' });

type Args = {
  provider: string;
  model: string;
  timeoutMs: number;
  prompt?: string;
};

function parseArgs(argv: string[]): Args {
  const cleaned = argv.filter((a) => a !== '--');
  const out: Args = {
    provider: '',
    model: '',
    timeoutMs: 120_000,
  };
  for (let i = 0; i < cleaned.length; i++) {
    const a = cleaned[i];
    const next = cleaned[i + 1];
    if (a === '--provider' && next) {
      out.provider = next;
      i++;
    } else if (a === '--model' && next) {
      out.model = next;
      i++;
    } else if (a === '--timeout-ms' && next) {
      out.timeoutMs = Number(next) || out.timeoutMs;
      i++;
    } else if (a === '--prompt' && next) {
      out.prompt = next;
      i++;
    } else if (a === '--help' || a === '-h') {
      console.log(
        '用法: --provider <atlascloud|maxplan|...> --model <model_key> [--timeout-ms N] [--prompt ...]',
      );
      process.exit(0);
    }
  }
  if (!out.provider || !out.model) {
    throw new Error(
      '用法: --provider <atlascloud|maxplan|...> --model <model_key> [--timeout-ms N] [--prompt ...]',
    );
  }
  return out;
}

function inferKind(row: {
  scope?: string | null;
  modality?: string | null;
  protocol?: string | null;
}): 'text' | 'image' | 'audio' | 'music' | 'video' {
  const scope = String(row.scope ?? '').toLowerCase();
  const modality = String(row.modality ?? '').toLowerCase();
  const protocol = String(row.protocol ?? '').toLowerCase();
  if (modality === 'video' || scope === 'video' || protocol.includes('video')) return 'video';
  if (modality === 'music' || scope === 'music' || protocol.includes('music')) return 'music';
  if (modality === 'audio' || scope === 'audio' || protocol.includes('t2a') || protocol.includes('speech')) {
    return 'audio';
  }
  if (modality === 'image' || scope === 'graph' || protocol.includes('image')) return 'image';
  return 'text';
}

function buildParams(kind: ReturnType<typeof inferKind>, prompt: string): GenerateParams {
  switch (kind) {
    case 'image':
      return {
        prompt: prompt || 'a simple red apple on a white table, studio photo',
        parameters: { n: 1, aspect_ratio: '1:1' },
      };
    case 'audio':
      return {
        prompt: prompt || '你好，这是一次语音合成测试。',
        parameters: {},
      };
    case 'music':
      return {
        prompt: prompt || 'uplifting indie pop, cheerful acoustic guitar, 30 seconds',
        parameters: { is_instrumental: true },
      };
    case 'video':
      return {
        prompt: prompt || 'a cat walking slowly across a sunny room, cinematic',
        parameters: { duration: 5, resolution: '720p', generate_audio: false },
      };
    default:
      return {
        prompt: prompt || '用一句话介绍你自己。',
        parameters: { max_tokens: 256, temperature: 0.2 },
      };
  }
}

function summarizeResult(r: {
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const text = String(r.metadata?.text ?? '').slice(0, 400);
  const usage = (r.metadata?.usage ?? null) as Record<string, unknown> | null;
  const urls = (r.mediaUrls ?? []).slice(0, 3);
  return {
    textLen: String(r.metadata?.text ?? '').length,
    textPreview: text || undefined,
    mediaCount: (r.mediaUrls ?? []).length,
    mediaPreview: urls,
    usage,
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadProviderModelCatalog();
  await providerFactory.loadProviderCatalog();

  const row = getByProviderAndModelKey(args.provider, args.model);
  if (!row) {
    throw new Error(
      `provider_models 无记录: ${args.provider}/${args.model}（请先 seed 或 Admin 写入物理模型）`,
    );
  }
  if (row.is_enabled === false) {
    console.warn('⚠️  is_enabled=false，仍尝试调用以便诊断');
  }

  const kind = inferKind(row);
  const params = buildParams(kind, args.prompt ?? '');
  console.log(
    JSON.stringify(
      {
        provider: args.provider,
        model: args.model,
        kind,
        scope: row.scope,
        modality: row.modality,
        protocol: row.protocol,
        upstream_model: row.upstream_model,
        timeoutMs: args.timeoutMs,
      },
      null,
      2,
    ),
  );

  const provider = providerFactory.get(args.provider as never);
  if (!provider.supportsModel(args.model)) {
    throw new Error(`supportsModel=false: ${args.provider}/${args.model}`);
  }

  const started = Date.now();
  const result = await withTimeout(provider.generate(args.model, params), args.timeoutMs);
  const summary = summarizeResult(result);
  const okMedia = (result.mediaUrls?.length ?? 0) > 0;
  const okText = String(result.metadata?.text ?? '').trim().length > 0;
  if (kind === 'text' && !okText) {
    throw new Error('文本模型无有效 text 输出');
  }
  if (kind !== 'text' && !okMedia && !okText) {
    throw new Error('生成成功判定失败：无 mediaUrls 且无 text');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        elapsedMs: Date.now() - started,
        ...summary,
      },
      null,
      2,
    ),
  );
  console.log(`\n✅ probe PASS: ${args.provider}/${args.model}`);
}

main().catch((e) => {
  console.error('❌ probe FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
