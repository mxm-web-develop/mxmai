/**
 * 写作文集单项删除：从 collectionResult 移除并重拼 Markdown / 元数据
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import { getGeneratedBucket } from '../storage/generated-temp';
import type { Task } from '../task/types';
import { taskExecutor } from '../task/task-executor';

export type WritingCollectionItem = {
  id: string;
  order: number;
  title: string;
  name?: string;
  angle?: string;
  status: 'ready' | 'failed';
  error?: string;
  manuscript?: string;
  textPreview?: string;
};

export type WritingCollectionResult = {
  collectionId?: string;
  title?: string;
  itemCount: number;
  items: WritingCollectionItem[];
};

function readCollectionResult(task: Task): WritingCollectionResult | null {
  const fromResult = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = (task.metadata ?? {}) as Record<string, unknown>;
  const raw = fromResult.collectionResult ?? fromMeta.collectionResult;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as WritingCollectionResult).items;
  if (!Array.isArray(items)) return null;
  return raw as WritingCollectionResult;
}

function assembleMarkdown(
  title: string | undefined,
  items: WritingCollectionItem[]
): string {
  const parts: string[] = [];
  if (title?.trim()) {
    parts.push(`# ${title.trim()}`, '');
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const heading = it.title?.trim() || it.name?.trim() || `探索稿 ${i + 1}`;
    parts.push(`## ${heading}`, '');
    if (it.angle?.trim()) {
      parts.push(`> ${it.angle.trim()}`, '');
    }
    const body = typeof it.manuscript === 'string' ? it.manuscript.trim() : '';
    if (body) {
      parts.push(body, '', '---', '');
    } else {
      parts.push(`（本路成稿未生成${it.name ? `：${it.name}` : ''}）`, '', '---', '');
    }
  }
  while (parts.length && (parts[parts.length - 1] === '' || parts[parts.length - 1] === '---')) {
    parts.pop();
  }
  return parts.length ? `${parts.join('\n').trim()}\n` : '';
}

async function uploadMarkdown(args: {
  userId?: string;
  taskId: string;
  markdown: string;
}): Promise<{ key: string; bucket: string; url: string } | undefined> {
  const text = args.markdown?.trim();
  if (!text) return undefined;
  const storageRepo = RepositoryFactory.createStorageRepository();
  const bucket = getGeneratedBucket();
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const uid = args.userId || 'anonymous';
  const key = `${uid}/writing/${timestamp}-${randomStr}.md`;
  await storageRepo.uploadFile(bucket, key, Buffer.from(text, 'utf-8'), {
    contentType: 'text/markdown; charset=utf-8',
    metadata: {
      'user-id': uid,
      format: 'markdown',
      'task-id': args.taskId,
      'word-count': String(text.length),
    },
  });
  const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 60 * 60);
  return { key, bucket, url };
}

export type RemoveCollectionItemResult = {
  itemId: string;
  collectionResult: WritingCollectionResult;
  text: string;
};

export async function removeCollectionItem(args: {
  task: Task;
  itemId: string;
}): Promise<RemoveCollectionItemResult> {
  const { task, itemId } = args;
  const collection = readCollectionResult(task);
  if (!collection) {
    throw new Error('任务不是文集结果（缺少 collectionResult）');
  }

  const itemIndex = collection.items.findIndex((it) => it.id === itemId);
  if (itemIndex < 0) {
    throw new Error(`文集中找不到条目：${itemId}`);
  }

  const remaining = collection.items
    .filter((it) => it.id !== itemId)
    .map((it, idx) => ({ ...it, order: idx }))
    .sort((a, b) => a.order - b.order);

  const ready = remaining.filter((it) => it.status === 'ready' && it.manuscript?.trim()).length;
  const failed = remaining.length - ready;
  const nextCollection: WritingCollectionResult = {
    ...collection,
    collectionId: collection.collectionId || task.id,
    itemCount: remaining.length,
    items: remaining,
  };

  const text = assembleMarkdown(collection.title, remaining);
  const userId =
    typeof (task.metadata as Record<string, unknown>)?.userId === 'string'
      ? String((task.metadata as Record<string, unknown>).userId)
      : undefined;

  const uploaded = await uploadMarkdown({
    userId,
    taskId: task.id,
    markdown: text || '（文集已无文稿）\n',
  });

  const prevMeta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const writingType =
    typeof prevMeta.type === 'string'
      ? prevMeta.type
      : typeof (task.metadata as Record<string, unknown>)?.type === 'string'
        ? String((task.metadata as Record<string, unknown>).type)
        : 'group';

  const collectionMeta: Record<string, unknown> = {
    resultKind: 'writing-collection',
    collectionTitle: collection.title,
    collectionItemCount: remaining.length,
    collectionReadyCount: ready,
    collectionFailedCount: failed,
    collectionResult: nextCollection,
    assembledFromGroup: true,
  };

  const taskManager = taskExecutor.getTaskManager();
  await taskManager.setTaskResult(task.id, {
    mediaUrls: [],
    storageInfo: uploaded
      ? {
          keys: [uploaded.key],
          bucket: uploaded.bucket,
          urls: [uploaded.url],
        }
      : undefined,
    metadata: {
      ...prevMeta,
      type: writingType,
      text,
      format: 'markdown',
      storage_form: 'markdown',
      ...collectionMeta,
    },
  });

  return {
    itemId,
    collectionResult: nextCollection,
    text,
  };
}
