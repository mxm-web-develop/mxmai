import { resolvePexelsApiKey } from './pexels-client';
import { searchPexelsStockVideos } from './pexels-videos-client';
import type { StockVideoProvider, StockVideoSearchResult } from './stock-video-types';

export type { StockVideoItem, StockVideoSearchResult, StockVideoProvider } from './stock-video-types';

export function getStockVideoProvider(): StockVideoProvider | null {
  return resolvePexelsApiKey() ? 'pexels' : null;
}

export async function searchStockVideos(input: {
  query: string;
  page?: number;
  pageSize?: number;
  preferWidth?: number;
}): Promise<{ data: StockVideoSearchResult; provider: StockVideoProvider | null; attribution: string }> {
  const provider = getStockVideoProvider();
  if (!provider) {
    return {
      data: { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 },
      provider: null,
      attribution: '视频素材需配置 PEXELS_API_KEY 后可用（Pexels 免费授权）。',
    };
  }

  const data = await searchPexelsStockVideos(input);
  return {
    data,
    provider,
    attribution: '视频来源 Pexels，可免费用于个人与商业用途。选用即表示接受 Pexels 授权条款。',
  };
}
