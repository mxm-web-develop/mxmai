/**
 * 管线步骤：dialogueLineTts
 * 对 contract.business.lines（或可配置路径）逐句并发 TTS，按 cast.voice_id 选音色，
 * 回写 audio_url / duration_ms / subtitles。
 *
 * params:
 * - linesFrom: 默认 contract.business.lines
 * - castFrom: 默认 contract.business.cast
 * - textField: 优先 tts_markup，回退 text（默认）
 * - concurrency / maxItems
 * - model / speedFrom: broadcast_style
 */
import { randomUUID } from 'node:crypto';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import {
  ensureTtsEdgePauses,
  BROADCAST_STYLE_SPEED,
  resolveTtsSubtitleApiParams,
} from './audio-tts-params';
import { probeVoiceoverAudioDurationSeconds } from '../core/video-edit/audio-probe';
import { getFirstProviderKey } from '../core/providers/provider-keys';
import { normalizeClientAccessibleMediaUrl } from '../core/audio/voiceover-audio-source';

const DEFAULT_MAX = 120;
const HARD_MAX = 200;
const DEFAULT_CONCURRENCY = 2;
const HARD_CONCURRENCY = 4;
const DEFAULT_BASE_URL = 'https://api.minimaxi.com';
const DEFAULT_MODEL = 'speech-2.8-hd';
const TTS_MAX_ATTEMPTS = 8;

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function writeByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.').filter(Boolean);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    if (!cur[seg] || typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function resolveVoiceIdFromCast(
  cast: Array<Record<string, unknown>>,
  speakerId: string | undefined
): string {
  if (!speakerId) {
    const first = cast[0];
    return resolveVoiceFromEntry(first);
  }
  const hit =
    cast.find((c) => String(c.id ?? '').trim() === speakerId) ||
    cast.find((c) => String(c.name ?? '').trim() === speakerId);
  return resolveVoiceFromEntry(hit);
}

function resolveVoiceFromEntry(entry: Record<string, unknown> | undefined): string {
  if (!entry) return 'female-shaonv';
  const voice = entry.voice;
  if (voice && typeof voice === 'object' && !Array.isArray(voice)) {
    const vid = (voice as { voice_id?: string }).voice_id;
    if (typeof vid === 'string' && vid.trim()) return vid.trim();
  }
  if (typeof entry.voice_id === 'string' && entry.voice_id.trim()) return entry.voice_id.trim();
  return 'female-shaonv';
}

function resolveSpeed(params: Record<string, unknown>, ctxParams: Record<string, unknown>): number {
  const speedRaw = params.speed ?? ctxParams.speed;
  if (typeof speedRaw === 'number' && Number.isFinite(speedRaw)) {
    return Math.min(2, Math.max(0.5, speedRaw));
  }
  const style = String(params.broadcast_style ?? ctxParams.broadcast_style ?? '').trim();
  return BROADCAST_STYLE_SPEED[style] ?? 1.2;
}

/** 口播物理模型：勿误用 Warp 文本模型（如 MiniMax-M3） */
function resolveDialogueTtsModel(
  stepParams: Record<string, unknown>,
  ctxParams: Record<string, unknown>
): string {
  const isSpeechModel = (m: string) =>
    /^speech[-_0-9]/i.test(m) || /t2a/i.test(m) || /^tts/i.test(m);

  const prefer = [
    stepParams.model,
    stepParams.tts_model,
    ctxParams.tts_model,
    ctxParams.audio_model,
  ];
  for (const c of prefer) {
    const m = String(c ?? '').trim();
    if (m) return m;
  }

  const generic = String(ctxParams.model ?? '').trim();
  if (generic && isSpeechModel(generic)) return generic;

  return DEFAULT_MODEL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableTtsError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('rpm') ||
    m.includes('too many requests') ||
    m.includes('timeout') ||
    m.includes('temporar')
  );
}

