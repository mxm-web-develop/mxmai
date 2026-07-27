/**
 * 任务卡片「更多」：删除 / 移动到知识库 / 下载
 * 移动与下载仅在任务已完成时可用
 */
import { Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { Download, FolderInput, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type TaskCardMoreMenuProps = {
  onDelete: (e: React.MouseEvent) => void;
  onMove?: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void | Promise<void>;
  /** 已完成态才可移动/下载 */
  completedActionsEnabled?: boolean;
  disabled?: boolean;
  deleting?: boolean;
};

export function TaskCardMoreMenu({
  onDelete,
  onMove,
  onDownload,
  completedActionsEnabled = false,
  disabled,
  deleting,
}: TaskCardMoreMenuProps) {
  const { t } = useTranslation();
  const moreLabel = t('common.task.actions.more');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const completeOnlyHint = t('common.task.actions.completedOnlyHint');

  const items: MenuProps['items'] = [
    ...(onMove
      ? [
          {
            key: 'move',
            icon: <FolderInput size={14} strokeWidth={2} aria-hidden />,
            label: t('common.task.actions.moveToFolder'),
            disabled: !completedActionsEnabled,
            title: completedActionsEnabled ? undefined : completeOnlyHint,
            onClick: ({ domEvent }: { domEvent: Event }) => {
              if (!completedActionsEnabled) return;
              domEvent.stopPropagation();
              onMove(domEvent as unknown as React.MouseEvent);
            },
          },
        ]
      : []),
    ...(onDownload
      ? [
          {
            key: 'download',
            icon: <Download size={14} strokeWidth={2} aria-hidden />,
            label: downloadBusy
              ? t('common.task.actions.downloading')
              : t('common.task.actions.download'),
            disabled: !completedActionsEnabled || downloadBusy,
            title: completedActionsEnabled ? undefined : completeOnlyHint,
            onClick: async ({ domEvent }: { domEvent: Event }) => {
              if (!completedActionsEnabled || downloadBusy) return;
              domEvent.stopPropagation();
              setDownloadBusy(true);
              try {
                await onDownload(domEvent as unknown as React.MouseEvent);
                message.success(t('common.task.actions.downloadStarted'));
              } catch (e) {
                message.error(e instanceof Error ? e.message : t('common.task.actions.downloadFailed'));
              } finally {
                setDownloadBusy(false);
              }
            },
          },
        ]
      : []),
    {
      key: 'delete',
      danger: true,
      icon: <Trash2 size={14} strokeWidth={2} aria-hidden />,
      label: t('common.task.actions.delete'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onDelete(domEvent as unknown as React.MouseEvent);
      },
    },
  ];

  return (
    <span className="task-card-more-anchor" onClick={(e) => e.stopPropagation()}>
      <Dropdown
        menu={{ items }}
        trigger={['click']}
        placement="topRight"
        disabled={disabled || deleting}
        getPopupContainer={() => document.body}
      >
        <button
          type="button"
          className="task-card-more-btn"
          title={moreLabel}
          aria-label={moreLabel}
          disabled={disabled || deleting}
          onClick={(e) => e.stopPropagation()}
        >
          {deleting ? (
            <span className="task-card-more-btn__ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
          )}
        </button>
      </Dropdown>
    </span>
  );
}
