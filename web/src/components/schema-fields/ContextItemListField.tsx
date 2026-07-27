import { Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './context-item-list.css';

type ContextItemListFieldProps = {
  items: unknown[];
  maxItems: number;
  minItems?: number;
  addLabel: string;
  emptyHint?: string;
  renderItem: (index: number, item: unknown, onPatch: (next: unknown) => void) => ReactNode;
  onChange: (items: unknown[]) => void;
  createEmptyItem: () => unknown;
};

export function ContextItemListField({
  items,
  maxItems,
  minItems = 0,
  addLabel,
  emptyHint,
  renderItem,
  onChange,
  createEmptyItem,
}: ContextItemListFieldProps) {
  const { t } = useTranslation();
  const rows = items.length > 0 ? items : [createEmptyItem()];

  const patchAt = (index: number, next: unknown) => {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  };

  const removeAt = (index: number) => {
    if (rows.length <= Math.max(minItems, 1)) {
      onChange([createEmptyItem()]);
      return;
    }
    const copy = rows.filter((_, i) => i !== index);
    onChange(copy);
  };

  const addRow = () => {
    if (rows.length >= maxItems) return;
    onChange([...rows, createEmptyItem()]);
  };

  return (
    <div className="context-item-list">
      {emptyHint ? <p className="context-item-list__hint">{emptyHint}</p> : null}
      <div className="context-item-list__stack">
        {rows.map((item, index) => (
          <div key={index} className="context-item-list__row">
            <div className="context-item-list__row-header">
              <span className="context-item-list__index">#{index + 1}</span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label={t("form.contextList.deleteAria")}
                onClick={() => removeAt(index)}
              />
            </div>
            {renderItem(index, item, (next) => patchAt(index, next))}
          </div>
        ))}
      </div>
      <Button
        type="dashed"
        className="context-item-list__add"
        icon={<PlusOutlined />}
        onClick={addRow}
        disabled={rows.length >= maxItems}
        block
      >
        {addLabel}
        {rows.length >= maxItems ? t('form.contextList.maxItems', { max: maxItems }) : ''}
      </Button>
    </div>
  );
}
