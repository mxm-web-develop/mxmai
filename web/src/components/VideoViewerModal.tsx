/**
 * 视频任务查看弹窗 - 展示生成结果（视频播放），与写作一致：内容 / 查看数据
 */

import { useState, useEffect } from 'react';
import type { WritingTaskItem } from '../api/client';

interface VideoViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  videoUrl: string | null;
  loading?: boolean;
  error?: string | null;
}

export function VideoViewerModal({
  visible,
  onClose,
  title,
  task,
  videoUrl,
  loading,
  error,
}: VideoViewerModalProps) {
  const [viewMode, setViewMode] = useState<'content' | 'raw'>('content');

  // 关闭时释放 blob URL
  useEffect(() => {
    return () => {
      if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (!visible) return null;

  return (
    <div
      className="video-viewer-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="video-viewer-modal">
        <div className="video-viewer-header">
          <h3 className="video-viewer-title">{title || '视频生成结果'}</h3>
          <div className="video-viewer-actions">
            <button
              type="button"
              className={`video-viewer-tab ${viewMode === 'content' ? 'active' : ''}`}
              onClick={() => setViewMode('content')}
            >
              内容
            </button>
            <button
              type="button"
              className={`video-viewer-tab ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              查看数据
            </button>
            <button type="button" className="video-viewer-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="video-viewer-body">
          {loading && <p className="muted">加载中...</p>}
          {error && <p className="video-viewer-error">{error}</p>}
          {!loading && !error && viewMode === 'content' && !videoUrl && (
            <p className="muted">暂无生成结果</p>
          )}
          {!loading && !error && viewMode === 'content' && videoUrl && (
            <div className="video-viewer-player">
              <video
                src={videoUrl}
                controls
                style={{ width: '100%', maxHeight: '70vh' }}
              />
            </div>
          )}
          {viewMode === 'raw' && task && (
            <pre className="video-viewer-raw">
              {JSON.stringify(task, null, 2)}
            </pre>
          )}
        </div>
        <style>{`
          .video-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
          }
          .video-viewer-modal {
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 12px;
            max-width: 90vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .video-viewer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #333;
          }
          .video-viewer-title { margin: 0; font-size: 1rem; color: #e0e0e0; }
          .video-viewer-actions { display: flex; align-items: center; gap: 0.5rem; }
          .video-viewer-tab {
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
            border: 1px solid #444;
            background: transparent;
            color: #888;
            border-radius: 6px;
            cursor: pointer;
          }
          .video-viewer-tab.active { background: #333; color: #e0e0e0; border-color: #555; }
          .video-viewer-close {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
          }
          .video-viewer-body {
            flex: 1;
            overflow: auto;
            padding: 1.5rem;
          }
          .video-viewer-player { margin-top: 0.5rem; }
          .video-viewer-error { color: #fca5a5; }
          .video-viewer-raw {
            margin: 0;
            padding: 1rem;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            font-size: 0.8rem;
            color: #c0c0c0;
            overflow: auto;
            max-height: 60vh;
            white-space: pre-wrap;
            word-break: break-all;
          }
        `}</style>
      </div>
    </div>
  );
}
