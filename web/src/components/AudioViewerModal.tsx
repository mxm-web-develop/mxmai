/**
 * 音频任务查看弹窗 - 展示生成结果（音频播放），与写作一致：内容 / 查看数据
 */

import { useState, useRef, useEffect } from 'react';
import type { WritingTaskItem } from '../api/client';

interface AudioViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  mediaUrls: string[];
  loading?: boolean;
  error?: string | null;
}

export function AudioViewerModal({
  visible,
  onClose,
  title,
  task,
  mediaUrls,
  loading,
  error,
}: AudioViewerModalProps) {
  const [viewMode, setViewMode] = useState<'content' | 'raw'>('content');
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 关闭时释放 blob URL
  useEffect(() => {
    return () => {
      mediaUrls.forEach((u) => {
        if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, [mediaUrls]);

  useEffect(() => {
    if (!visible) setPlaying(false);
  }, [visible]);

  const primaryUrl = mediaUrls[0];

  if (!visible) return null;

  return (
    <div
      className="audio-viewer-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="audio-viewer-modal">
        <div className="audio-viewer-header">
          <h3 className="audio-viewer-title">{title || '音频生成结果'}</h3>
          <div className="audio-viewer-actions">
            <button
              type="button"
              className={`audio-viewer-tab ${viewMode === 'content' ? 'active' : ''}`}
              onClick={() => setViewMode('content')}
            >
              内容
            </button>
            <button
              type="button"
              className={`audio-viewer-tab ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              查看数据
            </button>
            <button type="button" className="audio-viewer-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="audio-viewer-body">
          {loading && <p className="muted">加载中...</p>}
          {error && <p className="audio-viewer-error">{error}</p>}
          {!loading && !error && viewMode === 'content' && !primaryUrl && (
            <p className="muted">暂无生成结果</p>
          )}
          {!loading && !error && viewMode === 'content' && primaryUrl && (
            <div className="audio-viewer-player">
              <audio
                ref={(el) => {
                  audioRef.current = el;
                  if (el) {
                    el.onplay = () => setPlaying(true);
                    el.onpause = el.onended = () => setPlaying(false);
                  }
                }}
                src={primaryUrl}
                controls
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
              {mediaUrls.length > 1 && (
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  共 {mediaUrls.length} 个文件
                </p>
              )}
            </div>
          )}
          {viewMode === 'raw' && task && (
            <pre className="audio-viewer-raw">
              {JSON.stringify(task, null, 2)}
            </pre>
          )}
        </div>
        <style>{`
          .audio-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
          }
          .audio-viewer-modal {
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 12px;
            max-width: 480px;
            width: 100%;
            overflow: hidden;
          }
          .audio-viewer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #333;
          }
          .audio-viewer-title { margin: 0; font-size: 1rem; color: #e0e0e0; }
          .audio-viewer-actions { display: flex; align-items: center; gap: 0.5rem; }
          .audio-viewer-tab {
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
            border: 1px solid #444;
            background: transparent;
            color: #888;
            border-radius: 6px;
            cursor: pointer;
          }
          .audio-viewer-tab.active { background: #333; color: #e0e0e0; border-color: #555; }
          .audio-viewer-close {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
          }
          .audio-viewer-body { padding: 1.5rem; }
          .audio-viewer-error { color: #fca5a5; }
          .audio-viewer-raw {
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
