import { Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';

type Props = {
  value: TaskCreationSourceTab;
  onChange: (value: TaskCreationSourceTab) => void;
  className?: string;
};

/** 任务/素材列表：我的创作 vs 第三方应用（开放 API，含 H5） */
export function TaskCreationSourceTabs({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  return (
    <Segmented
      className={className}
      value={value}
      onChange={(v) => onChange(v as TaskCreationSourceTab)}
      options={[
        { label: t('common.task.source.myCreations'), value: 'web' },
        { label: t('common.task.source.thirdPartyApps'), value: 'open_api' },
      ]}
    />
  );
}
