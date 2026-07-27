import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TASK_STATUS_FILTER_KEYS, getTaskStatusLabel } from './taskStatus';

/** 任务状态筛选下拉选项 */
export function useTaskStatusOptions() {
  const { t } = useTranslation();

  return useMemo(
    () =>
      TASK_STATUS_FILTER_KEYS.map((status) => ({
        value: status,
        label: getTaskStatusLabel(status, t),
      })),
    [t]
  );
}