async function synthesizeLineMp3(args: {
  text: string;
  voiceId: string;
  model: string;
  speed: number;
  apiKey: string;
}): Promise<{ buffer: Buffer; subtitleFile?: string; audioLengthMs?: number }> {
  const base = (process.env.MAXPLAN_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const subtitle = resolveTtsSubtitleApiParams(args.model, { subtitle_enable: true });
  const body: Record<string, unknown> = {
    model: args.model,
    text: args.text,
    stream: false,
    voice_setting: {
      voice_id: args.voiceId,
      speed: args.speed,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      format: 'mp3',
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1,
    },
  };
  if (subtitle.subtitle_enable) {
    body.subtitle_enable = true;
    if (subtitle.subtitle_type) body.subtitle_type = subtitle.subtitle_type;
  }

  let lastErr = 'dialogueLineTts：未知错误';
  for (let attempt = 1; attempt <= TTS_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${base}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      data?: { audio?: string; subtitle_file?: string };
      extra_info?: { audio_length?: number };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (!res.ok) {
      lastErr = `dialogueLineTts HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`;
      if (attempt < TTS_MAX_ATTEMPTS && (res.status === 429 || res.status >= 500)) {
        await sleep(800 * attempt);
        continue;
      }
      throw new Error(lastErr);
    }
    const code = json.base_resp?.status_code;
    const msg = String(json.base_resp?.status_msg ?? code ?? '').trim();
    if (code != null && Number(code) !== 0) {
      lastErr = `dialogueLineTts 失败: ${msg || code}`;
      if (attempt < TTS_MAX_ATTEMPTS && isRetryableTtsError(msg)) {
        await sleep(Math.min(12_000, 1500 * attempt * attempt));
        continue;
      }
      throw new Error(lastErr);
    }
    const hex = json.data?.audio;
    if (!hex || typeof hex !== 'string') {
      throw new Error('dialogueLineTts：未返回 audio');
    }
    return {
      buffer: Buffer.from(hex.replace(/\s/g, ''), 'hex'),
      subtitleFile:
        typeof json.data?.subtitle_file === 'string' ? json.data.subtitle_file.trim() : undefined,
      audioLengthMs:
        json.extra_info?.audio_length != null ? Number(json.extra_info.audio_length) : undefined,
    };
  }
  throw new Error(lastErr);
}

export async function runDialogueLineTtsStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) throw new ConfigurationError('dialogueLineTts：缺少 userId');

  const params = (step.params ?? {}) as Record<string, unknown>;
  const linesFrom = String(params.linesFrom ?? 'contract.business.lines').trim();
  const castFrom = String(params.castFrom ?? 'contract.business.cast').trim();
  const textField = String(params.textField ?? 'tts_markup').trim() || 'tts_markup';

  const contract = ctx.state.contract as Record<string, unknown> | undefined;
  if (!contract) throw new ConfigurationError('dialogueLineTts：缺少 state.contract');

  const linesPath = linesFrom.startsWith('contract.')
    ? linesFrom.slice('contract.'.length)
    : linesFrom.startsWith('state.')
      ? null
      : linesFrom;
  const rawLines = linesFrom.startsWith('state.')
    ? readByPath(ctx.state, linesFrom.slice('state.'.length))
    : readByPath(contract, linesPath!);

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new ConfigurationError(`dialogueLineTts：${linesFrom} 为空`);
  }

  const castRaw = castFrom.startsWith('contract.')
    ? readByPath(contract, castFrom.slice('contract.'.length))
    : castFrom.startsWith('params.')
      ? readByPath(ctx.params, castFrom.slice('params.'.length))
      : readByPath(contract, castFrom);
  const cast = Array.isArray(castRaw)
    ? (castRaw as Record<string, unknown>[])
    : [];

  const maxItems = Math.min(
    HARD_MAX,
    Math.max(1, Math.floor(Number(params.maxItems ?? DEFAULT_MAX)) || DEFAULT_MAX)
  );
  const concurrency = Math.min(
    HARD_CONCURRENCY,
    Math.max(1, Math.floor(Number(params.concurrency ?? DEFAULT_CONCURRENCY)) || DEFAULT_CONCURRENCY)
  );

  const lines = cloneJson(rawLines.slice(0, maxItems)) as Record<string, unknown>[];
  const model = resolveDialogueTtsModel(params, ctx.params as Record<string, unknown>);
  const speed = resolveSpeed(params, ctx.params as Record<string, unknown>);
  const apiKey = await getFirstProviderKey('maxplan');
  if (!apiKey?.trim()) {
    throw new ConfigurationError('dialogueLineTts：maxplan API Key 未配置');
  }

  const storage = RepositoryFactory.getStorageService();
  const taskId = ctx.taskId || randomUUID();

  const results = await mapPool(lines, concurrency, async (item, index) => {
    const id = String(item.id ?? `L${index + 1}`).trim();
    const speakerId = String(item.speakerId ?? item.speaker_id ?? '').trim() || undefined;
    const rawText =
      String(item[textField] ?? item.tts_markup ?? item.text ?? '').trim() ||
      '';
    if (!rawText) {
      throw new Error(`line「${id}」缺少合成文本`);
    }
    // 多人对话：保留 enrich 已写的短停顿，勿抬到口播默认 0.8s（会冲掉抢词/紧凑接话）
    const edgeRaw = params.edgePauseSeconds;
    const text =
      edgeRaw === undefined || edgeRaw === null || edgeRaw === false
        ? rawText
        : ensureTtsEdgePauses(rawText, Number(edgeRaw) || 0.8);
    const voiceId = resolveVoiceIdFromCast(cast, speakerId);
    const syn = await synthesizeLineMp3({
      text,
      voiceId,
      model,
      speed,
      apiKey: apiKey.trim(),
    });

    const stored = await storage.upload({
      domain: 'generated',
      purpose: 'audio_line',
      buffer: syn.buffer,
      contentType: 'audio/mpeg',
      userId,
      pathVars: {
        scope: 'audio',
        userId,
        taskId,
        index: `${index}-${id}`,
        ext: 'mp3',
      },
    });

    const audioUrl = normalizeClientAccessibleMediaUrl(stored.url || '');
    let durationMs =
      syn.audioLengthMs != null && Number.isFinite(syn.audioLengthMs)
        ? Math.round(syn.audioLengthMs)
        : 0;
    if (durationMs <= 0 && audioUrl) {
      try {
        const sec = await probeVoiceoverAudioDurationSeconds(audioUrl, { userId });
        durationMs = Math.round(sec * 1000);
      } catch {
        durationMs = Math.max(500, Math.round(text.length * 80));
      }
    }

    item.id = id;
    item.audio_url = audioUrl || stored.url;
    item.duration_ms = durationMs;
    item.voice_id = voiceId;
    if (syn.subtitleFile) {
      item.subtitle_file = syn.subtitleFile;
    }
    return { id, ok: true as const };
  });

  const nextContract = cloneJson(contract);
  if (linesFrom.startsWith('contract.')) {
    writeByPath(nextContract, linesFrom.slice('contract.'.length), lines);
  }

  return {
    ...ctx,
    params: {
      ...ctx.params,
      dialogue_line_tts_count: results.length,
    },
    state: {
      ...ctx.state,
      contract: nextContract,
      dialogueLineTtsResult: {
        count: results.length,
        linesFrom,
      },
    },
  };
}
