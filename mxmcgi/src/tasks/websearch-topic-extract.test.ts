import { describe, expect, it } from 'vitest';
import {
  buildTopicExtractFieldSpecs,
  buildTopicSourceMap,
  clampSearchMaxResults,
  clampTopicMaxResults,
  fallbackTopicsFromSearchItems,
  parseTopicLinksFromTextBusinessOutput,
  parseTopicsFromTextBusinessOutput,
  prepareItemsForTopicExtract,
  sanitizeWebsourceForLlm,
} from './websearch-topic-extract';

describe('clampTopicMaxResults / buildTopicExtractFieldSpecs', () => {
  it('clamps topic output to 1..30; search hits separately to 200', () => {
    expect(clampTopicMaxResults(20)).toBe(20);
    expect(clampTopicMaxResults(99)).toBe(48);
    expect(clampTopicMaxResults(0)).toBe(1);
    expect(clampTopicMaxResults(undefined, 8)).toBe(8);
    expect(clampSearchMaxResults(200)).toBe(200);
    expect(clampSearchMaxResults(999)).toBe(200);
  });

  it('field_specs mention configured count instead of hardcoded 6～12', () => {
    const specs = buildTopicExtractFieldSpecs(20);
    expect(specs[0]?.description).toMatch(/最多 20 条/);
    expect(specs[0]?.description).toMatch(/禁止返回空数组|禁止为凑数/);
    expect(specs[0]?.description).toMatch(/sources/);
    expect(specs[0]?.description).not.toMatch(/6～12/);
  });
});

describe('fallbackTopicsFromSearchItems', () => {
  it('builds chips from titles when LLM returns empty', () => {
    const topics = fallbackTopicsFromSearchItems(
      [
        { title: '某科技公司发布新一代AI芯片量产计划' },
        { title: '监管机构就数据跨境流动征求意见' },
        { title: '短' },
      ],
      8
    );
    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(topics[0]).toContain('AI芯片');
  });

  it('accepts long English headlines as fallback', () => {
    const topics = fallbackTopicsFromSearchItems(
      [{ title: 'Premier League clubs launch Coast to Coast US fan activation tour' }],
      5
    );
    expect(topics.length).toBe(1);
    expect(topics[0]).toMatch(/Premier League/i);
  });
});

describe('prepareItemsForTopicExtract', () => {
  it('keeps up to maxItems from search node', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      title: `具体事件标题足够长${i}公司发布重大产品更新`,
      snippet: `详情摘要${i}关于市场与监管进展的报道内容`,
    }));
    const { items: kept } = prepareItemsForTopicExtract(items, '金融', 20);
    expect(kept.length).toBe(20);
  });

  it('drops hard-sensitive sidebar noise and truncates long snippets', () => {
    const longNav = `${'具身智能产业进展。'.repeat(20)} 相关阅读：习近平出席上合组织会议 反腐专题`;
    const { items: kept, filteredOut } = prepareItemsForTopicExtract(
      [
        {
          title: '具身机器人发布会回顾',
          snippet: longNav,
          domain: 'example.com',
        },
        {
          title: '正常科技要闻足够长标题内容',
          snippet: '某公司发布人形机器人量产计划，预计明年交付。',
          domain: 'techcrunch.com',
        },
      ],
      'ai具身机器人',
      8
    );
    expect(filteredOut).toBeGreaterThanOrEqual(1);
    expect(kept.every((it) => !/习近平|反腐/.test(`${it.title}${it.snippet}`))).toBe(true);
    expect(kept.every((it) => String(it.snippet ?? '').length <= 180)).toBe(true);
  });

  it('drops reddit/x and strips Plus Icon boilerplate by default', () => {
    const { items: kept } = prepareItemsForTopicExtract(
      [
        {
          title: 'Variety exclusive enough long title here',
          snippet: '* Plus Icon What To Watch. Studio announces fall premiere window for the series.',
          url: 'https://variety.com/a',
          domain: 'variety.com',
        },
        {
          title: 'reddit thread long enough title text',
          snippet: 'Where do you get movie news without social media these days online?',
          url: 'https://reddit.com/r/x',
          domain: 'reddit.com',
        },
      ],
      '影视综',
      8
    );
    expect(kept.every((it) => !/reddit/i.test(String(it.domain ?? '') + String(it.url ?? '')))).toBe(
      true
    );
    expect(kept.some((it) => /Plus Icon/i.test(String(it.snippet ?? '')))).toBe(false);
  });
});

