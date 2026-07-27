/**
 * 调用本地 FunASR Python 脚本做中文 ASR（Paraformer-large + VAD + 标点）
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildSubtitleBundle,
  normalizeFunAsrJson,
  segmentsToFullText,
} from './voiceover-subtitle-normalize';
import type { VoiceoverSubtitleBundle } from './voiceover-subtitle-types';

const DEFAULT_TIMEOUT_MS = Number(process.env.ASR_TIMEOUT_MS) || 600_000;

export function resolveFunAsrScriptPath(): string {
  const fromEnv = process.env.FUNASR_SCRIPT?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    join(process.cwd(), 'scripts/funasr-transcribe.py'),
    join(process.cwd(), 'mxmcgi/scripts/funasr-transcribe.py'),
    join(__dirname, '../../scripts/funasr-transcribe.py'),
    join(__dirname, '../../../scripts/funasr-transcribe.py'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

function resolvePythonBin(): string {
  return (process.env.FUNASR_PYTHON || process.env.ASR_PYTHON || 'python3').trim() || 'python3';
}

function extensionFromMime(mime: string, filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.wav')) return '.wav';
  if (lower.endsWith('.m4a')) return '.m4a';
  if (lower.endsWith('.flac')) return '.flac';
  if (lower.endsWith('.ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  return '.mp3';
}

function extractJsonObjectFromText(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseFunAsrStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonBlob = extractJsonObjectFromText(trimmed);
    if (jsonBlob) {
      try {
        return JSON.parse(jsonBlob) as unknown;
      } catch {
        // fall through
      }
    }
    throw new Error(`无法解析 FunASR 输出：${trimmed.slice(0, 200)}`);
  }
}

async function runFunAsrOnFile(localPath: string): Promise<unknown> {
  const python = resolvePythonBin();
  const script = resolveFunAsrScriptPath();

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, localPath], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`FunASR 超时（${DEFAULT_TIMEOUT_MS}ms）`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `FunASR 启动失败（${python}）：${err.message}。请安装：pip install -r mxmcgi/requirements-asr.txt`
        )
      );
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const errJson = stderr.trim();
        let detail = errJson || stdout.trim();
        try {
          const parsed = JSON.parse(errJson) as { error?: string };
          if (parsed.error) detail = parsed.error;
        } catch {
          // ignore
        }
        reject(new Error(`FunASR 退出码 ${code}${detail ? ` — ${detail.slice(0, 500)}` : ''}`));
        return;
      }
      try {
        resolve(parseFunAsrStdout(stdout));
      } catch (err) {
        reject(
          new Error(
            `FunASR 输出非 JSON：${err instanceof Error ? err.message : stdout.trim().slice(0, 200)}`
          )
        );
      }
    });
  });
}

export async function transcribeAudioBufferWithFunAsr(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<VoiceoverSubtitleBundle> {
  const dir = await mkdtemp(join(tmpdir(), 'mxm-funasr-'));
  const ext = extensionFromMime(mime, filename);
  const localPath = join(dir, `audio${ext}`);
  try {
    await writeFile(localPath, buffer);
    const payload = await runFunAsrOnFile(localPath);
    const segments = normalizeFunAsrJson(payload);
    if (segments.length === 0) {
      throw new Error('FunASR: 未识别到有效语音内容');
    }
    return buildSubtitleBundle('asr', segments, {
      fullText: segmentsToFullText(segments),
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
