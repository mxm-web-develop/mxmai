import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Empty, Input, Modal, Pagination, Typography } from 'antd';
import { ExternalLink, Search } from 'lucide-react';
import BrandLoading from '../BrandLoading';
import {
  searchStockImages,
  searchStockVideos,
  type StockImageItem,
  type StockVideoItem,
} from '../../api/client';
import { toUserFacingErrorMessage } from '../../lib/platformErrors';
import {
  DEFAULT_STOCK_IMAGE_ATTRIBUTION,
  stockImageLicenseUrl,
  stockImageSourceLabel,
} from '../../lib/stockImageSource';

export type StockMediaPick =
  | { kind: 'image'; url: string; title?: string; provider?: string }
  | { kind: 'video'; url: string; title?: string; provider?: string };

type StockMediaPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (pick: StockMediaPick) => void;
  /** 打开时预填检索词（如分镜检索词 / 字幕） */
  initialQuery?: string;
  defaultTab?: 'image' | 'video';
};

export function StockMediaPickerModal({
  open,
  onClose,
  onSelect,
  initialQuery = '',
  defaultTab = 'image',
}: StockMediaPickerModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [tab, setTab] = useState<'image' | 'video'>(defaultTab);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [imageItems, setImageItems] = useState<StockImageItem[]>([]);
  const [videoItems, setVideoItems] = useState<StockVideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 12;
  const [provider, setProvider] = useState<string>('mixed');
  const [attribution, setAttribution] = useState(DEFAULT_STOCK_IMAGE_ATTRIBUTION);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setQuery(initialQuery);
    setSubmittedQuery('');
    setImageItems([]);
    setVideoItems([]);
    setTotal(0);
    setPage(1);
    const trimmed = initialQuery.trim();
    if (trimmed) {
      void runSearch(trimmed, 1, defaultTab);
    }
  }, [open, defaultTab, initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- 打开时按业务词预搜

  const runSearch = useCallback(
    async (q: string, p: number, mediaTab: 'image' | 'video') => {
      const trimmed = q.trim();
      if (!trimmed) {
        message.warning(t('video.stock.enterKeyword'));
        return;
      }
      setLoading(true);
      try {
        if (mediaTab === 'video') {
          const res = await searchStockVideos({ q: trimmed, page: p, pageSize, preferWidth: 1920 });
          setVideoItems(res.items);
          setImageItems([]);
          setTotal(res.total);
          if (res.provider) setProvider(res.provider);
          if (res.attribution) setAttribution(res.attribution);
        } else {
          const res = await searchStockImages({ q: trimmed, page: p, pageSize });
          setImageItems(res.items);
          setVideoItems([]);
          setTotal(res.total);
          if (res.provider) setProvider(res.provider);
          if (res.attribution) setAttribution(res.attribution);
        }
        setSubmittedQuery(trimmed);
        setPage(p);
      } catch (e) {
        message.error(toUserFacingErrorMessage(e instanceof Error ? e.message : e, { fallback: t('video.stock.searchFailed') }));
      } finally {
        setLoading(false);
      }
    },
    [message, t]
  );

  useEffect(() => {
    if (!open || !submittedQuery) return;
    void runSearch(submittedQuery, page, tab);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    setPage(1);
    void runSearch(query, 1, tab);
  };

  const handlePickImage = (item: StockImageItem) => {
    onSelect({
      kind: 'image',
      url: item.imageUrl,
      title: item.title,
      provider: item.provider ?? provider,
    });
    onClose();
    message.success(t('video.stock.pickedImage'));
  };

  const handlePickVideo = (item: StockVideoItem) => {
    onSelect({
      kind: 'video',
      url: item.videoUrl,
      title: item.title,
      provider,
    });
    onClose();
    message.success(t('video.stock.pickedVideo'));
  };

  const licenseUrl = tab === 'video' ? stockImageLicenseUrl('pexels') : stockImageLicenseUrl(provider);

  return (
    <Modal
      title={t('video.stock.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
      className="video-timeline-review__stock-picker"
    >
      <div className="video-timeline-review__stock-picker-tabs">
        <Button type={tab === 'image' ? 'primary' : 'default'} onClick={() => setTab('image')}>
          {t('video.stock.image')}
        </Button>
        <Button type={tab === 'video' ? 'primary' : 'default'} onClick={() => setTab('video')}>
          {t('video.stock.video')}
        </Button>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
        {attribution}
      </Typography.Paragraph>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          prefix={<Search size={16} />}
          placeholder={tab === 'video' ? t('video.stock.searchVideoPlaceholder') : t('video.stock.searchImagePlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={handleSubmit}
          allowClear
        />
        <Button type="primary" onClick={handleSubmit} loading={loading}>
          {t('video.stock.search')}
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <BrandLoading />
        </div>
      ) : tab === 'image' ? (
        imageItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={submittedQuery ? t('video.stock.noImages') : t('video.stock.startSearch')}
          />
        ) : (
          <>
            <div className="video-timeline-review__asset-grid">
              {imageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="video-timeline-review__asset-tile"
                  onClick={() => handlePickImage(item)}
                  title={item.creator ? `${item.title} · ${item.creator}` : item.title}
                >
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                  {item.provider ? (
                    <span className="video-timeline-review__asset-tile-badge">
                      {stockImageSourceLabel(item.provider)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {total > pageSize ? (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={setPage} />
              </div>
            ) : null}
          </>
        )
      ) : videoItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={submittedQuery ? t('video.stock.noVideos') : t('video.stock.startSearch')}
        />
      ) : (
        <>
          <div className="video-timeline-review__asset-grid">
            {videoItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="video-timeline-review__asset-tile video-timeline-review__asset-tile--video"
                onClick={() => handlePickVideo(item)}
                title={item.title}
              >
                <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                <span className="video-timeline-review__asset-tile-badge">{t('video.stock.videoBadge')}</span>
              </button>
            ))}
          </div>
          {total > pageSize ? (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={setPage} />
            </div>
          ) : null}
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <Typography.Link href={licenseUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          {t('video.stock.license')}
        </Typography.Link>
      </div>
    </Modal>
  );
}
