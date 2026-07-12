/**
 * 用 ffprobe 探测音频时长（秒）
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function probeLocalPath(localPath: string): Promise<number> {
  const duration = await new Promise<number>((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      localPath,
    ];
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-800)}`));
        return;
      }
      const sec = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(sec) || sec <= 0) {
        reject(new Error(`ffprobe 无效时长: ${stdout.trim()}`));
        return;
      }
      resolve(sec);
    });
  });

  return Math.round(duration * 10) / 10;
}

/** 直接对 URL/路径 ffprobe（仅适用于公网可 GET 的地址） */
export async function probeAudioDurationSeconds(source: string): Promise<number> {
  const url = source.trim();
  if (!url) throw new Error('probeAudioDurationSeconds: empty source');
  return probeLocalPath(url);
}

/**
 * Worker 内探测口播时长：内网 MinIO / Gateway 代理路径先落盘再 ffprobe
 */
export async function probeVoiceoverAudioDurationSeconds(
  source: string,
  opts?: { userId?: string }
): Promise<number> {
  const url = source.trim();
  if (!url) throw new Error('probeVoiceoverAudioDurationSeconds: empty source');

  const { downloadVoiceoverAudioBuffer } = await import('../audio/voiceover-audio-source');
  const { buffer, filename } = await downloadVoiceoverAudioBuffer(url, opts);

  const dir = await mkdtemp(join(tmpdir(), 'mxm-voiceover-probe-'));
  const localPath = join(dir, filename.replace(/[^\w.-]+/g, '_') || 'audio.mp3');
  try {
    await writeFile(localPath, buffer);
    return await probeLocalPath(localPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
