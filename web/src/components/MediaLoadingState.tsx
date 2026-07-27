import type { AssetMediaKind } from './asset-loading/types';
import { getKindMeta } from './asset-loading/kindMeta';
import { useTranslation } from 'react-i18next';
import './MediaLoadingState.css';

export type MediaLoadingVariant = 'stage' | 'compact' | 'inline';

interface MediaLoadingStateProps {
  /** stage: 查看器大画布；compact: 缩略图；inline: 行内小块 */
  variant?: MediaLoadingVariant;
  kind?: AssetMediaKind;
  message?: string;
  submessage?: string;
  className?: string;
}

export function MediaLoadingState({
  variant = 'stage',
  kind = 'image',
  message,
  submessage,
  className = '',
}: MediaLoadingStateProps) {
  const { t } = useTranslation();
  const meta = getKindMeta(kind, t);
  const Icon = meta.icon;
  const label =
    message ??
    (variant === 'compact'
      ? t('common.task.loadingKind', { kind: meta.label })
      : variant === 'inline'
        ? t('common.task.loadingKindEllipsis', { kind: meta.label })
        : meta.stageMessage);
  const hint = submessage ?? (variant === 'stage' ? meta.stageSubmessage : undefined);

  return (
    <div
      className={`media-loading media-loading--${variant} media-loading--kind-${kind} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="media-loading__canvas" aria-hidden="true">
        <span className="media-loading__corner media-loading__corner--tl" />
        <span className="media-loading__corner media-loading__corner--tr" />
        <span className="media-loading__corner media-loading__corner--bl" />
        <span className="media-loading__corner media-loading__corner--br" />
        <span className="media-loading__grid" />
        <span className="media-loading__shimmer" />
        <span className="media-loading__scan" />
        <span className="media-loading__icon">
          <Icon size={variant === 'stage' ? 28 : variant === 'compact' ? 18 : 20} strokeWidth={1.5} />
        </span>
      </div>

      {variant !== 'compact' && (
        <div className="media-loading__text">
          <p className="media-loading__message">{label}</p>
          {hint && <p className="media-loading__submessage">{hint}</p>}
          {variant === 'stage' && (
            <span className="media-loading__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
