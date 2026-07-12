import type { VirtualFolderLinkItem } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { GraphTaskThumb } from '../GraphTaskThumb';
import { VideoTaskThumb } from '../VideoTaskThumb';
import { AudioTaskVisual } from '../task-list/AudioTaskVisual';
import { MusicTaskVisual } from '../task-list/MusicTaskVisual';
import { TaskGridCard } from '../task-list/TaskGridCard';
import { TaskCardDeleteButton } from '../task-list/TaskCardDeleteButton';
import {
  formatVirtualFolderLinkId,
  resolveLinkDisplayTitle,
  virtualFolderLinkTypeLabel,
} from './virtualFolderLinkDisplay';
import {
  resolveVirtualFolderLinkCardKind,
  storageObjectPublicUrl,
  virtualFolderLinkTaskId,
  virtualFolderLinkToTaskItem,
} from './virtualFolderLinkModel';
import { StaticTaskThumb } from './StaticTaskThumb';
import { UploadPickerThumb } from './UploadPickerThumb';

type VirtualFolderLinkCardProps = {
  link: VirtualFolderLinkItem;
  graphThumbUrl?: string;
  videoThumbUrl?: string;
  onRequestGraphThumb?: (taskId: string) => void;
  onRequestVideoThumb?: (taskId: string) => void;
  onOpen?: () => void;
  onPick?: () => void;
  busy?: boolean;
  onRemove?: () => void;
};

function useLinkCardInteraction({
  link,
  busy,
  onOpen,
  onPick,
}: Pick<VirtualFolderLinkCardProps, 'link' | 'busy' | 'onOpen' | 'onPick'>) {
  const canInteract = Boolean(onOpen || onPick) && !link.broken && !busy;
  const handleActivate = () => {
    if (!canInteract) return;
    if (onPick) {
      onPick();
      return;
    }
    onOpen?.();
  };
  return { canInteract, handleActivate };
}

