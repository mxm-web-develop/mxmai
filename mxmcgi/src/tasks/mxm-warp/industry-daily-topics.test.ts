import { describe, expect, it } from 'vitest';

import {
  cleanNewsHeadline,
  extractHotTopicFromSearchItem,
  extractIndustryDailyTopicChips,
  isLikelyEventHeadline,
  buildIndustryDailyTopicQueries,
} from './industry-daily-topics';

describe('industry-daily-topics extract', () => {
  it('rejects source/outlet titles', () => {
    expect(isLikelyEventHeadline('国际金融报社')).toBe(false);
    expect(isLikelyEventHeadline('金融话题 - 金融 - 工商时报')).toBe(false);
    expect(isLikelyEventHeadline('金融市场 | 彭博Bloomberg | 中国')).toBe(false);
    expect(isLikelyEventHeadline('香港經濟日報HKET | 即時新聞, 頭條新聞, 財經, 地產, 科技')).toBe(false);
  });

  it('accepts event-like headlines', () => {
    expect(
      isLikelyEventHeadline('证券公会吁速修法延长债券ETF证交税停征')
    ).toBe(true);
    expect(isLikelyEventHeadline('央行宣布下调存款准备金率0.5个百分点')).toBe(true);
  });

  it('prefers snippet event when title is outlet', () => {
    const topic = extractHotTopicFromSearchItem({
      title: '国际金融报社',
      snippet: '央行宣布下调存款准备金率0.5个百分点，释放长期流动性。市场解读积极。',
      domain: 'example.com',
    });
    expect(topic).toContain('央行');
  });

  it('filters chip list', () => {
    const chips = extractIndustryDailyTopicChips(
      [
        { title: '金融话题 - 金融 - 工商时报', snippet: '' },
        { title: '国际金融报社', snippet: '' },
        {
          title: '央行宣布下调存款准备金率0.5个百分点',
          snippet: '释放流动性',
        },
        {
          title: '# 乱码',
          snippet: '《金融》证券公会吁速修法延长债券ETF证交税停征已获通过',
        },
      ],
      5
    );
    expect(chips.some((c) => c.includes('央行'))).toBe(true);
    expect(chips.every((c) => !c.includes('工商时报'))).toBe(true);
  });

  it('cleans site suffix', () => {
    expect(cleanNewsHeadline('某公司财报超预期 - 新浪财经')).toContain('财报');
  });

  it('extractTopics 产出模型话题；空结果抛错（无规则回退）', async () => {
    const { previewIndustryDailyTopics } = await import('./industry-daily-topics');
    const noisy = [
      {
        title: '新浪娱乐首页_娱乐新闻_新浪网',
        snippet: '',
        url: 'https://ent.sina.com.cn',
        domain: 'ent.sina.com.cn',
      },
      {
        title: '7/22/26: Premier Plays - MLB.com',
        snippet: 'Baseball highlights',
        url: 'https://www.mlb.com/x',
        domain: 'www.mlb.com',
      },
      {
        title: '密逃8首播热度破9900，新阵容搞笑反差引热议',
        snippet: '《密室大逃脱》第八季首播全网热度破9900，新嘉宾反差萌引发讨论。',
        url: 'https://ent.sina.cn/a',
        domain: 'ent.sina.cn',
      },
      {
        title: '新浪娱乐热点小时报丨2026年07月22日17时',
        snippet: '盘点当日娱乐热点榜单。',
        url: 'https://ent.sina.cn/b',
        domain: 'ent.sina.cn',
      },
    ];
    const out = await previewIndustryDailyTopics(
      { industry: '娱乐', dateMode: 'yesterday', maxResults: 6 },
      async () => ({ aggregated: noisy, providers: ['tavily'], depth: 'quick' }),
      {
        extractTopics: async () => [
          '密室大逃脱8首播热度破9900引发讨论',
          '综艺新阵容反差萌成娱乐焦点',
        ],
      }
    );
    expect(out.topicChips.some((c) => c.includes('密室') || c.includes('9900'))).toBe(true);
    expect(out.topicChips.every((c) => !/MLB|Premier Plays/i.test(c))).toBe(true);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.search_track).toBe('entertainment');

    await expect(
      previewIndustryDailyTopics(
        { industry: '娱乐', dateMode: 'yesterday', maxResults: 6 },
        async () => ({ aggregated: noisy, providers: ['tavily'], depth: 'quick' }),
        { extractTopics: async () => [] }
      )
    ).rejects.toThrow(/话题提炼结果为空/);
  });
});

