export interface StockVideoItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  license: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface StockVideoSearchResult {
  items: StockVideoItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type StockVideoProvider = 'pexels';
