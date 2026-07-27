import { describe, expect, it } from 'vitest';
import type { KnowledgeFolderLinkItem } from '../../api/client';
import {
  isWritingManuscriptLink,
  knowledgeFolderLinkToTaskItem,
  resolveKnowledgeFolderLinkCardKind,
} from './knowledgeFolderLinkModel';

function makeStorage(partial: Partial<KnowledgeFolderLinkItem>): KnowledgeFolderLinkItem {
  return {
    type: 'link',
    ref_type: 'storage_object',
    id: 'obj1',
    object_id: 'obj1',
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('writing manuscript soft-link', () => {
  it('asset_type writing_manuscript → writing 卡片', () => {
    const link = makeStorage({
      name: 'piece.md',
      content_type: 'text/markdown',
      metadata: {
        asset_type: 'writing_manuscript',
        label: '史前文明一题',
        contentPreview: '# 史前文明一题\n\n正文预览',
      },
    });
    expect(isWritingManuscriptLink(link)).toBe(true);
    expect(resolveKnowledgeFolderLinkCardKind(link)).toBe('writing');
    const task = knowledgeFolderLinkToTaskItem(link);
    expect(task.type).toBe('writing');
    expect(task.metadata?.label).toBe('史前文明一题');
    expect(task.result?.contentPreview).toContain('史前文明一题');
  });

  it('仅 markdown content_type 也识别为文稿', () => {
    const link = makeStorage({
      name: '随考古学家翻.md',
      content_type: 'text/markdown;charset=utf-8',
    });
    expect(isWritingManuscriptLink(link)).toBe(true);
    expect(resolveKnowledgeFolderLinkCardKind(link)).toBe('writing');
  });

  it('普通 pdf 仍为 upload', () => {
    const link = makeStorage({
      name: '说明书.pdf',
      content_type: 'application/pdf',
    });
    expect(isWritingManuscriptLink(link)).toBe(false);
    expect(resolveKnowledgeFolderLinkCardKind(link)).toBe('upload');
  });
});
