import type { WritingTaskItem } from '../../api/client';
import type { ReviewDraftPayload } from '../../api/client';

function readNestedRecord(
  root: Record<string, unknown> | undefined,
  path: string[]
): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** 审核草稿缺失时，从任务 requestParams 快照回退读取 ProjectFile */
export function resolveReviewScriptInitial(
  task: WritingTaskItem | null | undefined,
  draft: ReviewDraftPayload | null | undefined
): unknown {
  if (draft?.json != null) return draft.json;

  const rp = task?.requestParams;
  if (!rp || typeof rp !== 'object') return undefined;

  const fromRoot = readNestedRecord(rp, ['businessPipelineState', 'videoEditScriptJson']);
  if (fromRoot != null) return fromRoot;

  const inner = rp.params;
  if (inner && typeof inner === 'object') {
    const fromInner = readNestedRecord(inner as Record<string, unknown>, [
      'businessPipelineState',
      'videoEditScriptJson',
    ]);
    if (fromInner != null) return fromInner;
  }

  return undefined;
}
