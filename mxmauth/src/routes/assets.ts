/**
 * 资源管理相关路由（文件夹管理）
 * upload = 上传管理器目录树；virtual = 虚拟文件夹软链树
 */

import '../config/loadEnv';
import { Router } from 'express';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type { Folder, FolderIndexEntry, FolderKind, PromptEngineeringConfig } from '@mxmai/mxmdata';
import { authMiddleware } from '../middleware/auth';
import { NotFoundError, DuplicateError, DataAccessError } from '@mxmai/mxmdata';

const router = Router();
const folderRepo = RepositoryFactory.createFolderRepository();
const supabase = getSupabaseClient();

function cleanAndValidateUUID(id: string | undefined): string | null {
  if (!id) return null;
  const cleaned = id.trim().replace(/^["']+|["']+$/g, '');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(cleaned) ? cleaned : null;
}

function parseFolderKind(raw: unknown): FolderKind {
  return raw === 'virtual' ? 'virtual' : 'upload';
}

async function assertFolderAccess(userId: string, folderId: string): Promise<Folder> {
  const folder = await folderRepo.getFolderById(folderId);
  if (!folder) {
    throw new NotFoundError('Folder', folderId);
  }
  if (folder.user_id !== userId) {
    throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
  }
  return folder;
}

function indexEntryStatusFor(
  entries: FolderIndexEntry[],
  refType: 'task' | 'storage_object',
  refId: string
): string {
  const hit = entries.find((e) => e.ref_type === refType && e.ref_id === refId);
  return hit?.status ?? 'pending';
}

/**
 * 把 taskType 映射到与生成列表呼应的稳定业务标签（与 web src/i18n/zh/assets.ts 同步）。
 * 这是兜底，绝不会暴露 prompt 字符串。
 */
const TASK_TYPE_BUSINESS_LABELS: Record<string, string> = {
  audio: '音频',
  music: '音乐',
  video: '视频',
  graph: '图片',
  image: '图片',
  writing: '写作',
  text: '文本',
};

function businessLabelByTaskType(taskType: string | undefined | null): string {
  return TASK_TYPE_BUSINESS_LABELS[taskType ?? ''] ?? '任务';
}

function shortId(id: string, head = 8): string {
  return id.length >= head ? id.slice(0, head) : id;
}

/**
 * 从 admin 业务配置中提取对外可读 label。
 * 缺历史 extra.display 也安全返回 {}，链路回退到 taskKey。
 */
function readBusinessLabels(row: PromptEngineeringConfig | null): {
  taskLabel: string | null;
  subtypeLabel: string | null;
} {
  if (!row) return { taskLabel: null, subtypeLabel: null };
  const extra = row.extra && typeof row.extra === 'object' ? (row.extra as Record<string, unknown>) : null;
  const display = extra && typeof extra.display === 'object' ? (extra.display as Record<string, unknown>) : null;
  if (!display) return { taskLabel: null, subtypeLabel: null };
  return {
    taskLabel: typeof display.taskLabel === 'string' && display.taskLabel.trim() ? display.taskLabel.trim() : null,
    subtypeLabel:
      typeof display.subtypeLabel === 'string' && display.subtypeLabel.trim() ? display.subtypeLabel.trim() : null,
  };
}

type TaskV2Identity = { scope: string; taskKey: string; subtype: string | null };

function readTaskV2(meta: Record<string, unknown>): TaskV2Identity | null {
  const tv = meta.taskV2;
  if (!tv || typeof tv !== 'object') return null;
  const o = tv as Record<string, unknown>;
  const scope = typeof o.scope === 'string' ? o.scope.trim() : '';
  const taskKey = typeof o.taskKey === 'string' ? o.taskKey.trim() : '';
  if (!scope || !taskKey) return null;
  const subtype =
    typeof o.subtype === 'string' && o.subtype.trim() ? o.subtype.trim() : null;
  return { scope, taskKey, subtype };
}

/**
 * 批量查 admin 业务配置表（PromptEngineeringConfig），把 link 的 taskV2 身份映射为对外可读 label。
 * 历史配置缺 extra.display 时返回 null，回退到 taskKey/业务标签。
 */
async function batchResolveBusinessLabels(
  identities: TaskV2Identity[]
): Promise<Map<string, { taskLabel: string | null; subtypeLabel: string | null; fullConfig: PromptEngineeringConfig | null }>> {
  const map = new Map<string, { taskLabel: string | null; subtypeLabel: string | null; fullConfig: PromptEngineeringConfig | null }>();
  if (identities.length === 0) return map;
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const uniq = new Map<string, TaskV2Identity>();
  for (const id of identities) {
    uniq.set(`${id.scope}|${id.taskKey}|${id.subtype ?? ''}`, id);
  }
  await Promise.all(
    [...uniq.values()].map(async (id) => {
      const key = `${id.scope}|${id.taskKey}|${id.subtype ?? ''}`;
      let full: PromptEngineeringConfig | null = null;
      try {
        full = (await repo.findByKey(id.scope, id.taskKey, id.subtype)) as PromptEngineeringConfig | null;
      } catch {
        full = null;
      }
      const labels = readBusinessLabels(full);
      map.set(key, { ...labels, fullConfig: full });
    })
  );
  return map;
}

/**
 * 派生 link.name（用户对外可见的标题）：
 *   1. metadata.title 显式用户标题（如有）
 *   2. admin 业务配置 taskLabel · subtypeLabel（与生成列表 taskLabel 对齐）
 *   3. taskKey（系统标识）· 业务标签
 *   4. 业务标签 + #短码（兜底，绝不返 prompt）
 */
function deriveLinkNameForTask(
  task: Record<string, unknown>,
  labelMap: Map<string, { taskLabel: string | null; subtypeLabel: string | null; fullConfig: PromptEngineeringConfig | null }>
): {
  name: string;
  taskV2: TaskV2Identity | null;
  promptForAudit: string | null;
  taskLabel: string | null;
  subtypeLabel: string | null;
  userTitle: string;
} {
  const taskId = String(task.id);
  const meta = (task.metadata && typeof task.metadata === 'object'
    ? (task.metadata as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const id = readTaskV2(meta);
  // 任务「名字」存的是 metadata.label（与 mxmcgi extractRequestLabelFromParams / web getTaskTitle 一致）；
  // metadata.title 不写入，写它会拿到空字符串，永远回退到 admin label。
  const userTitle = typeof meta.label === 'string' && meta.label.trim() ? meta.label.trim() : '';
  const promptRaw = typeof task.prompt === 'string' ? task.prompt : '';

  // 1) 用户标题最优先
  if (userTitle) {
    return {
      name: userTitle,
      taskV2: id,
      promptForAudit: promptRaw,
      taskLabel: null,
      subtypeLabel: null,
      userTitle,
    };
  }
  // 2) admin label
  if (id) {
    const labels = labelMap.get(`${id.scope}|${id.taskKey}|${id.subtype ?? ''}`);
    const taskLabel = labels?.taskLabel ?? null;
    const subtypeLabel = labels?.subtypeLabel ?? null;
    if (taskLabel && subtypeLabel) {
      return {
        name: `${taskLabel} · ${subtypeLabel}`,
        taskV2: id,
        promptForAudit: promptRaw,
        taskLabel,
        subtypeLabel,
        userTitle: '',
      };
    }
    if (taskLabel) {
      return {
        name: taskLabel,
        taskV2: id,
        promptForAudit: promptRaw,
        taskLabel,
        subtypeLabel: null,
        userTitle: '',
      };
    }
    // 3) tech id + 业务兜底标签
    const tech =
      id.subtype && id.subtype !== id.taskKey
        ? `${id.taskKey}/${id.subtype}`
        : id.taskKey;
    return {
      name: `${tech} #${shortId(taskId)}`,
      taskV2: id,
      promptForAudit: promptRaw,
      taskLabel: null,
      subtypeLabel: null,
      userTitle: '',
    };
  }
  // 4) 纯兜底：业务标签 + 短码
  return {
    name: `${businessLabelByTaskType(String(task.task_type ?? ''))} #${shortId(taskId)}`,
    taskV2: null,
    promptForAudit: promptRaw,
    taskLabel: null,
    subtypeLabel: null,
    userTitle: '',
  };
}

router.get('/folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parentId = req.query.parent_id as string | undefined;
    const folderKind = parseFolderKind(req.query.folder_kind);

    const folders = await folderRepo.getFolders(userId, {
      parent_id: parentId === '' || parentId === undefined ? undefined : parentId === 'null' ? null : parentId,
      folder_kind: folderKind,
    });

    const folderList = Array.isArray(folders) ? folders : [];

    res.json({
      code: 200,
      message: '获取文件夹列表成功',
      data: { folders: folderList, total: folderList.length },
    });
  } catch (error: unknown) {
    if (error instanceof DataAccessError && error.message?.includes('Could not find the table')) {
      return res.json({ code: 200, message: '获取文件夹列表成功', data: { folders: [], total: 0 } });
    }
    next(error);
  }
});

router.post('/folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, parent_id, folder_kind } = req.body;
    const folderKind = parseFolderKind(folder_kind);

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ code: 400, message: '文件夹名称不能为空', error: 'VALIDATION_ERROR' });
    }

    if (parent_id) {
      const parentFolder = await folderRepo.getFolderById(parent_id);
      if (!parentFolder) {
        return res.status(404).json({ code: 404, message: '父文件夹不存在', error: 'NOT_FOUND' });
      }
      if (parentFolder.user_id !== userId) {
        return res.status(403).json({ code: 403, message: '无权限访问父文件夹', error: 'PERMISSION_DENIED' });
      }
      if (parentFolder.folder_kind !== folderKind) {
        return res.status(400).json({
          code: 400,
          message: '父文件夹类型与当前 folder_kind 不一致',
          error: 'VALIDATION_ERROR',
        });
      }
    }

    const folder = await folderRepo.createFolder(userId, {
      name: name.trim(),
      parent_id: parent_id || null,
      folder_kind: folderKind,
    });

    res.status(201).json({ code: 201, message: '创建文件夹成功', data: folder });
  } catch (error) {
    if (error instanceof DuplicateError) {
      return res.status(409).json({ code: 409, message: '文件夹名称已存在', error: 'DUPLICATE_ERROR' });
    }
    next(error);
  }
});

