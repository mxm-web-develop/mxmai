import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from 'lucide-react';

interface ReaderToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  fitWidthActive?: boolean;
  currentPage: number;
  totalPages: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  canPrevPage?: boolean;
  canNextPage?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
}

export function ReaderToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  fitWidthActive = true,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  canPrevPage = false,
  canNextPage = false,
  className,
  variant = 'default',
}: ReaderToolbarProps) {
  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      className={clsx(
        'doc-reader-toolbar',
        variant === 'compact' && 'doc-reader-toolbar--compact',
        className,
      )}
      role="toolbar"
      aria-label="PDF 阅读工具"
    >
      <div className="doc-reader-toolbar-group">
        <button
          type="button"
          className="doc-reader-toolbar-btn"
          onClick={onZoomOut}
          disabled={zoom <= 0.75}
          aria-label="缩小"
          title="缩小"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <span className="doc-reader-toolbar-label">{zoomPct}%</span>
        <button
          type="button"
          className="doc-reader-toolbar-btn"
          onClick={onZoomIn}
          disabled={zoom >= 1.5}
          aria-label="放大"
          title="放大"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        className={clsx(
          'doc-reader-toolbar-btn',
          fitWidthActive && 'doc-reader-toolbar-btn--active',
        )}
        onClick={onFitWidth}
        aria-label="适应宽度"
        title="适应宽度"
      >
        <Maximize2 size={14} strokeWidth={2} />
      </button>
      {totalPages > 1 && onPrevPage && onNextPage ? (
        <div className="doc-reader-toolbar-group doc-reader-toolbar-group--pages">
          <button
            type="button"
            className="doc-reader-toolbar-btn"
            onClick={onPrevPage}
            disabled={!canPrevPage}
            aria-label="上一页"
            title="上一页"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <span className="doc-reader-toolbar-label doc-reader-toolbar-page" aria-live="polite">
            {currentPage}/{totalPages}
          </span>
          <button
            type="button"
            className="doc-reader-toolbar-btn"
            onClick={onNextPage}
            disabled={!canNextPage}
            aria-label="下一页"
            title="下一页"
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      ) : totalPages > 0 ? (
        <span className="doc-reader-toolbar-label doc-reader-toolbar-page" aria-live="polite">
          {currentPage}/{totalPages}
        </span>
      ) : null}
    </div>
  );
}
