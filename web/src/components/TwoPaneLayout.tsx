import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface TwoPaneLayoutProps {
  /** 左侧区域，一般为任务列表 */
  left: ReactNode;
  /** 右侧区域，一般为表单/详情 */
  right: ReactNode;
  /** 外层附加 className（可选） */
  className?: string;
  /** 左侧容器附加 className（可选） */
  leftClassName?: string;
  /** 右侧容器附加 className（可选） */
  rightClassName?: string;
}

/**
 * 通用「列表 + 表单」双栏布局组件。
 *
 * - ≥1200px: 左右并列布局
 * - <1200px: 仅展示列表，表单通过浮层弹出（右下角按钮触发）
 */
export function TwoPaneLayout({
  left,
  right,
  className,
  leftClassName,
  rightClassName,
}: TwoPaneLayoutProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 1199px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  if (isMobile) {
    return (
      <div className={`two-pane-layout two-pane-layout--mobile ${className ?? ''}`.trim()}>
        <div className={`two-pane-left ${leftClassName ?? ''}`.trim()}>{left}</div>

        <button
          type="button"
          className="two-pane-fab"
          onClick={() => setOverlayOpen(true)}
        >
          新建任务
        </button>

        {overlayOpen && (
          <div
            className="two-pane-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOverlayOpen(false);
            }}
          >
            <div className={`two-pane-overlay-inner ${rightClassName ?? ''}`.trim()}>
              <div className="two-pane-overlay-header">
                <span className="two-pane-overlay-title">新建任务</span>
                <button
                  type="button"
                  className="two-pane-overlay-close"
                  onClick={() => setOverlayOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="two-pane-overlay-body">{right}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`two-pane-layout ${className ?? ''}`.trim()}>
      <div className={`two-pane-left ${leftClassName ?? ''}`.trim()}>{left}</div>
      <div className={`two-pane-right ${rightClassName ?? ''}`.trim()}>{right}</div>
    </div>
  );
}