router.put('/folders/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: `无效的文件夹 ID: ${req.params.id}`, error: 'VALIDATION_ERROR' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ code: 400, message: '文件夹名称不能为空', error: 'VALIDATION_ERROR' });
    }

    const folder = await folderRepo.updateFolder(userId, folderId, { name: name.trim() });
    res.json({ code: 200, message: '更新文件夹成功', data: folder });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ code: 404, message: '文件夹不存在', error: 'NOT_FOUND' });
    }
    if (error instanceof DuplicateError) {
      return res.status(409).json({ code: 409, message: '文件夹名称已存在', error: 'DUPLICATE_ERROR' });
    }
    if (error instanceof DataAccessError && error.type === 'PERMISSION_ERROR') {
      return res.status(403).json({ code: 403, message: '无权限操作此文件夹', error: 'PERMISSION_DENIED' });
    }
    next(error);
  }
});

router.delete('/folders/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: `无效的文件夹 ID: ${req.params.id}`, error: 'VALIDATION_ERROR' });
    }

    await folderRepo.deleteFolder(userId, folderId);
    res.json({ code: 200, message: '删除文件夹成功' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ code: 404, message: '文件夹不存在', error: 'NOT_FOUND' });
    }
    if (error instanceof DataAccessError) {
      if (error.type === 'PERMISSION_ERROR') {
        return res.status(403).json({ code: 403, message: '无权限操作此文件夹', error: 'PERMISSION_DENIED' });
      }
      if (error.type === 'VALIDATION_ERROR') {
        return res.status(400).json({
          code: 400,
          message: error.message || '无法删除包含子文件夹的文件夹',
          error: 'VALIDATION_ERROR',
        });
      }
    }
    next(error);
  }
});

