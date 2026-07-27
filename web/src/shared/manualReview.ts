import {
  addKnowledgeFolderStorageLink,
  getTaskReviewDraft,
  uploadAssets,
  getKnowledgeFolders,
  type FolderItem,
} from '../api/client';

export { getTaskReviewDraft };

/** 用户主动将审核正文保存为 .txt 并软链到知识库 */
export async function saveReviewTextToKnowledgeFolder(args: {
  text: string;
  knowledgeFolderId: string;
  filename?: string;
}): Promise<{ objectId: string; knowledgeFolderId: string }> {
  const content = args.text.trim();
  if (!content) throw new Error('正文为空，无法保存');
  if (!args.knowledgeFolderId?.trim()) throw new Error('请选择知识库');

  const name = (args.filename?.trim() || `manual-review-${Date.now()}.txt`).replace(/[^\w.\-一-龥]/g, '_');
  const file = new File([content], name.endsWith('.txt') ? name : `${name}.txt`, {
    type: 'text/plain;charset=utf-8',
  });

  const uploadRes = await uploadAssets(file, { purpose: 'custom', storageMode: 'asset' });
  const objectId = uploadRes.data?.data?.objectId;
  if (!objectId) {
    throw new Error('上传成功但未返回 objectId');
  }

  const linkRes = await addKnowledgeFolderStorageLink(args.knowledgeFolderId.trim(), objectId);
  if (linkRes.error) throw new Error(linkRes.error);

  return { objectId, knowledgeFolderId: args.knowledgeFolderId.trim() };
}

export async function loadKnowledgeFolderOptions(): Promise<FolderItem[]> {
  const list = await getKnowledgeFolders({ force: true });
  return list.filter((f) => f.index_status === 'indexed');
}

export { isTaskEligibleForManualReview, resolveTaskListStatus } from '../utils/mergeTaskItem';
