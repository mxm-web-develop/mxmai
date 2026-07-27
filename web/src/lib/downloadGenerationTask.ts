/**
 * 生成任务卡片：下载已完成任务的成果文件
 *
 * 音视频走鉴权直链 + ?download=1，由浏览器原生另存（大文件不进 JS 内存）。
 * 图片仍拉 blob（体积小）。
 */
import {
  downloadWritingExport,
  fetchMediaBlobUrl,
  getAuthenticatedMediaStreamUrl,
  type WritingTaskItem,
} from '../api/client';
import { downloadBlob } from '../utils/createZipBlob';

export type GenerationDownloadKind = 'video' | 'audio' | 'music' | 'graph' | 'writing' | 'outline';

function guessExt(kind: GenerationDownloadKind, contentType?: string | null): string {
  if (kind === 'writing' || kind === 'outline') return 'md';
  if (kind === 'graph') {
    if (contentType?.includes('png')) return 'png';
    if (contentType?.includes('webp')) return 'webp';
    return 'jpg';
  }
  if (kind === 'video') return 'mp4';
  return 'mp3';
}

function triggerBrowserDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadGenerationTask(
  task: WritingTaskItem,
  kind: GenerationDownloadKind
): Promise<void> {
  if (kind === 'writing' || kind === 'outline') {
    await downloadWritingExport(task.id, 'markdown');
    return;
  }

  // 大文件：不要 fetch 整包进内存（成片可达百 MB，会卡在「下载中…」）
  if (kind === 'video' || kind === 'audio' || kind === 'music') {
    const streamUrl = getAuthenticatedMediaStreamUrl(task.id, kind);
    const sep = streamUrl.includes('?') ? '&' : '?';
    const url = `${streamUrl}${sep}download=1`;
    triggerBrowserDownload(url, `${kind}-${task.id}.${guessExt(kind)}`);
    return;
  }

  const blobUrl = await fetchMediaBlobUrl(task.id, kind, {
    delivery: 'blob',
    useCache: false,
    timeoutMs: 60_000,
  });

  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ext = guessExt(kind, blob.type);
  downloadBlob(blob, `${kind}-${task.id}.${ext}`);
}
