import { useTranslation } from 'react-i18next';
import { getPublishedSlugLabel } from '../lib/taskCreationSource';

type Props = {
  metadata?: Record<string, unknown> | null;
};

/** 开放 API 任务角标（slug） */
export function TaskOpenApiBadge({ metadata }: Props) {
  const { t } = useTranslation();
  const slug = getPublishedSlugLabel(metadata);
  if (!slug) return null;
  return (
    <span className="task-open-api-badge" title={t('common.openApiTitle', { slug })}>
      {t('common.thirdPartyBadge', { slug })}
    </span>
  );
}
