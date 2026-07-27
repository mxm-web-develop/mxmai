/**
 * 业务表单挂卡选择器：按 card_tag 筛选知识库
 */
import { useEffect, useState } from 'react';
import { Select, Tag } from 'antd';
import {
  getSystemKnowledgeFolders,
  getKnowledgeFolders,
  type FolderCardTag,
  type FolderItem,
} from '../../api/client';

export type FolderCardPickerProps = {
  cardTag: FolderCardTag;
  value?: string | null;
  onChange?: (folderId: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  /** 是否合并系统共享卡 */
  includeSystem?: boolean;
};

function labelFor(f: FolderItem): string {
  const status =
    f.card_status === 'ready'
      ? '✓'
      : f.card_status === 'parsing'
        ? '…'
        : f.card_status === 'failed'
          ? '!'
          : '○';
  const sys = f.is_system ? ' [系统]' : '';
  return `${status} ${f.name}${sys}`;
}

export function FolderCardPicker({
  cardTag,
  value,
  onChange,
  placeholder,
  allowClear = true,
  disabled,
  className,
  includeSystem = true,
}: FolderCardPickerProps) {
  const [options, setOptions] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const mine = await getKnowledgeFolders({ force: true });
        const filtered = mine.filter((f) => f.card_tag === cardTag);
        let merged = filtered;
        if (includeSystem) {
          const sys = await getSystemKnowledgeFolders(cardTag);
          const seen = new Set(filtered.map((f) => f.id));
          merged = [...filtered, ...sys.filter((s) => !seen.has(s.id))];
        }
        if (!cancelled) setOptions(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardTag, includeSystem]);

  return (
    <div className={className}>
      <Select
        showSearch
        allowClear={allowClear}
        disabled={disabled}
        loading={loading}
        style={{ width: '100%' }}
        placeholder={
          placeholder ??
          `选择${
            cardTag === 'style'
              ? '视觉风格'
              : cardTag === 'writing'
                ? '语感文风'
                : cardTag === 'character'
                  ? '角色'
                  : '知识'
          }卡`
        }
        value={value || undefined}
        optionFilterProp="label"
        options={options.map((f) => ({
          value: f.id,
          label: labelFor(f),
        }))}
        onChange={(v) => onChange?.(v ?? null)}
        optionRender={(opt) => {
          const f = options.find((x) => x.id === opt.value);
          return (
            <span className="inline-flex items-center gap-2">
              <span>{opt.label}</span>
              {f?.is_system ? <Tag color="gold">系统</Tag> : null}
              {f?.card_status === 'ready' ? <Tag color="green">就绪</Tag> : null}
            </span>
          );
        }}
      />
    </div>
  );
}

export default FolderCardPicker;
