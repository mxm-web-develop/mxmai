import { Segmented } from 'antd';

export type UploadSourceTab = 'self' | 'partner';

type Props = {
  value: UploadSourceTab;
  onChange: (value: UploadSourceTab) => void;
  className?: string;
};

/** 上传管理器：个人上传 vs 第三方应用终端用户上传 */
export function UploadSourceTabs({ value, onChange, className }: Props) {
  return (
    <Segmented
      className={className ?? 'task-creation-source-tabs upload-source-tabs'}
      value={value}
      onChange={(v) => onChange(v as UploadSourceTab)}
      options={[
        { label: '我的上传', value: 'self' },
        { label: '第三方应用', value: 'partner' },
      ]}
    />
  );
}
