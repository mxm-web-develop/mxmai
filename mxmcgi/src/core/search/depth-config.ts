import type { SearchDepth } from './types';

export interface SearchDepthConfig {
  dimensions: SearchDimension[];
  keywordsPerDimension: number;
  resultsPerProvider: number;
  extractContent: boolean;
  crossValidate: boolean;
  iterate: boolean;
}

/**
 * 搜索深度配置
 * 定义 quick/standard/deep 三种深度的具体参数
 */
export const DEPTH_CONFIGS: Record<SearchDepth, SearchDepthConfig> = {
  quick: {
    dimensions: ['general', 'news'].slice(0, 2) as SearchDimension[],
    keywordsPerDimension: 1,
    resultsPerProvider: 3,
    extractContent: false,
    crossValidate: false,
    iterate: false,
  },
  standard: {
    dimensions: ['news', 'academic', 'forum', 'official', 'general'] as SearchDimension[],
    keywordsPerDimension: 2,
    resultsPerProvider: 5,
    extractContent: true,
    crossValidate: false,
    iterate: false,
  },
  deep: {
    dimensions: ['news', 'academic', 'forum', 'official', 'social', 'video'] as SearchDimension[],
    keywordsPerDimension: 3,
    resultsPerProvider: 8,
    extractContent: true,
    crossValidate: true,
    iterate: true,
  },
};

import type { SearchDimension } from './types';