describe('buildIndustryDailyTopicQueries strategy', () => {
  it('科技不带财经要闻，带 tech 域名', () => {
    const built = buildIndustryDailyTopicQueries({
      industry: '科技',
      date_mode: 'yesterday',
      search_region: 'cn',
    });
    expect(built.track).toBe('tech');
    expect(built.queries.join(' ')).not.toMatch(/财经要闻/);
    expect(built.queries.some((q) => /科技新闻|产业动态|AI/.test(q))).toBe(true);
    expect(built.includeDomains?.some((d) => d.includes('36kr'))).toBe(true);
  });

  it('default global has no includeDomains and en+ja queries (no zh flood)', () => {
    const built = buildIndustryDailyTopicQueries({ industry: '科技', date_mode: 'yesterday' });
    expect(built.searchRegion).toBe('global');
    expect(built.includeDomains).toBeUndefined();
    expect(built.searchLanguage).toBe('all');
    expect(built.queries.some((q) => /technology|tech news/i.test(q))).toBe(true);
    expect(built.queries.some((q) => /テクノロジー|テック/.test(q))).toBe(true);
    expect(built.queries.every((q) => !/科技新闻/.test(q))).toBe(true);
  });
  it('金融用 finance 维度与域名', () => {
    const built = buildIndustryDailyTopicQueries({
      industry: '金融',
      date_mode: 'today',
      search_region: 'cn',
    });
    expect(built.track).toBe('finance');
    expect(built.dimensions).toContain('finance');
    expect(built.includeDomains?.some((d) => d.includes('eastmoney'))).toBe(true);
  });

  it('细拆行业足球映射 sports，本周检索窗为 week', () => {
    const built = buildIndustryDailyTopicQueries({
      industry: '足球',
      date_mode: 'this_week',
      search_region: 'global',
    });
    expect(built.track).toBe('sports');
    expect(built.mode).toBe('this_week');
    expect(built.timeRange).toBe('week');
    expect(built.dateLabel).toBe('本周');
    expect(built.queries.some((q) => /this week|本周|今週/.test(q))).toBe(true);
    expect(built.queries.some((q) => /football|soccer|足球|サッカー/i.test(q))).toBe(true);
  });

  it('本月检索窗为 month', () => {
    const built = buildIndustryDailyTopicQueries({
      industry: '股票',
      date_mode: '本月',
    });
    expect(built.track).toBe('finance');
    expect(built.mode).toBe('this_month');
    expect(built.timeRange).toBe('month');
    expect(built.queries.some((q) => /this month|本月|今月/.test(q))).toBe(true);
  });

  it('自定义 F1 + search_track=sports 使用赛事后缀与域名', () => {
    const built = buildIndustryDailyTopicQueries({
      industry: '其他',
      industry_custom: 'F1赛事',
      search_track: 'sports',
      search_region: 'cn',
      date_mode: 'yesterday',
    });
    expect(built.track).toBe('sports');
    expect(built.queries.join(' ')).toMatch(/体育新闻|赛况|赛事热点/);
    expect(built.queries.join(' ')).not.toMatch(/行业新闻/);
    expect(built.includeDomains?.some((d) => d.includes('formula1') || d.includes('the-race'))).toBe(
      true
    );
  });
});