router.get('/folders/:id/path', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: '无效的文件夹 ID', error: 'VALIDATION_ERROR' });
    }

    await assertFolderAccess(userId, folderId);
    const path = await folderRepo.getFolderPath(folderId);

    res.json({ code: 200, message: '获取文件夹路径成功', data: { path } });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ code: 404, message: '文件夹不存在', error: 'NOT_FOUND' });
    }
    if (error instanceof DataAccessError && error.type === 'PERMISSION_ERROR') {
      return res.status(403).json({ code: 403, message: '无权限访问此文件夹', error: 'PERMISSION_DENIED' });
    }
    next(error);
  }
});

router.get('/items/:taskId/folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { taskId } = req.params;
    const folderKind = req.query.folder_kind ? parseFolderKind(req.query.folder_kind) : undefined;

    const { data: task } = await supabase.from('cgi_tasks').select('user_id').eq('id', taskId).single();
    if (!task || task.user_id !== userId) {
      return res.status(404).json({ code: 404, message: '任务不存在', error: 'NOT_FOUND' });
    }

    const folders = await folderRepo.getItemFolders(taskId, folderKind);
    res.json({ code: 200, message: '获取任务所属文件夹成功', data: { folders } });
  } catch (error) {
    next(error);
  }
});

router.get('/storage-objects/:objectId/virtual-folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const objectId = cleanAndValidateUUID(req.params.objectId);
    if (!objectId) {
      return res.status(400).json({ code: 400, message: '无效的对象 ID', error: 'VALIDATION_ERROR' });
    }

    const { data: obj } = await supabase
      .from('storage_objects')
      .select('user_id')
      .eq('id', objectId)
      .is('deleted_at', null)
      .single();

    if (!obj || obj.user_id !== userId) {
      return res.status(404).json({ code: 404, message: '存储对象不存在', error: 'NOT_FOUND' });
    }

    const folders = await folderRepo.getStorageObjectVirtualFolders(objectId);
    res.json({ code: 200, message: '获取虚拟文件夹引用成功', data: { folders } });
  } catch (error) {
    next(error);
  }
});

