import type { ReactNode } from 'react';
import { pageCardTitle, type PageHintProps } from '../PageHint';

export type AssetCenterHint = string | Omit<PageHintProps, 'className' | 'emphasis'>;

type Props = {
  title: string;
  hint?: AssetCenterHint;
  stats?: ReactNode;
  actions?: ReactNode;
};

function renderTitle(title: string, hint?: AssetCenterHint) {
  if (!hint) return title;
  if (typeof hint === 'string') {
    return pageCardTitle(title, { title: '使用说明', description: hint });
  }
  return pageCardTitle(title, { title: hint.title ?? '使用说明', description: hint.description, tone: hint.tone, label: hint.label, placement: hint.placement });
}

/** 资产中心统一页头：知识库 / 上传管理器 */
export function AssetCenterPageHeader({ title, hint, stats, actions }: Props) {
  return (
    <div className="asset-center-header">
      <div className="asset-center-title-row">
        <h2>{renderTitle(title, hint)}</h2>
        {stats ? <div className="asset-center-stats">{stats}</div> : null}
      </div>
      {actions ? <div className="asset-center-actions">{actions}</div> : null}
    </div>
  );
}
