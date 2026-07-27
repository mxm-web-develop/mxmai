import { useMemo } from 'react';
import { Empty } from 'antd';
import type { KnowledgeFolderContentItem, KnowledgeFolderLinkItem } from '../../api/client';
import { useGraphTaskThumbnails } from '../../hooks/useGraphTaskThumbnails';
import { useVideoTaskThumbnails } from '../../hooks/useVideoTaskThumbnails';
import { TaskListLoading } from '../asset-loading';
import BrandLoading from '../BrandLoading';
import {
  resolveKnowledgeFolderLinkCardKind,
  knowledgeFolderLinkTaskId,
} from './knowledgeFolderLinkModel';
import { isTextKnowledgeFolderLink } from '../schema-fields/textSourceKnowledgeFolderUtils';
import { StaticTaskThumb } from './StaticTaskThumb';
import { KnowledgeFolderLinkCard } from './KnowledgeFolderLinkCard';
import './knowledge-folder-content-list.css';

type KnowledgeFolderContentListProps = {
  items: KnowledgeFolderContentItem[];
  loading?: boolean;
  refreshing?: boolean;
  emptyDescription?: string;
  /** 仅展示文本类软链（写作任务 / txt·md·pdf 等） */
  textOnly?: boolean;
  /** 仅展示音频软链（口播选择器） */
  audioOnly?: boolean;
  /** 表单内嵌紧凑行列表（非大卡片网格） */
  compact?: boolean;
  onOpenDir: (dirId: string) => void;
  onOpenLink?: (link: KnowledgeFolderLinkItem) => void;
  onPickLink?: (link: KnowledgeFolderLinkItem) => void;
  onRemoveLink?: (link: KnowledgeFolderLinkItem) => void;
  resolvingLinkId?: string | null;
  enableFeatureTags?: boolean;
  onSaveFeatureTags?: (link: KnowledgeFolderLinkItem, tags: string[]) => Promise<void>;
};

function isAudioLink(link: KnowledgeFolderLinkItem): boolean {
  if (link.broken) return false;
  const kind = resolveKnowledgeFolderLinkCardKind(link);
  return kind === 'audio' || kind === 'music';
}

export function KnowledgeFolderContentList({
  items,
  loading = false,
  refreshing = false,
  emptyDescription = '此文件夹暂无内容',
  textOnly = false,
  audioOnly = false,
  compact = false,
  onOpenDir,
  onOpenLink,
  onPickLink,
  onRemoveLink,
  resolvingLinkId = null,
  enableFeatureTags = false,
  onSaveFeatureTags,
}: KnowledgeFolderContentListProps) {
  const visibleItems = items.filter((it) => {
    if (it.type === 'dir') return true;
    if (textOnly) return isTextKnowledgeFolderLink(it as KnowledgeFolderLinkItem);
    if (audioOnly) return isAudioLink(it as KnowledgeFolderLinkItem);
    return true;
  });

  const graphTaskIds = useMemo(
    () =>
      visibleItems
        .filter((it): it is KnowledgeFolderLinkItem => it.type === 'link')
        .filter((link) => resolveKnowledgeFolderLinkCardKind(link) === 'graph')
        .map((link) => knowledgeFolderLinkTaskId(link)),
    [visibleItems]
  );

  const videoTaskIds = useMemo(
    () =>
      visibleItems
        .filter((it): it is KnowledgeFolderLinkItem => it.type === 'link')
        .filter((link) => resolveKnowledgeFolderLinkCardKind(link) === 'video')
        .map((link) => knowledgeFolderLinkTaskId(link)),
    [visibleItems]
  );

  const { thumbMap: graphThumbMap, requestThumbnail: requestGraphThumb } =
    useGraphTaskThumbnails(graphTaskIds);
  const { thumbMap: videoThumbMap, requestThumbnail: requestVideoThumb } =
    useVideoTaskThumbnails(videoTaskIds);

  const loadingKind = textOnly ? 'writing' : audioOnly ? 'audio' : 'image';

  if (loading && visibleItems.length === 0) {
    return (
      <TaskListLoading
        layout={compact ? 'row-list' : 'media-grid'}
        kind={loadingKind}
        count={compact ? 4 : 6}
        className="vf-content-loading"
      />
    );
  }

  if (!loading && visibleItems.length === 0) {
    return (
      <div className="vf-content-empty">
        <Empty description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={`vf-content-list-wrap${refreshing ? ' vf-content-list-wrap--refreshing' : ''}`}>
      {refreshing ? (
        <div className="vf-content-list-refresh" aria-hidden>
          <BrandLoading size="small" />
        </div>
      ) : null}
      <ul className={`graph-task-list vf-content-list${compact ? ' vf-content-list--compact' : ''}`}>
        {visibleItems.map((item) => {
          if (item.type === 'dir') {
            return (
              <li
                key={`dir-${item.id}`}
                className="graph-task-item graph-task-item-clickable vf-link-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpenDir(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDir(item.id);
                  }
                }}
              >
                <StaticTaskThumb kind="folder" />
                <div className="graph-task-content">
                  <span className="graph-task-title">{item.name}</span>
                  <div className="graph-task-meta">
                    <span className="graph-task-subtype">子文件夹</span>
                  </div>
                </div>
              </li>
            );
          }

          const link = item as KnowledgeFolderLinkItem;
          const kind = resolveKnowledgeFolderLinkCardKind(link);
          return (
            <KnowledgeFolderLinkCard
              key={`${link.ref_type}-${link.id}`}
              link={link}
              graphThumbUrl={kind === 'graph' ? graphThumbMap[knowledgeFolderLinkTaskId(link)] : undefined}
              videoThumbUrl={kind === 'video' ? videoThumbMap[knowledgeFolderLinkTaskId(link)] : undefined}
              onRequestGraphThumb={requestGraphThumb}
              onRequestVideoThumb={requestVideoThumb}
              onOpen={onOpenLink ? () => onOpenLink(link) : undefined}
              onPick={onPickLink ? () => onPickLink(link) : undefined}
              busy={resolvingLinkId === link.id}
              onRemove={onRemoveLink ? () => onRemoveLink(link) : undefined}
              enableFeatureTags={enableFeatureTags}
              onSaveFeatureTags={onSaveFeatureTags}
            />
          );
        })}
      </ul>
    </div>
  );
}