router.get('/folders/:id/items', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: `无效的文件夹 ID: ${req.params.id}`, error: 'VALIDATION_ERROR' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const folder = await assertFolderAccess(userId, folderId);
    const isVirtual = folder.folder_kind === 'virtual';

    const indexEntries = isVirtual ? await folderRepo.getFolderIndexEntries(folderId) : [];

    const subFolderRows = await folderRepo.getFolders(userId, {
      parent_id: folderId,
      folder_kind: folder.folder_kind,
    });

    const subFolders = subFolderRows.map((f) => ({
      type: 'dir' as const,
      id: f.id,
      name: f.name,
      parent_id: f.parent_id,
      folder_kind: f.folder_kind,
      index_status: f.index_status ?? 'none',
      indexed_at: f.indexed_at,
      knowledge_base_id: f.knowledge_base_id,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));

    const folderItems = await folderRepo.getFolderItems(folderId, { limit, offset });
    const linkItems: Record<string, unknown>[] = [];

    const taskIds = folderItems.map((i) => i.task_id).filter((id): id is string => !!id);
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('cgi_tasks')
        .select('id, user_id, task_type, status, prompt, created_at, metadata, output_data')
        .in('id', taskIds)
        .eq('user_id', userId)
        .is('deleted_at', null);

      const taskMap = new Map((tasks || []).map((t: Record<string, unknown>) => [String(t.id), t]));

      // 1) 解析所有 link 的 taskV2 身份，批量查 admin 业务配置 label
      const identities: TaskV2Identity[] = [];
      for (const task of tasks || []) {
        const meta = (task.metadata as Record<string, unknown>) || {};
        const id = readTaskV2(meta);
        if (id) identities.push(id);
      }
      const labelMap = await batchResolveBusinessLabels(identities);

      for (const item of folderItems.filter((i) => i.task_id)) {
        const taskId = item.task_id!;
        const task = taskMap.get(taskId);
        if (!task) {
          // 软链失效，无法定位 cgi_tasks；走兜底（业务标签+短码）
          linkItems.push({
            type: 'link',
            ref_type: 'task',
            id: taskId,
            task_id: taskId,
            name: `${businessLabelByTaskType(undefined)} #${shortId(taskId)}`,
            broken: true,
            index_entry_status: isVirtual ? indexEntryStatusFor(indexEntries, 'task', taskId) : undefined,
            link_created_at: item.created_at,
            created_at: item.created_at,
          });
          continue;
        }
        const { name, taskV2, promptForAudit, taskLabel, subtypeLabel, userTitle } = deriveLinkNameForTask(task, labelMap);
        // 写作任务的 prompt（角色指令）不应出现在对外 link.name，已由 deriveLinkNameForTask 派生产物替代。
        // 元数据中仍保留 prompt，前端可作为附注；前端默认不再用其作为展示标题。
        const metaOut: Record<string, unknown> = {};
        if (taskV2) metaOut.taskV2 = taskV2;
        if (promptForAudit && taskV2) {
          metaOut.prompt = promptForAudit;
        }
        // 把任务名（用户在表单填的 label）透传给前端，与「我的创作」列表显示完全一致。
        if (userTitle) metaOut.label = userTitle;
        // 把业务标签一起透传给前端，与「我的创作」列表保持一致字段，避免用户混淆。
        if (taskLabel) metaOut.taskLabel = taskLabel;
        if (subtypeLabel) metaOut.subtypeLabel = subtypeLabel;
        linkItems.push({
          type: 'link',
          ref_type: 'task',
          id: taskId,
          task_id: taskId,
          name,
          task_type: task.task_type,
          status: task.status,
          metadata: Object.keys(metaOut).length ? metaOut : undefined,
          broken: false,
          index_entry_status: isVirtual ? indexEntryStatusFor(indexEntries, 'task', taskId) : undefined,
          link_created_at: item.created_at,
          created_at: task.created_at,
        });
      }
    }

    const objectIds = folderItems
      .map((i) => i.storage_object_id)
      .filter((id): id is string => !!id);

    if (objectIds.length > 0) {
      const { data: objects } = await supabase
        .from('storage_objects')
        .select('id, user_id, original_name, content_type, object_key, metadata, created_at')
        .in('id', objectIds)
        .eq('user_id', userId)
        .is('deleted_at', null);

      const objMap = new Map((objects || []).map((o: Record<string, unknown>) => [String(o.id), o]));

      for (const item of folderItems.filter((i) => i.storage_object_id)) {
        const objectId = item.storage_object_id!;
        const obj = objMap.get(objectId);
        if (obj) {
          const objMeta = (obj.metadata as Record<string, unknown>) || {};
          const isVoiceAsset = objMeta.asset_type === 'minimax_voice';
          linkItems.push({
            type: 'link',
            ref_type: 'storage_object',
            id: objectId,
            object_id: objectId,
            name: isVoiceAsset
              ? String(objMeta.label || objMeta.voice_id || obj.original_name || `音色 ${objectId.substring(0, 8)}`)
              : (obj.original_name as string) || `文件 ${objectId.substring(0, 8)}`,
            content_type: obj.content_type,
            metadata: isVoiceAsset
              ? {
                  asset_type: 'minimax_voice',
                  voice_id: objMeta.voice_id,
                  label: objMeta.label,
                  mode: objMeta.mode,
                  model: objMeta.model,
                  demo_audio: objMeta.demo_audio,
                }
              : undefined,
            broken: false,
            index_entry_status: isVirtual ? indexEntryStatusFor(indexEntries, 'storage_object', objectId) : undefined,
            link_created_at: item.created_at,
            created_at: obj.created_at,
          });
        } else {
          linkItems.push({
            type: 'link',
            ref_type: 'storage_object',
            id: objectId,
            object_id: objectId,
            name: `文件 ${objectId.substring(0, 8)}`,
            broken: true,
            index_entry_status: isVirtual ? indexEntryStatusFor(indexEntries, 'storage_object', objectId) : undefined,
            link_created_at: item.created_at,
            created_at: item.created_at,
          });
        }
      }
    }

    const allItems = [...subFolders, ...linkItems].sort((a, b) => {
      const timeA = new Date(String(a.created_at || 0)).getTime();
      const timeB = new Date(String(b.created_at || 0)).getTime();
      return timeB - timeA;
    });

    const totalFiles = await folderRepo.getFolderItemCount(folderId);

    res.json({
      code: 200,
      message: '获取文件夹内容成功',
      data: {
        folder: {
          id: folder.id,
          name: folder.name,
          folder_kind: folder.folder_kind,
          index_status: folder.index_status ?? 'none',
          indexed_at: folder.indexed_at,
          knowledge_base_id: folder.knowledge_base_id,
        },
        items: allItems,
        total: subFolders.length + totalFiles,
        folders_count: subFolders.length,
        links_count: totalFiles,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ code: 404, message: '文件夹不存在', error: 'NOT_FOUND' });
    }
    if (error instanceof DataAccessError && error.type === 'PERMISSION_ERROR') {
      return res.status(403).json({ code: 403, message: '无权限访问此文件夹', error: 'PERMISSION_DENIED' });
    }
    next(error);
  }
});