describe('sanitizeWebsourceForLlm', () => {
  it('rebuilds short text from cleaned items', () => {
    const out = sanitizeWebsourceForLlm(
      {
        query: 'embodied AI robot news',
        depth: 'quick',
        items: [
          {
            title: 'ok',
            snippet: 'safe body '.repeat(50),
            url: 'https://example.com/a',
            domain: 'example.com',
          },
        ],
      },
      '科技',
      8
    );
    expect(String(out.items?.[0]?.snippet ?? '').length).toBeLessThanOrEqual(180);
    expect(String(out.text)).toContain('embodied AI robot');
  });
});

describe('parseTopicsFromTextBusinessOutput', () => {
  it('parses strict JSON object', () => {
    const raw = JSON.stringify({
      topics: ['某某公司发布季度财报营收超预期', '某国央行宣布维持基准利率不变'],
    });
    expect(parseTopicsFromTextBusinessOutput(raw)).toEqual([
      '某某公司发布季度财报营收超预期',
      '某国央行宣布维持基准利率不变',
    ]);
  });

  it('respects maxTopics when parsing long JSON arrays', () => {
    const topics = Array.from({ length: 25 }, (_, i) => `某公司${i}发布季度财报营收超预期`);
    const raw = JSON.stringify({ topics });
    expect(parseTopicsFromTextBusinessOutput(raw, 20)).toHaveLength(20);
    expect(parseTopicsFromTextBusinessOutput(raw, 8)).toHaveLength(8);
  });

  it('salvages numbered list with (N chars) self-check (HK failure sample)', () => {
    const raw =
      '痛失积分榜次席，坦言正经历心理苦战" (31 chars) 6. "拉塞尔在斯帕赛道退赛后，公开表示想要一辆与安东内利相同的赛车" (30 chars) 7. "诺里斯因超额更换动力单元部件，在比利时大奖赛遭遇罚退起跑" (28 chars) 8. "托托·沃尔夫针对梅赛德斯近期失误失分，为匈牙利大奖赛设定新目标"';
    const topics = parseTopicsFromTextBusinessOutput(raw);
    expect(topics.length).toBeGreaterThanOrEqual(3);
    expect(topics.some((t) => t.includes('拉塞尔'))).toBe(true);
    expect(topics.some((t) => t.includes('诺里斯'))).toBe(true);
    expect(topics.every((t) => !/\(\d+\s*chars?\)/i.test(t))).toBe(true);
  });

  it('salvages Chinese quotes from English CoT prose (HK failure sample)', () => {
    const raw =
      '梅赛德斯-奔驰计划于2027年任命拉格鲁为青年车手项目主管" is correct. - "斯帕赛道退赛后，拉塞尔想要一辆和安东内利“一样的车”" -> This can be another topic if needed, but we already have 9. Let\'s keep it to 9 soli';
    const topics = parseTopicsFromTextBusinessOutput(raw);
    expect(topics.length).toBeGreaterThanOrEqual(1);
    expect(topics.some((t) => t.includes('梅赛德斯') || t.includes('拉格鲁'))).toBe(true);
    expect(topics.every((t) => !/is correct|another topic|Let\'s keep/i.test(t))).toBe(true);
  });

  it('filters low-confidence topic objects', () => {
    const raw = JSON.stringify({
      topics: [
        { topic: '某某公司发布季度财报营收超预期', confidence: 0.9 },
        { topic: '碎片传闻不足以成章的短事件', confidence: 0.2 },
      ],
    });
    expect(parseTopicsFromTextBusinessOutput(raw)).toEqual(['某某公司发布季度财报营收超预期']);
  });

  it('parses sources indices into topicSourceMap urls', () => {
    const items = [
      { title: 'Norris wins Hungary', url: 'https://ex.com/1' },
      { title: 'Ferrari struggle', url: 'https://ex.com/2' },
      { title: 'Other', url: 'https://ex.com/3' },
    ];
    const raw = JSON.stringify({
      topics: [
        { topic: '诺里斯匈牙利大奖赛夺冠麦凯伦积分领跑赛事', sources: [1] },
        { topic: '法拉利匈牙利站表现不佳领队承认执行不力', sources: [2, 3] },
      ],
    });
    const links = parseTopicLinksFromTextBusinessOutput(raw, 8, items);
    expect(links).toHaveLength(2);
    expect(links[0]?.urls).toEqual(['https://ex.com/1']);
    expect(links[1]?.urls).toEqual(['https://ex.com/2', 'https://ex.com/3']);
    expect(buildTopicSourceMap(links)['诺里斯匈牙利大奖赛夺冠麦凯伦积分领跑赛事']).toEqual([
      'https://ex.com/1',
    ]);
  });

  it('keeps long fiction hooks with dialogue as one chip (not quote fragments)', () => {
    const topics = [
      '【二十二点的外卖】同一栋写字楼里，每晚二十二点零三分准时有人往七楼前台放一杯美式，杯壁手写备注「第二杯半价已用」。电梯门开，穿物业背心的男人把杯子塞到你手里：「哥，你订的啊，你不记得了？」你说没订。他打量你：「你不是上个月来装宽带的吗？」',
      '【单元门口的快递柜】从没人通知过我这栋楼装了快递柜，可我下楼扔垃圾时它就蹲在一楼大厅里，屏幕亮着，上面显示「您的件已到」，语音又响：「您的件已超时，请尽快领取」',
      '【小区群里那个从不说话的人】业主群四百多号人，从没人@过备注名是「7-2-1302」的账号，今晚他私聊我：「睡得不好？时间点到了，你该醒了。」「如果你读到这一行，时间点到了，去翻你大学时那本红色笔记本第四十七页。」',
      '【楼下烧烤摊的常客】我从没在楼下吃过烧烤，可烧烤摊老板每次远远看见我都会喊：「老位子？」我坐下后他忽然变脸：「你到底是谁？这座位，从来没人坐过。」我说：「那你又是谁？」',
    ];
    const out = parseTopicsFromTextBusinessOutput(JSON.stringify({ topics }), 24);
    expect(out).toHaveLength(4);
    expect(out.every((t) => t.startsWith('【'))).toBe(true);
    expect(out.some((t) => t === '哥，你订的啊，你不记得了？')).toBe(false);
    expect(out.some((t) => t === '您的件已超时，请尽快领取')).toBe(false);
    expect(out[0]).toContain('「第二杯半价已用」');
  });

  it('salvages numbered fiction list without splitting dialogue into chips', () => {
    const prose = `1. 【二十二点的外卖】同一栋写字楼里，每晚二十二点零三分准时有人往七楼前台放一杯美式，杯壁手写备注「第二杯半价已用」
「哥，你订的啊，你不记得了？」
「你不是上个月来装宽带的吗？」
2. 【单元门口的快递柜】从没人通知过我这栋楼装了快递柜，可我下楼扔垃圾时它就蹲在一楼大厅里，屏幕亮着，上面显示「您的件已到」
「您的件已超时，请尽快领取」
3. 【楼下烧烤摊的常客】我从没在楼下吃过烧烤，可烧烤摊老板每次远远看见我都会喊：「老位子？」
「你到底是谁？这座位，从来没人坐过。」`;
    const out = parseTopicsFromTextBusinessOutput(prose, 24);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.filter((t) => t.startsWith('【')).length).toBeGreaterThanOrEqual(3);
    expect(out.some((t) => t === '哥，你订的啊，你不记得了？')).toBe(false);
    expect(out.some((t) => /^你到底是谁/.test(t))).toBe(false);
  });

  it('drops orphan dialogue fragments when model already split JSON topics', () => {
    const raw = JSON.stringify({
      topics: [
        '【二十二点的外卖】同一栋写字楼里，每晚二十二点零三分准时有人往七楼前台放一杯美式，杯壁手写备注「第二杯半价已用」',
        '哥，你订的啊，你不记得了？',
        '你不是上个月来装宽带的吗？',
        '【楼下烧烤摊的常客】我从没在楼下吃过烧烤，可烧烤摊老板每次远远看见我都会喊：「老位子？」',
        '那你又是谁？',
      ],
    });
    const out = parseTopicsFromTextBusinessOutput(raw, 24);
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.startsWith('【'))).toBe(true);
  });
});
