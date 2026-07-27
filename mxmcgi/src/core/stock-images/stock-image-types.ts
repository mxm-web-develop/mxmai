export interface StockImageItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  license: string;
  width: number | null;
  height: number | null;
  /** 来源平台（混合检索时逐条标注） */
  provider?: StockImageSource;
}

export interface StockImageSearchResult {
  items: StockImageItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type StockImageSource = 'pexels' | 'unsplash' | 'pixabay' | 'openverse';

/** API 响应：单源或 mixed 聚合 */
export type StockImageProvider = StockImageSource | 'mixed';
