/** 与后端 minimax-voice-preview voiceIdToPreviewFilename 规则一致 */
export function voiceIdToPreviewFilename(voiceId: string): string {
  const safe = voiceId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${safe || 'voice'}.mp3`;
}

/** 系统音色试听 MP3（点击播放时再请求，不在列表接口返回） */
export function buildMinimaxVoicePreviewUrl(voiceId: string): string {
  return `/api/v1/static/minimax-voice-previews/v1/${voiceIdToPreviewFilename(voiceId)}`;
}

/** 懒加载：仅在用户点击试听时拉取音频 blob */
export async function fetchMinimaxVoicePreviewBlob(voiceId: string): Promise<Blob> {
  const url = buildMinimaxVoicePreviewUrl(voiceId);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`试听不可用 (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob.size || !blob.type.startsWith('audio/')) {
    throw new Error('试听文件无效');
  }
  return blob;
}
