import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type TaskScopeKey =
  | 'video'
  | 'graph'
  | 'audio'
  | 'music'
  | 'writing'
  | 'outline'
  | 'text'
  | 'characters';

/** 各 scope 新建任务、空态、默认标题等文案 */
export function useTaskScopeLabels(scope: TaskScopeKey) {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      scopeLabel: t(`generation.scope.${scope}`),
      createLabel: t(`generation.create.${scope}`),
      emptyHint: t(`generation.empty.${scope}`),
      defaultTitle: t('common.task.defaultTitle', { scope: t(`generation.scope.${scope}`) }),
    }),
    [t, scope]
  );
}
