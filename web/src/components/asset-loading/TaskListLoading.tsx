import type { AssetMediaKind, TaskListLayout } from './types';
import './TaskListLoading.css';

interface TaskListLoadingProps {
  layout?: TaskListLayout;
  count?: number;
  kind?: AssetMediaKind;
  className?: string;
}

export function TaskListLoading({
  layout = 'media-grid',
  count = 6,
  kind = 'image',
  className = '',
}: TaskListLoadingProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <ul
      className={`task-list-loading task-list-loading--${layout} task-list-loading--${kind} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="任务列表加载中"
    >
      {items.map((i) => (
        <li key={i} className="task-list-loading__item" style={{ ['--tls-delay' as string]: `${i * 0.08}s` }}>
          {layout === 'media-grid' && (
            <>
              <div className="task-list-loading__thumb" aria-hidden="true">
                <span className="task-list-loading__scan" />
              </div>
              <div className="task-list-loading__body">
                <span className="task-list-loading__line task-list-loading__line--title" />
                <span className="task-list-loading__line task-list-loading__line--meta" />
                <span className="task-list-loading__line task-list-loading__line--short" />
              </div>
              <div className="task-list-loading__footer">
                <span className="task-list-loading__pill" />
                <span className="task-list-loading__pill task-list-loading__pill--sm" />
              </div>
            </>
          )}

          {layout === 'doc-grid' && (
            <>
              <div className="task-list-loading__doc-head">
                <span className="task-list-loading__pill task-list-loading__pill--format" />
                <span className="task-list-loading__pill" />
              </div>
              <span className="task-list-loading__line task-list-loading__line--title" />
              <span className="task-list-loading__line task-list-loading__line--meta" />
              <div className="task-list-loading__footer">
                <span className="task-list-loading__line task-list-loading__line--short" />
                <span className="task-list-loading__pill task-list-loading__pill--sm" />
              </div>
            </>
          )}

          {layout === 'row-list' && (
            <>
              <div className="task-list-loading__row-main">
                <span className="task-list-loading__line task-list-loading__line--title" />
                <span className="task-list-loading__pill" />
              </div>
              <div className="task-list-loading__row-meta">
                <span className="task-list-loading__line task-list-loading__line--meta" />
                <span className="task-list-loading__line task-list-loading__line--short" />
              </div>
            </>
          )}

          {layout === 'character-grid' && (
            <>
              <div className="task-list-loading__avatar" aria-hidden="true" />
              <div className="task-list-loading__body">
                <span className="task-list-loading__line task-list-loading__line--title" />
                <span className="task-list-loading__line task-list-loading__line--meta" />
                <span className="task-list-loading__line task-list-loading__line--desc" />
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
