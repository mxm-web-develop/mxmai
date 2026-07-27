import type { KnowledgeFolderLinkItem } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { GraphTaskThumb } from '../GraphTaskThumb';
import { VideoTaskThumb } from '../VideoTaskThumb';
import { AudioTaskVisual } from '../task-list/AudioTaskVisual';
import { MusicTaskVisual } from '../task-list/MusicTaskVisual';
import { TaskGridCard } from '../task-list/TaskGridCard';
import { WritingTaskCard } from '../task-list/WritingTaskCard';
import { TaskCardDeleteButton } from '../task-list/TaskCardDeleteButton';
import {
  formatKnowledgeFolderLinkId,
  resolveLinkDisplayTitle,
  knowledgeFolderLinkTypeLabel,
} from './knowledgeFolderLinkDisplay';
import {
  resolveKnowledgeFolderLinkCardKind,
  storageObjectPublicUrl,
  knowledgeFolderLinkTaskId,
  knowledgeFolderLinkToTaskItem,
} from './knowledgeFolderLinkModel';
import { StaticTaskThumb } from './StaticTaskThumb';
import { StyleFeatureTagsEditor } from './StyleFeatureTagsEditor';
import { UploadPickerThumb } from './UploadPickerThumb';

type KnowledgeFolderLinkCardProps = {
  link: KnowledgeFolderLinkItem;
  graphThumbUrl?: string;
  videoThumbUrl?: string;
  onRequestGraphThumb?: (taskId: string) => void;
  onRequestVideoThumb?: (taskId: string) => void;
  onOpen?: () => void;
  onPick?: () => void;
  busy?: boolean;
  onRemove?: () => void;
  enableFeatureTags?: boolean;
  onSaveFeatureTags?: (link: KnowledgeFolderLinkItem, tags: string[]) => Promise<void>;
};

