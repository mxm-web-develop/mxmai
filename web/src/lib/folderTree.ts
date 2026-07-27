import type { FolderItem } from '../api/client';

export interface FolderTreeNode {
  folder: FolderItem;
  children: FolderTreeNode[];
}

export function buildFolderTree(folders: FolderItem[]): FolderTreeNode[] {
  const byParent = new Map<string | null, FolderItem[]>();
  for (const f of folders) {
    const pid = f.parent_id ?? null;
    const list = byParent.get(pid) ?? [];
    list.push(f);
    byParent.set(pid, list);
  }
  const sortByName = (a: FolderItem, b: FolderItem) => a.name.localeCompare(b.name, 'zh-CN');
  const build = (parentId: string | null): FolderTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .sort(sortByName)
      .map((folder) => ({
        folder,
        children: build(folder.id),
      }));
  return build(null);
}

/** 从选中节点到根的路径 id 列表 */
export function folderAncestorIds(folders: FolderItem[], folderId: string | null): string[] {
  if (!folderId) return [];
  const map = new Map(folders.map((f) => [f.id, f]));
  const ids: string[] = [];
  let cur: string | null = folderId;
  while (cur) {
    ids.push(cur);
    cur = map.get(cur)?.parent_id ?? null;
  }
  return ids;
}

/** 从已加载的 folders 列表本地拼面包屑（无需 /path API） */
export function buildFolderBreadcrumb(folders: FolderItem[], folderId: string | null): FolderItem[] {
  if (!folderId) return [];
  const map = new Map(folders.map((f) => [f.id, f]));
  const path: FolderItem[] = [];
  let cur: string | null = folderId;
  while (cur) {
    const folder = map.get(cur);
    if (!folder) break;
    path.unshift(folder);
    cur = folder.parent_id ?? null;
  }
  return path;
}
