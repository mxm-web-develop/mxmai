import type { OutlineTaskItem } from '../api/outline-web';

interface OutlineViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  task: OutlineTaskItem | null;
  loading: boolean;
  error: string | null;
}

export interface OutlineNode {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  cast?: string[];
  length?: string;
  key_elements?: string[];
  children?: OutlineNode[];
}

export interface CharacterProfile {
  id: string;
  name: string;
  nickname?: string;
  age?: string;
  appearance?: string;
  voice_description?: string;
  clothing_style?: string;
  personality?: string;
  others?: string;
  category?: string[];
  tags?: string[];
}

export function OutlineViewerModal({
  visible,
  onClose,
  title,
  content,
  task,
  loading,
  error,
}: OutlineViewerModalProps) {
  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-content">
          {loading ? (
            <div className="loading-indicator">加载中...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <div className="outline-content-viewer">
              <pre>{content}</pre>
            </div>
          )}
          {task && (
            <div className="task-metadata">
              <div className="metadata-row">
                <span className="metadata-label">任务ID:</span>
                <code className="metadata-value">{task.id}</code>
              </div>
              <div className="metadata-row">
                <span className="metadata-label">状态:</span>
                <span className={`metadata-value status-${task.status}`}>
                  {task.status === 'pending' ? '等待中' :
                   task.status === 'processing' ? '处理中' :
                   task.status === 'completed' ? '已完成' :
                   task.status === 'failed' ? '失败' :
                   task.status === 'cancelled' ? '取消' : task.status}
                </span>
              </div>
              {task.createdAt && (
                <div className="metadata-row">
                  <span className="metadata-label">创建时间:</span>
                  <span className="metadata-value">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <style>{`
        .outline-content-viewer {
          background: var(--color-surface-light);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 1rem;
          max-height: 400px;
          overflow-y: auto;
          margin-bottom: 1rem;
        }

        .outline-content-viewer pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .task-metadata {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 1rem;
        }

        .metadata-row {
          display: flex;
          margin-bottom: 0.5rem;
          align-items: center;
        }

        .metadata-row:last-child {
          margin-bottom: 0;
        }

        .metadata-label {
          font-weight: 500;
          color: var(--color-text-muted);
          width: 80px;
          flex-shrink: 0;
        }

        .metadata-value {
          flex: 1;
          font-family: monospace;
          font-size: 0.875rem;
        }

        .status-pending {
          color: #f59e0b;
        }

        .status-processing {
          color: var(--color-primary);
        }

        .status-completed {
          color: var(--color-success);
        }

        .status-failed {
          color: var(--color-error);
        }

        .status-cancelled {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}