function useLinkCardInteraction({
  link,
  busy,
  onOpen,
  onPick,
}: Pick<KnowledgeFolderLinkCardProps, 'link' | 'busy' | 'onOpen' | 'onPick'>) {
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
  enableFeatureTags,
  onSaveFeatureTags,
}: {
  link: KnowledgeFolderLinkItem;
  visual: React.ReactNode;
  busy?: boolean;
  onOpen?: () => void;
  onPick?: () => void;
  onRemove?: () => void;
  enableFeatureTags?: boolean;
  onSaveFeatureTags?: (link: KnowledgeFolderLinkItem, tags: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { canInteract, handleActivate } = useLinkCardInteraction({ link, busy, onOpen, onPick });
  return (
    <li
      className={`graph-task-item vf-link-card${canInteract ? ' graph-task-item-clickable' : ''}${link.broken ? ' vf-link-card--broken' : ''}${busy ? ' vf-link-card--busy' : ''}`}
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
          <span className="graph-task-subtype">{knowledgeFolderLinkTypeLabel(link)}</span>
          <code className="graph-task-id" title={link.id}>
            {formatKnowledgeFolderLinkId(link.id)}
          </code>
        </div>
        {enableFeatureTags && onSaveFeatureTags ? (
          <StyleFeatureTagsEditor
            value={link.feature_tags}
            disabled={Boolean(busy) || link.broken}
            onSave={(tags) => onSaveFeatureTags(link, tags)}
          />
        ) : null}
        {link.broken ? (
          <span className="vf-link-card-broken-hint">{t('assets.knowledgeBase.linkBroken')}</span>
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
  enableFeatureTags,
  onSaveFeatureTags,
}: {
  link: KnowledgeFolderLinkItem;
  visual: React.ReactNode;
  busy?: boolean;
  onOpen?: () => void;
  onPick?: () => void;
  onRemove?: () => void;
  enableFeatureTags?: boolean;
  onSaveFeatureTags?: (link: KnowledgeFolderLinkItem, tags: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { canInteract, handleActivate } = useLinkCardInteraction({ link, busy, onOpen, onPick });
  const taskId = knowledgeFolderLinkTaskId(link);
  return (
    <li
      className={`video-task-item vf-link-card${canInteract ? ' video-task-item-clickable' : ''}${link.broken ? ' vf-link-card--broken' : ''}${busy ? ' vf-link-card--busy' : ''}`}
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
        <span className="graph-task-subtype">{knowledgeFolderLinkTypeLabel(link)}</span>
        <code className="video-task-id" title={taskId}>
          {formatKnowledgeFolderLinkId(taskId)}
        </code>
      </div>
      {enableFeatureTags && onSaveFeatureTags ? (
        <StyleFeatureTagsEditor
          value={link.feature_tags}
          disabled={Boolean(busy) || link.broken}
          onSave={(tags) => onSaveFeatureTags(link, tags)}
        />
      ) : null}
      {link.broken ? (
        <span className="vf-link-card-broken-hint">{t('assets.knowledgeBase.linkBroken')}</span>
      ) : null}
    </li>
  );
}

export function KnowledgeFolderLinkCard({
  link,
  graphThumbUrl,
  videoThumbUrl,
  onRequestGraphThumb,
  onRequestVideoThumb,
  onOpen,
  onPick,
  busy,
  onRemove,
  enableFeatureTags,
  onSaveFeatureTags,
}: KnowledgeFolderLinkCardProps) {
  const { t } = useTranslation();
  const kind = resolveKnowledgeFolderLinkCardKind(link);
  const taskItem = knowledgeFolderLinkToTaskItem(link);
  const taskId = knowledgeFolderLinkTaskId(link);
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
        statusLabel={t('assets.knowledgeBase.completed')}
        showStatus={false}
        showDelete={Boolean(onRemove)}
        deleteAction="delete"
        subtypeLabel={knowledgeFolderLinkTypeLabel(link)}
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

  if (kind === 'writing') {
    const meta = (link.metadata ?? {}) as Record<string, unknown>;
    const typeLabel =
      typeof meta.taskLabel === 'string' && meta.taskLabel.trim()
        ? meta.taskLabel.trim()
        : knowledgeFolderLinkTypeLabel(link);
    const subtypeLabel =
      typeof meta.subtypeLabel === 'string' && meta.subtypeLabel.trim()
        ? meta.subtypeLabel.trim()
        : undefined;
    return (
      <WritingTaskCard
        task={taskItem}
        title={resolveLinkDisplayTitle(link)}
        status="completed"
        statusLabel={t('assets.knowledgeBase.completed')}
        typeLabel={typeLabel}
        subtypeLabel={subtypeLabel}
        showStatus={false}
        showDelete={Boolean(onRemove)}
        deleteAction="delete"
        onClick={canInteract ? handleActivate : () => undefined}
        onDelete={onRemove ? handleRemove : undefined}
        deleting={Boolean(busy)}
        extra={
          enableFeatureTags && onSaveFeatureTags ? (
            <StyleFeatureTagsEditor
              value={link.feature_tags}
              disabled={Boolean(busy) || link.broken}
              onSave={(tags) => onSaveFeatureTags(link, tags)}
            />
          ) : link.broken ? (
            <span className="vf-link-card-broken-hint">{t('assets.knowledgeBase.linkBroken')}</span>
          ) : null
        }
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
        enableFeatureTags={enableFeatureTags}
        onSaveFeatureTags={onSaveFeatureTags}
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
        enableFeatureTags={enableFeatureTags}
        onSaveFeatureTags={onSaveFeatureTags}
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
        enableFeatureTags={enableFeatureTags}
        onSaveFeatureTags={onSaveFeatureTags}
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
      enableFeatureTags={enableFeatureTags}
      onSaveFeatureTags={onSaveFeatureTags}
      visual={<StaticTaskThumb kind="writing" />}
    />
  );
}
