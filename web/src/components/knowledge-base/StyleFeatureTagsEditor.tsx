import { useEffect, useState } from 'react';
import { Select } from 'antd';

const MAX_TAGS = 3;

type StyleFeatureTagsEditorProps = {
  value?: string[];
  disabled?: boolean;
  onSave: (tags: string[]) => Promise<void>;
};

/** 视觉风格 / 语感文风素材特征标签（最多 3），点击卡片区域不冒泡 */
export function StyleFeatureTagsEditor({
  value,
  disabled,
  onSave,
}: StyleFeatureTagsEditorProps) {
  const [tags, setTags] = useState<string[]>(value ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTags(value ?? []);
  }, [value]);

  const commit = async (next: string[]) => {
    const cleaned = next
      .map((t) => t.trim().slice(0, 16))
      .filter(Boolean)
      .slice(0, MAX_TAGS);
    setTags(cleaned);
    const prev = (value ?? []).join('\0');
    const now = cleaned.join('\0');
    if (prev === now) return;
    setSaving(true);
    try {
      await onSave(cleaned);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="vf-style-feature-tags"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Select
        mode="tags"
        size="small"
        style={{ width: '100%' }}
        placeholder="特征标签（最多3）"
        value={tags}
        disabled={disabled || saving}
        maxCount={MAX_TAGS}
        tokenSeparators={[',', '，', ' ']}
        onChange={(v) => void commit(v as string[])}
        options={tags.map((t) => ({ value: t, label: t }))}
        open={undefined}
      />
    </div>
  );
}
