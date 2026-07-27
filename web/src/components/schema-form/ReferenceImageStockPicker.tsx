import { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Modal, Pagination, Typography } from 'antd';
import BrandLoading from '../BrandLoading';
import { ExternalLink, Search } from 'lucide-react';
import { searchStockImages, type StockImageItem } from '../../api/client';
import {
  DEFAULT_STOCK_IMAGE_ATTRIBUTION,
  stockImageLicenseUrl,
  stockImageSourceLabel,
} from '../../lib/stockImageSource';

export type ReferenceImageStockPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: StockImageItem) => void;
  /** 打开时预填检索词（如业务主题 / 表单 prompt） */
  initialQuery?: string;
  /** 有 initialQuery 时是否自动发起搜索 */
  autoSearch?: boolean;
};

export function ReferenceImageStockPicker({
  open,
  onClose,
  onSelect,
  initialQuery = '',
  autoSearch = true,
}: ReferenceImageStockPickerProps) {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockImageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(20);
  const [provider, setProvider] = useState<string>('mixed');
  const [attribution, setAttribution] = useState(DEFAULT_STOCK_IMAGE_ATTRIBUTION);

  const runSearch = useCallback(
    async (q: string, p: number) => {
      const trimmed = q.trim();
      if (!trimmed) {
        message.warning('请输入搜索关键词');
        return;
      }
      setLoading(true);
      try {
        const res = await searchStockImages({ q: trimmed, page: p, pageSize });
        setItems(res.items);
        setTotal(res.total);
        setSubmittedQuery(trimmed);
        setPage(p);
        if (res.provider) setProvider(res.provider);
        if (res.attribution) setAttribution(res.attribution);
      } catch (e) {
        message.error(e instanceof Error ? e.message : '图库搜索失败');
      } finally {
        setLoading(false);
      }
    },
    [message, pageSize]
  );

  useEffect(() => {
    if (!open) return;
    const trimmed = initialQuery.trim();
    setQuery(trimmed);
    setSubmittedQuery('');
    setItems([]);
    setTotal(0);
    setPage(1);
    if (trimmed && autoSearch) {
      void runSearch(trimmed, 1);
    }
  }, [open, initialQuery, autoSearch]); // eslint-disable-line react-hooks/exhaustive-deps -- 打开时按业务词预搜

  useEffect(() => {
    if (!open) return;
    if (!submittedQuery) return;
    void runSearch(submittedQuery, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps -- 翻页重搜

  const handleSubmit = () => {
    setPage(1);
    void runSearch(query, 1);
  };

  const handlePick = (item: StockImageItem) => {
    onSelect(item);
    onClose();
    message.success('已添加图库参考图');
  };

  return (
    <Modal
      title="免费图库"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
      afterClose={() => {
        setQuery('');
        setSubmittedQuery('');
        setItems([]);
        setTotal(0);
        setPage(1);
      }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
        {attribution}
      </Typography.Paragraph>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          prefix={<Search size={16} />}
          placeholder="搜索风格、场景、物体… 如 portrait fashion landscape"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={handleSubmit}
          allowClear
        />
        <Button type="primary" onClick={handleSubmit} loading={loading}>
          搜索
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <BrandLoading />
        </div>
      ) : items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={submittedQuery ? '未找到相关图片，换个关键词试试' : '输入关键词开始搜索'}
        />
      ) : (
        <>
          <div className="ref-stock-picker__grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ref-stock-picker__item"
                onClick={() => handlePick(item)}
                title={item.creator ? `${item.title} · ${item.creator}` : item.title}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  loading="lazy"
                  className="ref-stock-picker__img"
                />
                {item.provider ? (
                  <span className="ref-stock-picker__source">{stockImageSourceLabel(item.provider)}</span>
                ) : null}
                {item.creator ? (
                  <span className="ref-stock-picker__caption">{item.creator}</span>
                ) : null}
              </button>
            ))}
          </div>
          {total > pageSize ? (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger={false}
                onChange={(p) => setPage(p)}
              />
            </div>
          ) : null}
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <Typography.Link
          href={stockImageLicenseUrl(provider)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          授权说明
        </Typography.Link>
      </div>
    </Modal>
  );
}
