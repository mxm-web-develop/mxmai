import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './MediaViewerHeader.css';

export interface MediaViewerTab {
  value: string;
  label: string;
}

interface MediaViewerHeaderProps {
  title: string;
  titleId?: string;
  tabs?: MediaViewerTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  tabsAriaLabel?: string;
  children?: ReactNode;
  onClose: () => void;
  closeTitle?: string;
  showTitleAccent?: boolean;
}

export function MediaViewerHeader({
  title,
  titleId = 'media-viewer-title',
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel = '预览模式',
  children,
  onClose,
  closeTitle = '关闭预览',
  showTitleAccent = true,
}: MediaViewerHeaderProps) {
  const { isAdmin } = useAuth();
  // 内容/数据切换仅 admin 可见；普通用户只看内容态
  const showTabs =
    isAdmin && Boolean(tabs && tabs.length > 0 && onTabChange && activeTab !== undefined);

  return (
    <header className="mvh-header">
      <div className="mvh-title-wrap">
        {showTitleAccent ? <span className="mvh-title-accent" aria-hidden /> : null}
        <div id={titleId} className="mvh-title" title={title} role="heading" aria-level={2}>
          {title}
        </div>
      </div>

      <div className="mvh-actions">
        {showTabs ? (
          <div className="mvh-segmented" role="tablist" aria-label={tabsAriaLabel}>
            {tabs!.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                className={clsx('mvh-segment', activeTab === tab.value && 'mvh-segment--active')}
                onClick={() => onTabChange!(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {children}

        <MediaViewerHeaderDivider />
        <button
          type="button"
          className="mvh-icon-btn"
          onClick={onClose}
          aria-label={closeTitle}
          title={closeTitle}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

export function MediaViewerHeaderDivider() {
  return <span className="mvh-action-divider" aria-hidden />;
}

export function MediaViewerToolbarScroll({ children }: { children: ReactNode }) {
  return <div className="mvh-toolbar-scroll">{children}</div>;
}

export function MediaViewerHeaderIconButton({
  className,
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={clsx('mvh-icon-btn', active && 'mvh-icon-btn--active', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function MediaViewerHeaderLabel({ children }: { children: ReactNode }) {
  return <span className="mvh-toolbar-label">{children}</span>;
}

export function MediaViewerHeaderToolGroup({
  children,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <div className="mvh-tool-group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