router.post('/folders/:id/items', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: `无效的文件夹 ID: ${req.params.id}`, error: 'VALIDATION_ERROR' });
    }

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ code: 400, message: '请求体不能为空', error: 'VALIDATION_ERROR' });
    }

    const { task_id, storage_object_id } = req.body;
    const folder = await assertFolderAccess(userId, folderId);

    if (folder.folder_kind !== 'virtual') {
      return res.status(400).json({
        code: 400,
        message: '仅虚拟文件夹支持软链添加，上传管理器请使用 storage move API',
        error: 'VALIDATION_ERROR',
      });
    }

    if (task_id && storage_object_id) {
      return res.status(400).json({
        code: 400,
        message: 'task_id 与 storage_object_id 不能同时提供',
        error: 'VALIDATION_ERROR',
      });
    }

    if (task_id && typeof task_id === 'string') {
      const { data: task, error: taskError } = await supabase
        .from('cgi_tasks')
        .select('id, user_id')
        .eq('id', task_id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

      if (taskError || !task) {
        return res.status(404).json({
          code: 404,
          message: `未找到任务 "${task_id}"`,
          error: 'NOT_FOUND',
        });
      }

      await folderRepo.addItemToFolder(folderId, task_id);
      return res.status(201).json({ code: 201, message: '添加任务软链成功' });
    }

    if (storage_object_id && typeof storage_object_id === 'string') {
      const objectId = cleanAndValidateUUID(storage_object_id);
      if (!objectId) {
        return res.status(400).json({ code: 400, message: '无效的 storage_object_id', error: 'VALIDATION_ERROR' });
      }

      const { data: obj, error: objError } = await supabase
        .from('storage_objects')
        .select('id, user_id')
        .eq('id', objectId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

      if (objError || !obj) {
        return res.status(404).json({ code: 404, message: '存储对象不存在', error: 'NOT_FOUND' });
      }

      await folderRepo.addStorageObjectToFolder(folderId, objectId);
      return res.status(201).json({ code: 201, message: '添加上传资产软链成功' });
    }

    return res.status(400).json({
      code: 400,
      message: '请提供 task_id 或 storage_object_id',
      error: 'VALIDATION_ERROR',
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/folders/:id/items/:refId', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    if (!folderId) {
      return res.status(400).json({ code: 400, message: `无效的文件夹 ID: ${req.params.id}`, error: 'VALIDATION_ERROR' });
    }

    const refId = req.params.refId;
    const refType = req.query.ref_type === 'storage_object' ? 'storage_object' : 'task';

    await assertFolderAccess(userId, folderId);

    if (refType === 'storage_object') {
      const objectId = cleanAndValidateUUID(refId);
      if (!objectId) {
        return res.status(400).json({ code: 400, message: '无效的对象 ID', error: 'VALIDATION_ERROR' });
      }
      await folderRepo.removeStorageObjectFromFolder(folderId, objectId);
    } else {
      await folderRepo.removeItemFromFolder(folderId, refId);
    }

    res.json({ code: 200, message: '移除软链成功' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ code: 404, message: '文件夹不存在', error: 'NOT_FOUND' });
    }
    if (error instanceof DataAccessError && error.type === 'PERMISSION_ERROR') {
      return res.status(403).json({ code: 403, message: '无权限操作此文件夹', error: 'PERMISSION_DENIED' });
    }
    next(error);
  }
});

export default router;
