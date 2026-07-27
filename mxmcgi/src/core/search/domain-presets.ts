import type { TopicType } from './types';

/** 按主题类型推荐的 Tavily include_domains 白名单 */
export const DOMAIN_PRESETS: Record<string, string[]> = {
  legal: [
    'pkulaw.com',
    'court.gov.cn',
    'wenshu.court.gov.cn',
    'law.cn',
    'chinalaw.gov.cn',
  ],
  finance: [
    'eastmoney.com',
    'finance.sina.com.cn',
    'bloomberg.com',
    'reuters.com',
    'sec.gov',
    'finance.yahoo.com',
  ],
  stock: [
    'eastmoney.com',
    'finance.sina.com.cn',
    'xueqiu.com',
    'finance.yahoo.com',
    'bloomberg.com',
    'reuters.com',
  ],
  crypto: [
    'coingecko.com',
    'coinmarketcap.com',
    'defillama.com',
    'etherscan.io',
    'theblock.co',
    'decrypt.co',
  ],
  business: [
    'tianyancha.com',
    'qcc.com',
    'gsxt.gov.cn',
    'aiqicha.baidu.com',
    'crunchbase.com',
  ],
  investment: [
    'eastmoney.com',
    'finance.sina.com.cn',
    'bloomberg.com',
    'reuters.com',
    'sec.gov',
    'crunchbase.com',
  ],
  market: [
    'eastmoney.com',
    'finance.sina.com.cn',
    'bloomberg.com',
    'reuters.com',
    'statista.com',
  ],
  industry: [
    'eastmoney.com',
    'bloomberg.com',
    'reuters.com',
    '36kr.com',
    'huxiu.com',
  ],
  /** 科技赛道（行业日报 / warp industryTrend） */
  tech: [
    '36kr.com',
    'huxiu.com',
    'ithome.com',
    'cnbeta.com.tw',
    'techcrunch.com',
    'theverge.com',
    'wired.com',
    'stdaily.com',
    'jiqizhixin.com',
  ],
  /** 娱乐赛道 */
  entertainment: [
    'ent.sina.com.cn',
    'yule.sohu.com',
    'variety.com',
    'hollywood.com',
    'billboard.com',
  ],
  /** 体育赛道（含 F1 / 赛车媒体） */
  sports: [
    'espn.com',
    'sports.sina.com.cn',
    'sports.qq.com',
    'nba.com',
    'fifa.com',
    'formula1.com',
    'the-race.com',
    'autosport.com',
    'skysports.com',
    'motorsport.com',
    'racefans.net',
    'racingnews365.com',
  ],
};

/** 根据 topic 获取域名白名单 */
export function getDomainPresetsForTopic(topicType: TopicType): string[] | undefined {
  const presets = DOMAIN_PRESETS[topicType];
  return presets && presets.length > 0 ? [...presets] : undefined;
}
