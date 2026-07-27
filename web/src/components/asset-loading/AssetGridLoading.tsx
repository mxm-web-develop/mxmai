import './AssetGridLoading.css';

interface AssetGridLoadingProps {
  count?: number;
  className?: string;
}

/** 资产中心 / 知识库网格骨架 */
export function AssetGridLoading({ count = 8, className = '' }: AssetGridLoadingProps) {
  return (
    <div
      className={`asset-grid-loading ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="资产列表加载中"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="asset-grid-loading__card"
          style={{ ['--agl-delay' as string]: `${i * 0.06}s` }}
        >
          <div className="asset-grid-loading__thumb">
            <span className="asset-grid-loading__scan" />
          </div>
          <div className="asset-grid-loading__body">
            <span className="asset-grid-loading__line asset-grid-loading__line--title" />
            <span className="asset-grid-loading__line asset-grid-loading__line--meta" />
          </div>
        </div>
      ))}
    </div>
  );
}
