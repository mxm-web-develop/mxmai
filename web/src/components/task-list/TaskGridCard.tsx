import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { WritingTaskItem } from '../../api/client';
import { TaskOpenApiBadge } from '../TaskOpenApiBadge';
import { formatTaskCreatedAt } from './taskPreviewText';
import { animateCardEnter } from '../../lib/motion/gsapPresets';
import { TaskCardDeleteButton } from './TaskCardDeleteButton';
import { TaskCardMoreMenu } from './TaskCardMoreMenu';
import { TaskCardSelectCheckbox } from './TaskCardSelectCheckbox';

gsap.registerPlugin(useGSAP);

export type TaskGridCardProps = {
  task: WritingTaskItem;
  prefix: 'writing' | 'audio' | 'music';
  title: string;
  status: string;
  statusLabel: string;
  visual: React.ReactNode;
  subtypeLabel?: string;
  animateKey?: number;
  showStatus?: boolean;
  showDelete?: boolean;
  /** more=⋯菜单（生成列表默认）；delete=直接删除（知识库等） */
  deleteAction?: 'more' | 'delete';
  interactive?: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onMove?: (e: React.MouseEvent) => void;
  onDownload?: (e: React.MouseEvent) => void | Promise<void>;
  deleting: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
};

export function TaskGridCard({
  task,
  prefix,
  title,
  status,
  statusLabel,
  visual,
  subtypeLabel,
  animateKey = 0,
  showStatus = true,
  showDelete = true,
  deleteAction = 'more',
  interactive = true,
  onClick,
  onDelete,
  onMove,
  onDownload,
  deleting,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: TaskGridCardProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const useDeleteButton = showDelete && deleteAction === 'delete';
  const useMoreMenu = showDelete && deleteAction === 'more';

  useGSAP(
    () => {
      if (!cardRef.current) return;
      animateCardEnter(cardRef.current);
    },
    { scope: cardRef, dependencies: [task.id, animateKey], revertOnUpdate: true }
  );

  return (
    <li
      ref={cardRef}
      className={`${prefix}-task-item${interactive ? ` ${prefix}-task-item-clickable` : ''} task-grid-card${
        useDeleteButton || !showDelete ? ' task-grid-card--no-more' : ''
      }${selected ? ' generation-task-item--selected' : ''}${
        selectionMode ? ' generation-task-item--selecting' : ''
      }`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {selectionMode && onToggleSelect ? (
        <TaskCardSelectCheckbox checked={selected} onToggle={onToggleSelect} />
      ) : null}
      {visual}
      <div className={`${prefix}-task-content task-grid-card__body`}>
        <span className={`${prefix}-task-title`} title={title}>
          {title}
        </span>
        <div className={`${prefix}-task-meta task-grid-card__meta`}>
          <TaskOpenApiBadge metadata={task.metadata} />
          {subtypeLabel ? (
            <span className={`${prefix}-task-subtype`}>{subtypeLabel}</span>
          ) : null}
          {task.createdAt ? (
            <span className="task-grid-card__time">{formatTaskCreatedAt(task.createdAt)}</span>
          ) : null}
          {task.progress?.progress != null && status !== 'completed' ? (
            <span className={`${prefix}-task-progress`}>{task.progress.progress}%</span>
          ) : null}
        </div>
      </div>
      {showStatus ? (
        <div className={`${prefix}-task-actions task-grid-card__foot`}>
          <span className={`${prefix}-task-status status-badge status-badge--${status}`}>
            {statusLabel}
          </span>
        </div>
      ) : null}
      {useDeleteButton && !selectionMode ? (
        <div className={`${prefix}-task-actions task-grid-card__foot task-grid-card__foot--actions-only`}>
          <TaskCardDeleteButton onClick={onDelete} disabled={deleting} deleting={deleting} />
        </div>
      ) : null}
      {useMoreMenu && !selectionMode ? (
        <TaskCardMoreMenu
          onDelete={onDelete}
          onMove={onMove}
          onDownload={onDownload}
          completedActionsEnabled={status === 'completed'}
          disabled={deleting}
          deleting={deleting}
        />
      ) : null}
    </li>
  );
}
