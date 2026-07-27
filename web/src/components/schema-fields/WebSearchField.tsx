import { useTranslation } from 'react-i18next';
import { Select, Input } from 'antd';
import type { SearchDepth } from '../../shared/searchDepth';
import { ContextItemListField } from './ContextItemListField';

export type WebSearchItem = {
  searchDepth?: SearchDepth;
  query?: string;
  maxResults?: number;
};

export type WebSearchValue = {
  items?: WebSearchItem[];
  /** @deprecated 旧版单条 */
  searchDepth?: SearchDepth;
  query?: string;
  maxResults?: number;
  provider?: string;
};

type WebSearchFieldProps = {
  value: unknown;
  enumSearchDepths?: SearchDepth[];
  maxItems?: number;
  autoFromHint?: string;
  onChange: (next: WebSearchValue) => void;
};

function normalizeItems(raw: unknown): WebSearchItem[] {
  if (!raw || typeof raw !== 'object') return [{}];
  const o = raw as WebSearchValue;
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items.map((it) => ({ ...it }));
  }
  if (typeof o.query === 'string' || o.searchDepth) {
    return [
      {
        searchDepth: o.searchDepth,
        query: o.query ?? '',
        maxResults: o.maxResults,
      },
    ];
  }
  return [{}];
}

function parseItem(raw: unknown): WebSearchItem {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const depthRaw = typeof o.searchDepth === 'string' ? o.searchDepth.trim() : '';
  const searchDepth =
    depthRaw === 'quick' || depthRaw === 'standard' || depthRaw === 'deep' ? depthRaw : undefined;
  return {
    searchDepth,
    query: typeof o.query === 'string' ? o.query : '',
    maxResults: typeof o.maxResults === 'number' ? o.maxResults : undefined,
  };
}

export function WebSearchField({
  value,
  enumSearchDepths,
  maxItems = 5,
  autoFromHint,
  onChange,
}: WebSearchFieldProps) {
  const { t } = useTranslation();
  const items = normalizeItems(value);

  const allDepthOptions: { value: SearchDepth; label: string }[] = [
    { value: 'quick', label: t('form.webSearch.depthQuick') },
    { value: 'standard', label: t('form.webSearch.depthStandard') },
    { value: 'deep', label: t('form.webSearch.depthDeep') },
  ];
  const depthOptions =
    Array.isArray(enumSearchDepths) && enumSearchDepths.length > 0
      ? allDepthOptions.filter((o) => enumSearchDepths.includes(o.value))
      : allDepthOptions;

  const emit = (nextItems: unknown[]) => {
    onChange({
      items: nextItems.map((row) => parseItem(row)),
    });
  };

  return (
    <ContextItemListField
      items={items}
      maxItems={maxItems}
      addLabel={t("form.webSearch.addItem")}
      emptyHint={autoFromHint ?? t('form.webSearch.emptyHint')}
      createEmptyItem={() => ({ searchDepth: 'standard' as SearchDepth, query: '' })}
      onChange={emit}
      renderItem={(_index, item, onPatch) => {
        const parsed = parseItem(item);
        const patch = (partial: Partial<WebSearchItem>) => onPatch({ ...parsed, ...partial });
        return (
          <div className="context-item-list__body">
            <Select
              placeholder={t("form.webSearch.depthPlaceholder")}
              value={parsed.searchDepth ?? 'standard'}
              options={depthOptions}
              onChange={(d) => patch({ searchDepth: d as SearchDepth })}
            />
            <Input.TextArea
              rows={2}
              placeholder={t("form.webSearch.queryPlaceholder")}
              value={parsed.query ?? ''}
              onChange={(e) => patch({ query: e.target.value })}
            />
          </div>
        );
      }}
    />
  );
}
