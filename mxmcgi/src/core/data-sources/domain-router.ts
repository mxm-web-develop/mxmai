import type { DataDomain } from './types';

const DOMAIN_KEYWORDS: Record<DataDomain, RegExp> = {
  legal: /\b(法律|法条|法规|条例|司法解释|裁判文书|案例|判例|起诉|合同|劳动法|民法典|刑法|legal|statute|case law)\b/i,
  crypto: /\b(比特币|以太坊|区块链|币圈|加密货币|defi|nft|btc|eth|solana|token|web3|链上|tvl|meme)\b/i,
  business: /\b(工商|天眼查|企查查|注册资本|法人|股东|涉诉|行政处罚|统一社会信用代码|企业信息|company profile)\b/i,
  stock: /\b(股价|行情|k线|涨停|跌停|a股|港股|美股|nasdaq|nyse|上证|深证|创业板|ticker|stock price|ohlc|财报)\b/i,
  finance: /\b(金融|基金|债券|利率|央行|货币政策|forex|汇率|大宗商品|期货)\b/i,
};

/** 从查询推断专业数据领域 */
export function inferDataDomain(query: string): DataDomain | null {
  const q = query.trim();
  if (!q) return null;

  // 优先级：法律 > 商业 > 币圈 > 股市 > 金融
  const order: DataDomain[] = ['legal', 'business', 'crypto', 'stock', 'finance'];
  for (const domain of order) {
    if (DOMAIN_KEYWORDS[domain].test(q)) return domain;
  }
  return null;
}

/** TopicType → DataDomain 映射 */
export function topicTypeToDataDomain(
  topicType: import('../search/types').TopicType
): DataDomain | null {
  const map: Partial<Record<import('../search/types').TopicType, DataDomain>> = {
    legal: 'legal',
    stock: 'stock',
    crypto: 'crypto',
    business: 'business',
    investment: 'finance',
    market: 'finance',
  };
  return map[topicType] ?? null;
}
