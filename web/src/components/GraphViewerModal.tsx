/**
 * 图片任务查看弹窗
 *
 * - 全屏遮罩，居中展示当前图片
 * - 支持缩放（滚轮 / 按钮）与拖拽平移
 * - 若有多张图片，底部缩略图可切换
 * - 内容 / 查看数据 两个 Tab 与原来保持一致
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import type { WritingTaskItem } from '../api/client';

interface GraphViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  mediaUrls: string[];
  loading?: boolean;
  error?: string | null;
}

export function GraphViewerModal({
  visible,
  onClose,
  title,
  task,
  mediaUrls,
  loading,
  error,
}: GraphViewerModalProps) {
  const [viewMode, setViewMode] = useState<'content' | 'raw'>('content');
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);

  // 关闭时释放 blob URL，避免内存泄漏
  useEffect(() => {
    return () => {
      mediaUrls.forEach((u) => {
        if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, [mediaUrls]);

  // 媒体切换或模式切换时重置视图状态（仅在当前状态已偏离默认值时才更新）
  useEffect(() => {
    if (activeIndex !== 0 || zoom !== 1 || offset.x !== 0 || offset.y !== 0) {
      setActiveIndex(0);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
    // 仅当媒体列表或视图模式发生变化时触发检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrls.join('|'), viewMode, activeIndex, zoom, offset.x, offset.y]);

  const clampZoom = (value: number) => {
    const MIN = 1;
    const MAX = 4;
    if (value < MIN) return MIN;
    if (value > MAX) return MAX;
    return Number(value.toFixed(2));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (viewMode !== 'content' || mediaUrls.length === 0) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => clampZoom(z + delta));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'content') return;
    e.preventDefault();
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !lastPos) return;
    e.preventDefault();
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setLastPos({ x: e.clientX, y: e.clientY });
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastPos(null);
  };

  const handleResetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setZoom((z) => clampZoom(z + 0.25));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - 0.25));

  if (!visible) return null;

  return (
    <div
      className="graph-viewer-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="graph-viewer-modal">
        <div className="graph-viewer-header">
          <h3 className="graph-viewer-title">{title || '图片生成结果'}</h3>
          <div className="graph-viewer-actions">
            <button
              type="button"
              className={`graph-viewer-tab ${viewMode === 'content' ? 'active' : ''}`}
              onClick={() => setViewMode('content')}
            >
              内容
            </button>
            <button
              type="button"
              className={`graph-viewer-tab ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              查看数据
            </button>
            {viewMode === 'content' && (
              <div className="graph-viewer-zoom-group">
                <button type="button" onClick={handleZoomOut}>
                  -
                </button>
                <span className="graph-viewer-zoom-label">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={handleZoomIn}>
                  +
                </button>
                <button type="button" onClick={handleResetView}>
                  重置
                </button>
              </div>
            )}
            <button type="button" className="graph-viewer-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="graph-viewer-body">
          {loading && <p className="muted">加载中...</p>}
          {error && <p className="graph-viewer-error">{error}</p>}
          {!loading && !error && viewMode === 'content' && mediaUrls.length === 0 && (
            <p className="muted">暂无生成结果</p>
          )}
          {!loading && !error && viewMode === 'content' && mediaUrls.length > 0 && (
            <div className="graph-viewer-main">
              <div
                className="graph-viewer-stage"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={mediaUrls[activeIndex]}
                  alt={`结果 ${activeIndex + 1}`}
                  className="graph-viewer-image"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
                  }}
                  draggable={false}
                  onDoubleClick={handleResetView}
                />
              </div>
              {mediaUrls.length > 1 && (
                <div className="graph-viewer-thumbs">
                  {mediaUrls.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`graph-viewer-thumb-btn ${
                        idx === activeIndex ? 'active' : ''
                      }`}
                      onClick={() => {
                        setActiveIndex(idx);
                        handleResetView();
                      }}
                    >
                      <img src={url} alt={`缩略图 ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!loading && viewMode === 'raw' && task && (
            <pre className="graph-viewer-raw">
              {JSON.stringify(task, null, 2)}
            </pre>
          )}
        </div>
        <style>{`
          .graph-viewer-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 0;
          }
          .graph-viewer-modal {
            background: hsl(var(--background));
            border: 1px solid hsl(var(--border));
            border-radius: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .graph-viewer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid hsl(var(--border));
          }
          .graph-viewer-title {
            margin: 0;
            font-size: 1rem;
            color: hsl(var(--foreground));
            max-width: 40%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .graph-viewer-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .graph-viewer-tab {
            padding: 0.32rem 0.85rem;
            font-size: 0.82rem;
            border-radius: 999px;
            border: 1px solid hsl(var(--border));
            background: rgba(15,23,42,0.02);
            color: hsl(var(--muted-foreground));
            cursor: pointer;
            transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
          }
          .graph-viewer-tab:hover {
            background: rgba(148,163,184,0.12);
            color: hsl(var(--foreground));
            border-color: rgba(148,163,184,0.7);
            transform: translateY(-1px);
          }
          .graph-viewer-tab.active {
            background: linear-gradient(135deg, rgba(56,189,248,0.16), rgba(56,189,248,0.10));
            color: hsl(var(--foreground));
            border-color: rgba(56,189,248,0.7);
          }
          .graph-viewer-close {
            background: none;
            border: none;
            color: hsl(var(--muted-foreground));
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0 0.4rem;
            line-height: 1;
          }
          .graph-viewer-close:hover {
            color: hsl(var(--foreground));
          }
          .graph-viewer-body {
            flex: 1;
            overflow: hidden;
        
          }
          .graph-viewer-main {
            display: flex;
            flex-direction: column;
            height: 100%;
            gap: 0.75rem;
          }
          .graph-viewer-stage {
            flex: 1;
            background: radial-gradient(circle at top, #0f172a, #020617);
            border-radius: 12px;
            border: 1px solid hsl(var(--border));
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            cursor: grab;
          }
          .graph-viewer-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            user-select: none;
            will-change: transform;
            transition: transform 0.05s linear;
          }
          .graph-viewer-thumbs {
            display: flex;
            gap: 0.5rem;
            overflow-x: auto;
            padding-bottom: 0.25rem;
          }
          .graph-viewer-thumb-btn {
            border: 1px solid hsl(var(--border));
            background: rgba(15,23,42,0.9);
            padding: 0;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            flex: 0 0 auto;
          }
          .graph-viewer-thumb-btn img {
            display: block;
            width: 80px;
            height: 60px;
            object-fit: cover;
          }
          .graph-viewer-thumb-btn.active {
            border-color: rgba(79,70,229,0.9);
            box-shadow: 0 0 0 1px rgba(79,70,229,0.5);
          }
          .graph-viewer-error { color: #fca5a5; }
          .graph-viewer-raw {
            margin: 0;
            padding: 1rem;
            background: #0f172a;
            border: 1px solid hsl(var(--border));
            border-radius: 8px;
            font-size: 0.8rem;
            color: #cbd5f5;
            overflow: auto;
            max-height: 70vh;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .graph-viewer-zoom-group {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            margin-right: 0.5rem;
          }
          .graph-viewer-zoom-group button {
            padding: 0.18rem 0.5rem;
            font-size: 0.78rem;
            border-radius: 999px;
            border: 1px solid hsl(var(--border));
            background: rgba(15,23,42,0.85);
            color: hsl(var(--muted-foreground));
            cursor: pointer;
          }
          .graph-viewer-zoom-group button:hover {
            border-color: rgba(148,163,184,0.7);
            background: rgba(30,64,175,0.4);
            color: hsl(var(--foreground));
          }
          .graph-viewer-zoom-label {
            min-width: 3rem;
            text-align: center;
            font-size: 0.8rem;
            color: hsl(var(--muted-foreground));
          }
        `}</style>
      </div>
    </div>
  );
}
