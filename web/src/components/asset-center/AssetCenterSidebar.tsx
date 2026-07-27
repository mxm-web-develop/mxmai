import type { ReactNode } from 'react';

type Props = {
  title: string;
  onNewFolder?: () => void;
  newLabel?: string;
  /** 侧栏顶部（如 资产/临时 切换） */
  modeSlot?: ReactNode;
  children: ReactNode;
};

/** 左侧文件夹栏 — Finder / iOS Files 风格 */
export function AssetCenterSidebar({ title, onNewFolder, newLabel = '+ 新建', modeSlot, children }: Props) {
  return (
    <aside className="asset-center-sidebar">
      {modeSlot ? <div className="asset-sidebar-mode">{modeSlot}</div> : null}
      <div className="asset-sidebar-section">
        <div className="asset-sidebar-header">
          <span>{title}</span>
          {onNewFolder ? (
            <button type="button" className="btn-link" onClick={onNewFolder}>
              {newLabel}
            </button>
          ) : null}
        </div>
        <div className="asset-sidebar-scroll">{children}</div>
      </div>
    </aside>
  );
}
