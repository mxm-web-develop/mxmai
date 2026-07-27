/**
 * 行业日报 / warp industryTrend → 搜索引擎模块策略。
 * 维度、深度、域名白名单走 SearchService / 区域策略；禁止默认锁死中国大陆。
 * 自定义行业须先写入 search_track（模型分类）；本函数只消费已有 track / 枚举快捷。
 */
import type { SearchDepth, SearchDimension } from '../../core/search/types';
import {
  inferTrackHeuristicFallback,
  isIndustrySearchTrack,
  mapEnumIndustryToTrack,
  readExistingSearchTrack,
  resolveSectorLabel,
  type IndustrySearchTrack,
} from './industry-search-track-classify';
import {
  domainsForRegionAndTrack,
  normalizeSearchRegion,
  querySuffixesForRegionAndTrack,
  searchLanguageForRegion,
  sectorQueryLabel,
  type SearchRegion,
} from './industry-search-region';

export type { IndustrySearchTrack, SearchRegion };
export { isIndustrySearchTrack, resolveSectorLabel, normalizeSearchRegion };

export type IndustrySearchStrategy = {
  /** 归一化后的赛道名（展示用，可为用户原文） */
  sector: string;
  /** 写入查询的赛道标签（按区域可英文化） */
  sectorQuery: string;
  /** 策略键：与维度选型对齐 */
  track: IndustrySearchTrack;
  /** 新闻检索范围；默认 global */
  searchRegion: SearchRegion;
  dimensions: SearchDimension[];
  depth: SearchDepth;
  /** 传给 SearchService / Tavily 的域名偏好；global=undefined 不强制白名单 */
  includeDomains?: string[];
  /**
   * 查询后缀（与「赛道 + 日期」组合），按赛道 + 区域区分。
   */
  querySuffixes: string[];
  /** 检索引擎语种（可与成稿 language 不同） */
  searchLanguage: 'zh' | 'en' | 'all';
};

function strategyForTrack(
  sector: string,
  track: IndustrySearchTrack,
  searchRegion: SearchRegion
): IndustrySearchStrategy {
  const dimensions: SearchDimension[] =
    track === 'finance'
      ? ['news', 'finance']
      : track === 'entertainment'
        ? ['news', 'social']
        : ['news', 'general'];

  return {
    sector,
    sectorQuery: sectorQueryLabel(sector, searchRegion),
    track,
    searchRegion,
    dimensions,
    depth: 'quick',
    includeDomains: domainsForRegionAndTrack(searchRegion, track),
    querySuffixes: querySuffixesForRegionAndTrack(searchRegion, track),
    searchLanguage: searchLanguageForRegion(searchRegion),
  };
}

/**
 * 解析 track：优先 params.search_track → 枚举行业 → 启发式兜底（自定义应在调用前由模型写入 search_track）。
 */
export function resolveTrackFromParams(params: Record<string, unknown>): IndustrySearchTrack {
  const existing = readExistingSearchTrack(params);
  if (existing) return existing;
  const industry = String(params.industry ?? '').trim();
  const enumTrack = mapEnumIndustryToTrack(industry);
  if (enumTrack && industry !== '其他' && industry !== '其它') return enumTrack;
  return inferTrackHeuristicFallback(resolveSectorLabel(params));
}

/**
 * 按用户选择的行业 + 检索范围解析策略（供 preview + warp webSearch 共用）。
 * 自定义行业请先调用 resolveSearchTrackForParams 写入 search_track。
 */
export function resolveIndustrySearchStrategy(
  params: Record<string, unknown>
): IndustrySearchStrategy {
  const sector = resolveSectorLabel(params);
  const track = resolveTrackFromParams(params);
  const searchRegion = normalizeSearchRegion(params.search_region ?? params.searchRegion);
  return strategyForTrack(sector, track, searchRegion);
}
