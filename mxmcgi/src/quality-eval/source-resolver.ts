/**
 * 解析评估来源：系统任务 / 知识库条目 / 粘贴正文
 */

import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import { DatabaseTaskStorage } from '../task/database-storage';
import { decodePossiblyMojibakeFilename } from '../utils/filename-encoding';
import { buildPipelineBundle, extractArticleTextFromTask } from './pipeline-bundle';
import { extractEvalRunContextFromTask } from './eval-run-context';
import type { QualityEvalSourceKind, QualityEvalSourceRef, ResolvedSource } from './types';
import { MAX_ARTICLE_CHARS } from './types';

function truncateArticle(text: string): string {
  if (text.length <= MAX_ARTICLE_CHARS) return text;
  return `${text.slice(0, MAX_ARTICLE_CHARS)}\n\n…(正文已截断，原长度 ${text.length} 字)`;
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function loadTaskRecord(taskId: string): Promise<Record<string, unknown>> {
  const storage = new DatabaseTaskStorage();
  const task = await storage.get(taskId, true);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  return task as unknown as Record<string, unknown>;
}

async function tryFetchUrlText(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    return text?.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

async function resolveFromTask(taskId: string, textOverride?: string): Promise<ResolvedSource> {
  const task = await loadTaskRecord(taskId);
  let text = (textOverride || '').trim() || extractArticleTextFromTask(task);
  if (!text) {
    const result = (task.result || {}) as Record<string, unknown>;
    const urls = result.mediaUrls;
    if (Array.isArray(urls) && typeof urls[0] === 'string') {
      const fetched = await tryFetchUrlText(urls[0]);
      if (fetched) text = fetched;
    }
  }
  if (!text.trim()) {
    throw new Error('无法从任务中提取正文，请粘贴正文后重试');
  }
  return {
    text: truncateArticle(text),
    isSystemGenerated: true,
    sourceRef: { taskId },
    taskId,
    pipelineBundle: buildPipelineBundle(task),
    evalRunContext: extractEvalRunContextFromTask(task),
  };
}

/**
 * Admin 质检：按 storage_objects.id 拉文本（不强制归属当前用户）
 */
async function resolveFromStorageObject(
  objectId: string,
  textOverride?: string
): Promise<ResolvedSource> {
  if ((textOverride || '').trim()) {
    return {
      text: truncateArticle(textOverride!.trim()),
      isSystemGenerated: false,
      sourceRef: { storageObjectId: objectId },
    };
  }

  const supabase = getSupabaseClient();
  const { data: obj, error } = await supabase
    .from('storage_objects')
    .select('id, original_name, content_type, bucket, object_key')
    .eq('id', objectId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`读取存储对象失败: ${error.message}`);
  if (!obj) throw new Error(`存储对象不存在: ${objectId}`);

  const title = decodePossiblyMojibakeFilename(obj.original_name as string | null);
  const ct = String(obj.content_type || '').toLowerCase();
  const name = title.toLowerCase();
  const isTextLike =
    ct.startsWith('text/') ||
    ct.includes('markdown') ||
    ct.includes('json') ||
    /\.(txt|md|markdown|csv|json|log|html?)$/i.test(name);

  if (!isTextLike) {
    throw new Error(
      `暂不支持对该文件类型做文本质检（${title || objectId}，类型 ${ct || 'unknown'}）。请粘贴正文后重试。`
    );
  }

  const storageRepo = RepositoryFactory.createStorageRepository();
  const buffer = await storageRepo.downloadFile(String(obj.bucket), String(obj.object_key));
  const text = Buffer.from(buffer as Buffer).toString('utf-8').trim();
  if (!text) {
    throw new Error(`文件内容为空：${title || objectId}`);
  }

  return {
    text: truncateArticle(text),
    isSystemGenerated: false,
    sourceRef: { storageObjectId: objectId },
  };
}

async function lookupFolderItemIds(
  folderId: string,
  itemId: string
): Promise<{ taskId?: string; storageObjectId?: string }> {
  const supabase = getSupabaseClient();

  // 优先按 storage_object_id / task_id 匹配（folder_items 主键未必是单一 id）
  const { data: byObj } = await supabase
    .from('folder_items')
    .select('task_id, storage_object_id')
    .eq('folder_id', folderId)
    .eq('storage_object_id', itemId)
    .maybeSingle();
  if (byObj?.storage_object_id || byObj?.task_id) {
    return {
      taskId: byObj.task_id ? String(byObj.task_id) : undefined,
      storageObjectId: byObj.storage_object_id ? String(byObj.storage_object_id) : undefined,
    };
  }

  const { data: byTask } = await supabase
    .from('folder_items')
    .select('task_id, storage_object_id')
    .eq('folder_id', folderId)
    .eq('task_id', itemId)
    .maybeSingle();
  if (byTask?.storage_object_id || byTask?.task_id) {
    return {
      taskId: byTask.task_id ? String(byTask.task_id) : undefined,
      storageObjectId: byTask.storage_object_id ? String(byTask.storage_object_id) : undefined,
    };
  }

  // 部分 schema 有 folder_items.id
  const { data: byPk, error: pkErr } = await supabase
    .from('folder_items')
    .select('task_id, storage_object_id')
    .eq('folder_id', folderId)
    .eq('id', itemId)
    .maybeSingle();
  if (!pkErr && (byPk?.task_id || byPk?.storage_object_id)) {
    return {
      taskId: byPk.task_id ? String(byPk.task_id) : undefined,
      storageObjectId: byPk.storage_object_id ? String(byPk.storage_object_id) : undefined,
    };
  }

  return {};
}

async function resolveFolderItem(
  sourceRef: QualityEvalSourceRef | null,
  textOverride?: string
): Promise<ResolvedSource> {
  let taskId = sourceRef?.taskId?.trim() || undefined;
  let storageObjectId = sourceRef?.storageObjectId?.trim() || undefined;
  const itemId = sourceRef?.itemId?.trim() || undefined;
  const folderId = sourceRef?.folderId?.trim() || undefined;

  // 禁止把 storage UUID 误当 taskId；仅在明确没有 storageObjectId 时用 itemId 作候选
  if (!taskId && !storageObjectId && itemId && folderId) {
    const looked = await lookupFolderItemIds(folderId, itemId);
    taskId = looked.taskId;
    storageObjectId = looked.storageObjectId;
  }

  if (!taskId && !storageObjectId && itemId && looksLikeUuid(itemId)) {
    // 无 folder 上下文：先试 storage，再试 task
    try {
      return await resolveFromStorageObject(itemId, textOverride);
    } catch (storageErr) {
      try {
        return await resolveFromTask(itemId, textOverride);
      } catch {
        if ((textOverride || '').trim()) {
          return {
            text: truncateArticle(textOverride!.trim()),
            isSystemGenerated: false,
            sourceRef: sourceRef,
          };
        }
        throw storageErr;
      }
    }
  }

  if (storageObjectId) {
    return resolveFromStorageObject(storageObjectId, textOverride);
  }

  if (taskId) {
    try {
      return await resolveFromTask(taskId, textOverride);
    } catch (e) {
      if ((textOverride || '').trim()) {
        return {
          text: truncateArticle(textOverride!.trim()),
          isSystemGenerated: false,
          sourceRef: sourceRef || { taskId },
        };
      }
      throw e;
    }
  }

  if ((textOverride || '').trim()) {
    return {
      text: truncateArticle(textOverride!.trim()),
      isSystemGenerated: false,
      sourceRef,
    };
  }

  throw new Error('知识库条目需要关联任务、上传文件或粘贴正文');
}

export async function resolveSource(args: {
  sourceKind: QualityEvalSourceKind;
  sourceRef?: QualityEvalSourceRef | null;
  text?: string;
}): Promise<ResolvedSource> {
  const { sourceKind, sourceRef, text } = args;

  if (sourceKind === 'paste') {
    const body = (text || '').trim();
    if (!body) throw new Error('粘贴评估需要提供正文 text');
    return {
      text: truncateArticle(body),
      isSystemGenerated: false,
      sourceRef: null,
    };
  }

  if (sourceKind === 'task') {
    const taskId = sourceRef?.taskId;
    if (!taskId) throw new Error('task 来源需要 sourceRef.taskId');
    return resolveFromTask(taskId, text);
  }

  if (sourceKind === 'folder_item') {
    return resolveFolderItem(sourceRef || null, text);
  }

  throw new Error(`未知 sourceKind: ${sourceKind}`);
}
