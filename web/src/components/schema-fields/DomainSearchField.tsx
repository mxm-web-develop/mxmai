import { Select, Input } from 'antd';
import type { SearchDepth } from '../../shared/searchDepth';
import { ContextItemListField } from './ContextItemListField';

export type DataDomainOption = 'auto' | 'legal' | 'finance' | 'stock' | 'crypto' | 'business';

export type DomainSearchItem = {
  query?: string;
  domain?: DataDomainOption;
  searchDepth?: SearchDepth;
};

export type DomainSearchValue = {
  items?: DomainSearchItem[];
  query?: string;
  domain?: DataDomainOption;
  searchDepth?: SearchDepth;
};

type DomainSearchFieldProps = {
  value: unknown;
  enumSearchDepths?: SearchDepth[];
  maxItems?: number;
  autoFromHint?: string;
  onChange: (next: DomainSearchValue) => void;
};

const DEPTH_OPTIONS: { value: SearchDepth; label: string }[] = [
  { value: 'quick', label: '快速' },
  { value: 'standard', label: '标准' },
  { value: 'deep', label: '深度' },
];

const DOMAIN_OPTIONS: { value: DataDomainOption; label: string }[] = [
  { value: 'auto', label: '自动推断' },
  { value: 'legal', label: '法律' },
  { value: 'finance', label: '金融' },
  { value: 'stock', label: '股市' },
  { value: 'crypto', label: '区块链' },
  { value: 'business', label: '商业/工商' },
];

function normalizeItems(raw: unknown): DomainSearchItem[] {
  if (!raw || typeof raw !== 'object') return [{}];
  const o = raw as DomainSearchValue;
  if (Array.isArray(o.items) && o.items.length > 0) return o.items.map((it) => ({ ...it }));
  if (typeof o.query === 'string' || o.domain || o.searchDepth) {
    return [{ query: o.query ?? '', domain: o.domain, searchDepth: o.searchDepth }];
  }
  return [{}];
}

function parseItem(raw: unknown): DomainSearchItem {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const depthRaw = typeof o.searchDepth === 'string' ? o.searchDepth.trim() : '';
  const searchDepth =
    depthRaw === 'quick' || depthRaw === 'standard' || depthRaw === 'deep' ? depthRaw : undefined;
  const domainRaw = typeof o.domain === 'string' ? o.domain.trim() : '';
  const domain = DOMAIN_OPTIONS.some((d) => d.value === domainRaw)
    ? (domainRaw as DataDomainOption)
    : undefined;
  return {
    searchDepth,
    domain,
    query: typeof o.query === 'string' ? o.query : '',
  };
}

export function DomainSearchField({
  value,
  enumSearchDepths,
  maxItems = 5,
  autoFromHint,
  onChange,
}: DomainSearchFieldProps) {
  const items = normalizeItems(value);
  const depthOptions =
    Array.isArray(enumSearchDepths) && enumSearchDepths.length > 0
      ? DEPTH_OPTIONS.filter((o) => enumSearchDepths.includes(o.value))
      : DEPTH_OPTIONS;

  const emit = (nextItems: unknown[]) => {
    onChange({ items: nextItems.map((row) => parseItem(row)) });
  };

  return (
    <ContextItemListField
      items={items}
      maxItems={maxItems}
      addLabel="添加专业检索"
      emptyHint={autoFromHint ?? '可选法律/金融/股市/币圈/工商领域；留空问题时可自动使用主题'}
      createEmptyItem={() => ({ searchDepth: 'standard' as SearchDepth, domain: 'auto' as DataDomainOption, query: '' })}
      onChange={emit}
      renderItem={(_index, item, onPatch) => {
        const parsed = parseItem(item);
        const patch = (partial: Partial<DomainSearchItem>) => onPatch({ ...parsed, ...partial });
        return (
          <div className="context-item-list__body">
            <Select
              placeholder="数据领域"
              value={parsed.domain ?? 'auto'}
              options={DOMAIN_OPTIONS}
              onChange={(d) => patch({ domain: d as DataDomainOption })}
            />
            <Select
              placeholder="检索深度"
              value={parsed.searchDepth ?? 'standard'}
              options={depthOptions}
              onChange={(d) => patch({ searchDepth: d as SearchDepth })}
            />
            <Input.TextArea
              rows={2}
              placeholder="检索问题（可留空以使用主题自动填充）"
              value={parsed.query ?? ''}
              onChange={(e) => patch({ query: e.target.value })}
            />
          </div>
        );
      }}
    />
  );
}
