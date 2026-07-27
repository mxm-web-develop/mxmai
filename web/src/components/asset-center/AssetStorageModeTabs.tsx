import { Segmented } from 'antd';
import type { StorageObjectMode } from '../../api/client';

type Props = {
  value: StorageObjectMode;
  onChange: (value: StorageObjectMode) => void;
  className?: string;
};

/** 上传管理器：永久资产 vs 临时文件（样式对齐「我的创作 / 第三方」分段） */
export function AssetStorageModeTabs({ value, onChange, className }: Props) {
  return (
    <Segmented
      className={className ?? 'task-creation-source-tabs'}
      value={value}
      onChange={(v) => onChange(v as StorageObjectMode)}
      options={[
        { label: '资产', value: 'asset' },
        { label: '临时', value: 'temp' },
      ]}
    />
  );
}
