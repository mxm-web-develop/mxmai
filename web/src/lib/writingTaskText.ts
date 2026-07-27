import {
  fetchWritingExportText,
  fetchWritingMediaContent,
  listWritingTasks,
  type WritingTaskItem,
} from '../api/client';
import { extractTextFromFile } from './extractTextFromFile';

export function getWritingTaskDisplayTitle(t: WritingTaskItem): string {
  const labelVal =
    (t.metadata?.label as string)?.trim() ||
    (t.metadata?.writing_type_label as string)?.trim();
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const params = rp?.params as Record<string, unknown> | undefined;
  const promptVal = (params?.prompt as string) || '';
  return (
    labelVal ||
    (promptVal?.trim().length
      ? `${promptVal.slice(0, 40).replace(/\n/g, ' ').trim()}${promptVal.length > 40 ? '…' : ''}`
      : '写作任务')
  );
}

export async function listCompletedWritingTasksForPicker(limit = 80): Promise<WritingTaskItem[]> {
  const res = await listWritingTasks({ status: 'completed', limit, offset: 0 });
  if (res.error) throw new Error(res.error);
  const tasks = res.data?.data?.tasks ?? [];
  return tasks.filter((t) => t.status === 'completed');
}

/** 拉取写作任务正文（优先服务端 export，避免客户端 PDF.js） */
export async function fetchWritingTaskPlainText(taskId: string): Promise<string> {
  const exportErrors: string[] = [];
  for (const format of ['markdown', 'txt'] as const) {
    try {
      const text = await fetchWritingExportText(taskId, format, { timeoutMs: 90_000 });
      if (text) return text;
    } catch (e) {
      exportErrors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const media = await fetchWritingMediaContent(taskId, { timeoutMs: 90_000 });
  if (media.kind === 'text') {
    const text = media.text.trim();
    if (!text) throw new Error('该写作任务内容为空');
    return text;
  }
  try {
    const res = await fetch(media.blobUrl);
    if (!res.ok) throw new Error(`读取 PDF 失败 (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], 'writing.pdf', { type: 'application/pdf' });
    const text = (await extractTextFromFile(file)).trim();
    if (!text) throw new Error('PDF 中未识别到可提取文字');
    return text;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const hint = exportErrors.length ? exportErrors.join('；') : detail;
    throw new Error(`无法获取写作正文：${hint}`);
  } finally {
    media.revoke();
  }
}
