// ============= Search Dimension & Depth =============

/** 搜索维度 */
export type SearchDimension =
  | 'general'    // 通用搜索
  | 'news'       // 新闻资讯
  | 'academic'   // 学术论文
  | 'forum'      // 论坛社区
  | 'social'     // 社交媒体
  | 'video'      // 视频平台
  | 'official'   // 官方网站
  | 'finance'    // 金融资讯（Tavily topic=finance + 专业域名）
  | 'all';       // 全维度

/** 搜索深度 */
export type SearchDepth = 'quick' | 'standard' | 'deep';

/** 主题类型（用于自动路由） */
export type TopicType =
  | 'academic'   // 学术研究
  | 'market'     // 市场调研
  | 'investment' // 投资分析
  | 'industry'   // 行业赛道
  | 'news'       // 新闻事件
  | 'product'    // 产品竞品
  | 'prompt'     // 提示词工程
  | 'legal'      // 法律法条/案例
  | 'stock'      // 股市行情
  | 'crypto'     // 区块链/币圈
  | 'business'   // 商业/工商信息
  | 'general';   // 通用

// ============= Search Results =============

/** 单条搜索结果 */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedAt?: string;
  dimension?: SearchDimension;
  /** 置信度评分 0-100 */
  score?: number;
  source: string;
}

/** 单维度搜索结果 */
export interface DimensionSearchResult {
  dimension: SearchDimension;
  provider: string;
  items: SearchResultItem[];
  total: number;
  query: string;
  timestamp: string;
}

// ============= Search Requests =============

/** 多维度聚合搜索请求 */
export interface DeepSearchRequest {
  query: string;
  dimensions?: SearchDimension[];
  depth?: SearchDepth;
  /** 每个维度返回数量 */
  numResults?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** 绝对日期窗（YYYY-MM-DD）；有则优先于相对 timeRange（Tavily start_date/end_date） */
  startDate?: string;
  endDate?: string;
  language?: 'zh' | 'en' | 'all';
  /** 是否深度提取内容 */
  extractContent?: boolean;
  /** 只对特定域名提取 */
  extractDomains?: string[];
  /** 提取内容的 prompt */
  extractPrompt?: string;
  /** 最大提取条数 */
  maxExtractCount?: number;
  /** Tavily 等支持的域名白名单（按 topic 自动注入） */
  includeDomains?: string[];
}

/** 多维度聚合搜索响应 */
export interface MultiDimensionSearchResult {
  dimensionResults: Partial<Record<SearchDimension, DimensionSearchResult>>;
  /** 去重合并后的结果 */
  aggregated: SearchResultItem[];
  query: string;
  depth: SearchDepth;
  timestamp: string;
}

// ============= Content Extraction =============

/** 内容提取结果 */
export interface ContentExtractResult {
  url: string;
  title: string;
  /** 原始内容 */
  content: string;
  /** LLM 生成的摘要 */
  summary?: string;
  /** 关键信息点 */
  keyPoints?: string[];
  /** 结构化数据 */
  dataPoints?: Array<{
    label: string;
    value: string;
    source: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
  extractedAt: string;
}

/** Provider 搜索请求 */
export interface ProviderSearchRequest {
  query: string;
  dimension: SearchDimension;
  numResults: number;
  timeRange?: string;
  /** YYYY-MM-DD absolute window (preferred over timeRange when set) */
  startDate?: string;
  endDate?: string;
  language?: string;
  includeDomains?: string[];
}

// ============= Topic Config =============

/** 主题类型配置 */
export interface TopicConfig {
  topicType: TopicType;
  primaryProviders: string[];
  secondaryProviders: string[];
  defaultDimensions: SearchDimension[];
  recommendedDepth: SearchDepth;
}
