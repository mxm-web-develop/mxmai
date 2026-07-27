import type { TopicType, SearchDimension, SearchDepth, TopicConfig } from './types';

export type { TopicConfig };

/**
 * 主题类型配置
 * 定义每种主题的推荐 Provider、维度、搜索深度
 */
export const TOPIC_CONFIGS: Record<TopicType, TopicConfig> = {
  academic: {
    topicType: 'academic',
    primaryProviders: ['arxiv', 'anysearch', 'tavily'],
    secondaryProviders: ['serpapi'],
    defaultDimensions: ['academic', 'official'],
    recommendedDepth: 'deep',
  },
  market: {
    topicType: 'market',
    primaryProviders: ['tavily', 'anysearch', 'bocha'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['news', 'finance', 'official'],
    recommendedDepth: 'standard',
  },
  investment: {
    topicType: 'investment',
    primaryProviders: ['anysearch', 'tavily', 'bocha'],
    secondaryProviders: ['serpapi'],
    defaultDimensions: ['finance', 'news', 'official'],
    recommendedDepth: 'deep',
  },
  industry: {
    topicType: 'industry',
    primaryProviders: ['tavily', 'anysearch', 'bocha'],
    secondaryProviders: ['brave', 'serpapi'],
    defaultDimensions: ['news', 'official', 'forum', 'academic'],
    recommendedDepth: 'standard',
  },
  news: {
    topicType: 'news',
    primaryProviders: ['tavily', 'brave', 'anysearch', 'bocha'],
    secondaryProviders: ['duckduckgo'],
    defaultDimensions: ['news', 'social'],
    recommendedDepth: 'quick',
  },
  product: {
    topicType: 'product',
    primaryProviders: ['anysearch', 'brave', 'serpapi'],
    secondaryProviders: ['tavily'],
    defaultDimensions: ['forum', 'social', 'news'],
    recommendedDepth: 'standard',
  },
  prompt: {
    topicType: 'prompt',
    primaryProviders: ['serpapi', 'tavily', 'anysearch'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['official', 'forum', 'social'],
    recommendedDepth: 'standard',
  },
  legal: {
    topicType: 'legal',
    primaryProviders: ['anysearch', 'tavily', 'bocha'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['official', 'general'],
    recommendedDepth: 'deep',
  },
  stock: {
    topicType: 'stock',
    primaryProviders: ['anysearch', 'tavily', 'bocha'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['finance', 'news', 'official'],
    recommendedDepth: 'standard',
  },
  crypto: {
    topicType: 'crypto',
    primaryProviders: ['anysearch', 'tavily', 'bocha'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['news', 'forum', 'official'],
    recommendedDepth: 'standard',
  },
  business: {
    topicType: 'business',
    primaryProviders: ['bocha', 'anysearch', 'tavily'],
    secondaryProviders: ['brave'],
    defaultDimensions: ['official', 'news', 'general'],
    recommendedDepth: 'standard',
  },
  general: {
    topicType: 'general',
    primaryProviders: ['tavily', 'anysearch', 'brave', 'bocha'],
    secondaryProviders: ['duckduckgo'],
    defaultDimensions: ['general'],
    recommendedDepth: 'standard',
  },
};

/**
 * 从查询关键词推断主题类型
 */
export function inferTopicType(query: string): TopicType {
  const lowerQuery = query.toLowerCase();

  // 法律法条/案例
  if (lowerQuery.match(/\b(法律|法条|法规|条例|司法解释|裁判文书|案例|判例|起诉|合同违约|劳动法|民法典|刑法|行政法|legal|statute|case law|court ruling)\b/)) {
    return 'legal';
  }

  // 区块链/币圈
  if (lowerQuery.match(/\b(比特币|以太坊|区块链|币圈|加密货币|defi|nft|btc|eth|solana|token|web3|链上|tvl|meme币)\b/)) {
    return 'crypto';
  }

  // 商业/工商
  if (lowerQuery.match(/\b(工商|天眼查|企查查|注册资本|法人|股东|涉诉|行政处罚|统一社会信用代码|企业信息|company profile|incorporation)\b/)) {
    return 'business';
  }

  // 股市行情（优先于泛投资）
  if (lowerQuery.match(/\b(股价|行情|k线|涨停|跌停|a股|港股|美股|nasdaq|nyse|上证|深证|创业板|ticker|stock price|ohlc)\b/)) {
    return 'stock';
  }

  // 学术研究
  if (lowerQuery.match(/\b(paper|research|arxiv|study|学术|论文|研究|scientific|journal)\b/)) {
    return 'academic';
  }

  // 投资分析
  if (lowerQuery.match(/\b(投资|融资|估值|财报|revenue|investor|ipo|funding|stock)\b/)) {
    return 'investment';
  }

  // 市场调研
  if (lowerQuery.match(/\b(市场|规模|份额|增长率|market size|industry|调研)\b/)) {
    return 'market';
  }

  // 行业赛道
  if (lowerQuery.match(/\b(赛道|格局|竞品|competitor|对比|landscape)\b/)) {
    return 'industry';
  }

  // 产品评测
  if (lowerQuery.match(/\b(产品|评测|review|体验|功能|评测|比较)\b/)) {
    return 'product';
  }

  // 新闻事件
  if (lowerQuery.match(/\b(最新|今日|新闻|news|事件|breaking|update)\b/)) {
    return 'news';
  }

  // Prompt 工程（强信号）
  if (lowerQuery.match(/\b(prompt|提示词|咒语|指令|instruct|怎么写|如何用|教程|技巧|优化|best practice|example|示例)\b/)) {
    return 'prompt';
  }

  // 模型名 + 使用类关键词
  if (
    lowerQuery.match(/\b(nano|seedance|kling|runway|sora|gemini|claude|chatgpt|midjourney|stable diffusion|dalle|minimax)\b/) &&
    lowerQuery.match(/\b(怎么|如何|使用|教程|写|应用|技巧|优化|prompt|instruct|镜头|分镜|视频)\b/)
  ) {
    return 'prompt';
  }

  return 'general';
}
