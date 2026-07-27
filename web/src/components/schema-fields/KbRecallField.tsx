import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Select } from 'antd';
import { getKnowledgeFolders, type FolderItem } from '../../api/client';
import { ContextItemListField } from './ContextItemListField';

export type KbRecallItem = {
  folderId?: string;
  query?: string;
  limit?: number;
};

export type KbRecallValue = {
  items?: KbRecallItem[];
  /** @deprecated 旧版单条 */
  folderId?: string;
  query?: string;
  limit?: number;
};

type KbRecallFieldProps = {
  value: unknown;
  maxItems?: number;
  onChange: (next: KbRecallValue) => void;
};

function normalizeItems(raw: unknown): KbRecallItem[] {
  if (!raw || typeof raw !== 'object') return [{}];
  const o = raw as KbRecallValue;
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items.map((it) => ({ ...it }));
  }
  if (typeof o.folderId === 'string' || typeof o.query === 'string') {
    return [{ folderId: o.folderId ?? '', query: o.query ?? '', limit: o.limit }];
  }
  return [{}];
}

function parseItem(raw: unknown): KbRecallItem {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  return {
    folderId: typeof o.folderId === 'string' ? o.folderId : '',
    query: typeof o.query === 'string' ? o.query : '',
    limit: typeof o.limit === 'number' ? o.limit : undefined,
  };
}

export function KbRecallField({ value, maxItems = 5, onChange }: KbRecallFieldProps) {
  const { t } = useTranslation();
  const items = normalizeItems(value);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getKnowledgeFolders({ force: true })
      .then((list) => {
        if (!cancelled) setFolders(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    return folders
      .filter((f) => f.index_status === 'indexed')
      .map((f) => ({
        value: f.id,
        label: f.name,
      }));
  }, [folders]);

  const emit = (nextItems: unknown[]) => {
    onChange({
      items: nextItems.map((row) => parseItem(row)),
    });
  };

  return (
    <ContextItemListField
      items={items}
      maxItems={maxItems}
      addLabel={t("form.kbRecall.addItem")}
      emptyHint={t("form.kbRecall.emptyHint")}
      createEmptyItem={() => ({ folderId: '', query: '' })}
      onChange={emit}
      renderItem={(_index, item, onPatch) => {
        const parsed = parseItem(item);
        const patch = (partial: Partial<KbRecallItem>) => onPatch({ ...parsed, ...partial });
        return (
          <div className="context-item-list__body">
            <Select
              showSearch
              allowClear
              placeholder={t("form.kbRecall.folderPlaceholder")}
              loading={loading}
              value={parsed.folderId?.trim() ? parsed.folderId : undefined}
              options={options}
              optionFilterProp="label"
              onChange={(id) => patch({ folderId: id ? String(id) : '' })}
              notFoundContent={
                loading ? t('form.kbRecall.loadingFolders') : t('form.kbRecall.noIndexedFolders')
              }
            />
            <Input.TextArea
              rows={2}
              placeholder={t("form.kbRecall.queryPlaceholder")}
              value={parsed.query ?? ''}
              onChange={(e) => patch({ query: e.target.value })}
            />
          </div>
        );
      }}
    />
  );
}