function GraphStyleLinkCard({
  link,
  visual,
  busy,
  onOpen,
  onPick,
  onRemove,
}: {
  link: VirtualFolderLinkItem;
  visual: React.ReactNode;
  busy?: boolean;
  onOpen?: () => void;
  onPick?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const { canInteract, handleActivate } = useLinkCardInteraction({ link, busy, onOpen, onPick });
  return (
    <li
      className={`graph-task-item${canInteract ? ' graph-task-item-clickable' : ''}${link.broken ? ' vf-link-card--broken' : ''}${busy ? ' vf-link-card--busy' : ''}`}
      role={canInteract ? 'button' : undefined}
      tabIndex={canInteract ? 0 : undefined}
      onClick={canInteract ? handleActivate : undefined}
      onKeyDown={
        canInteract
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
    >
      {visual}
      <div className="graph-task-content">
        <span className="graph-task-title" title={resolveLinkDisplayTitle(link)}>
          {resolveLinkDisplayTitle(link)}
        </span>
        <div className="graph-task-meta">
          <span className="graph-task-subtype">{virtualFolderLinkTypeLabel(link)}</span>
          <code className="graph-task-id" title={link.id}>
            {formatVirtualFolderLinkId(link.id)}
          </code>
        </div>
        {link.broken ? (
          <span className="vf-link-card-broken-hint">{t('assets.virtualFolder.linkBroken')}</span>
        ) : null}
      </div>
      {onRemove ? (
        <div className="graph-task-actions vf-link-card-actions">
          <TaskCardDeleteButton
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function VideoStyleLinkCard({
  link,
  visual,
  busy,
  onOpen,
  onPick,
  onRemove,
}: {
  link: VirtualFolderLinkItem;
  visual: React.ReactNode;
  busy?: boolean;
  onOpen?: () => void;
  onPick?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const { canInteract, handleActivate } = useLinkCardInteraction({ link, busy, onOpen, onPick });
  const taskId = virtualFolderLinkTaskId(link);
  return (
    <li
      className={`video-task-item${canInteract ? ' video-task-item-clickable' : ''}${link.broken ? ' vf-link-card--broken' : ''}${busy ? ' vf-link-card--busy' : ''}`}
      role={canInteract ? 'button' : undefined}
      tabIndex={canInteract ? 0 : undefined}
      onClick={canInteract ? handleActivate : undefined}
      onKeyDown={
        canInteract
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
    >
      {visual}
      <div className="video-task-main">
        <span className="video-task-title" title={resolveLinkDisplayTitle(link)}>
          {resolveLinkDisplayTitle(link)}
        </span>
        {onRemove ? (
          <span className="video-task-actions">
            <TaskCardDeleteButton
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            />
          </span>
        ) : null}
      </div>
      <div className="video-task-meta">
        <span className="graph-task-subtype">{virtualFolderLinkTypeLabel(link)}</span>
        <code className="video-task-id" title={taskId}>
          {formatVirtualFolderLinkId(taskId)}
        </code>
      </div>
      {link.broken ? (
        <span className="vf-link-card-broken-hint">{t('assets.virtualFolder.linkBroken')}</span>
      ) : null}
    </li>
  );
}

export function VirtualFolderLinkCard({
  link,
  graphThumbUrl,
  videoThumbUrl,
  onRequestGraphThumb,
  onRequestVideoThumb,
  onOpen,
  onPick,
  busy,
  onRemove,
}: VirtualFolderLinkCardProps) {
  const { t } = useTranslation();
  const kind = resolveVirtualFolderLinkCardKind(link);
  const taskItem = virtualFolderLinkToTaskItem(link);
  const taskId = virtualFolderLinkTaskId(link);
  const { canInteract, handleActivate } = useLinkCardInteraction({ link, busy, onOpen, onPick });

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  if (kind === 'audio' || kind === 'music') {
    const prefix = kind === 'music' ? 'music' : 'audio';
    return (
      <TaskGridCard
        task={taskItem}
        prefix={prefix}
        title={resolveLinkDisplayTitle(link)}
        status="completed"
        statusLabel={t('assets.virtualFolder.completed')}
        showStatus={false}
        showDelete={Boolean(onRemove)}
        subtypeLabel={virtualFolderLinkTypeLabel(link)}
        visual={
          kind === 'music' ? (
            <MusicTaskVisual task={taskItem} status="completed" />
          ) : (
            <AudioTaskVisual task={taskItem} status="completed" />
          )
        }
        onClick={canInteract ? handleActivate : () => undefined}
        onDelete={handleRemove}
        deleting={Boolean(busy)}
        interactive={canInteract}
      />
    );
  }

  if (kind === 'graph') {
    return (
      <GraphStyleLinkCard
        link={link}
        busy={busy}
        onOpen={onOpen}
        onPick={onPick}
        onRemove={onRemove}
        visual={
          <GraphTaskThumb
            taskId={taskId}
            status="completed"
            thumbUrl={graphThumbUrl}
            onRequest={onRequestGraphThumb ?? (() => undefined)}
          />
        }
      />
    );
  }

  if (kind === 'video') {
    return (
      <VideoStyleLinkCard
        link={link}
        busy={busy}
        onOpen={onOpen}
        onPick={onPick}
        onRemove={onRemove}
        visual={
          <VideoTaskThumb
            taskId={taskId}
            status="completed"
            thumbUrl={videoThumbUrl}
            onRequest={onRequestVideoThumb ?? (() => undefined)}
          />
        }
      />
    );
  }

  if (kind === 'upload') {
    const objectId = link.object_id ?? link.id;
    return (
      <GraphStyleLinkCard
        link={link}
        busy={busy}
        onOpen={onOpen}
        onPick={onPick}
        onRemove={onRemove}
        visual={
          <UploadPickerThumb
            objectId={objectId}
            contentUrl={storageObjectPublicUrl(objectId)}
            contentType={link.content_type}
          />
        }
      />
    );
  }

  return (
    <GraphStyleLinkCard
      link={link}
      busy={busy}
      onOpen={onOpen}
      onPick={onPick}
      onRemove={onRemove}
      visual={<StaticTaskThumb kind="writing" />}
    />
  );
}
