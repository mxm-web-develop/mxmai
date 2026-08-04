import { describe, expect, it } from 'vitest';
import {
  buildVoiceCategoryTrendQueries,
  buildVoiceStyleTopicQueries,
  timeRangeForVoiceCategory,
  VOICE_STYLE_QUERY_MAX,
} from './voice-style-topics';

describe('timeRangeForVoiceCategory', () => {
  it('uses week window for topic writing (near-hot, not month-old evergreen)', () => {
    expect(timeRangeForVoiceCategory('self_media')).toBe('week');
    expect(timeRangeForVoiceCategory('fanqie_web')).toBe('week');
    expect(timeRangeForVoiceCategory('hongguo_drama')).toBe('week');
  });
});

describe('buildVoiceStyleTopicQueries', () => {
  it('builds short-drama queries by category trend (style name not in search)', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'hongguo_drama',
      voiceId: 'hg_conflict_hook',
      language: 'zh',
    });
    expect(q.catId).toBe('hongguo_drama');
    expect(q.queries.length).toBeGreaterThanOrEqual(2);
    expect(q.queries.length).toBeLessThanOrEqual(VOICE_STYLE_QUERY_MAX);
    expect(q.queries[0]).toMatch(/热门|爆款|热播/);
    expect(q.queries.join('|')).toMatch(/短剧|剧名|剧情/);
    expect(q.queries.every((x) => !/冲突钩|hg_conflict/.test(x))).toBe(true);
    // 不要求写死婚礼/彩礼等具体梗主导检索
    expect(q.queries.every((x) => !/微博热搜|今日热点新闻/.test(x))).toBe(true);
  });

  it('builds talk category as public-issue search, not show-name archaeology', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'talk_brief',
      voiceId: 'talk_yuanzhuo',
      language: 'zh',
    });
    expect(q.intentLabel).toMatch(/谈话|圆桌|议题/);
    expect(q.voiceLabel).toMatch(/圆桌派|议题深挖/);
    expect(q.queries[0]).toMatch(/热议|热门|新闻|社会|经济|公共|议题/);
    // 风格题材角进 Q2+，不进工艺口号/节目名
    expect(q.searchAngles.some((a) => /多切面|代际|机制/.test(a))).toBe(true);
    expect(q.queries.join('|')).toMatch(/多切面|代际|机制/);
    expect(q.queries.every((x) => !/锵锵|三人行|窦文涛|圆桌派|圆桌辩论|圆桌资料|鲁豫/.test(x))).toBe(
      true
    );
    expect(q.queries.every((x) => !/微博热搜/.test(x))).toBe(true);
    expect(q.queries.join('|')).toMatch(/社会|新闻|经济|民生|公共|争议|议题|辩论|多切面/);
    expect(q.queries.every((x) => !x.includes(q.voiceLabel))).toBe(true);
  });

  it('same talk category different voices share category primary but differ by search_angles', () => {
    const yuanzhuo = buildVoiceStyleTopicQueries({
      voiceCategory: 'talk_brief',
      voiceId: 'talk_yuanzhuo',
      language: 'zh',
    });
    const luyu = buildVoiceStyleTopicQueries({
      voiceCategory: 'talk_brief',
      voiceId: 'talk_luyu',
      language: 'zh',
    });
    expect(yuanzhuo.queries[0]).toBe(luyu.queries[0]);
    expect(yuanzhuo.searchAngles.join('|')).not.toBe(luyu.searchAngles.join('|'));
    expect(yuanzhuo.queries.join('|')).not.toBe(luyu.queries.join('|'));
    expect(luyu.queries.join('|')).toMatch(/人物|命运|人生|生命叙事/);
    expect(yuanzhuo.queries.every((x) => !/圆桌派|鲁豫/.test(x))).toBe(true);
    expect(luyu.queries.every((x) => !/圆桌派|鲁豫/.test(x))).toBe(true);
  });

  it('builds en web-serial queries as popular premises (category, not style name)', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'fanqie_web',
      voiceId: 'fq_en_litrpg',
      language: 'en',
    });
    expect(q.language).toBe('en');
    expect(q.queries.length).toBeGreaterThanOrEqual(2);
    expect(q.voiceLabel.length).toBeGreaterThan(2);
    expect(q.queries.some((x) => /popular|trending|hit/i.test(x))).toBe(true);
    expect(q.queries.every((x) => !/今日热点|微博热搜/.test(x))).toBe(true);
  });

  it('builds course_tutorial as popular-course search, not hard-coded subjects', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'course_tutorial',
      voiceId: 'course_bilibili',
      language: 'zh',
    });
    expect(q.catId).toBe('course_tutorial');
    expect(q.queries[0]).toMatch(/热门|爆款/);
    expect(q.queries.join('|')).toMatch(/网课|跟练|课程|课题/);
    expect(q.queries.every((x) => !/Python|静物照|透视表|小红书图文|职场沟通 理财/.test(x))).toBe(
      true
    );
    expect(q.topicHints.every((h) => !/可运行|报错红字|静物照|透视表/.test(h))).toBe(true);
  });

  it('builds finance as trending column search, not hard-coded deal plots', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'finance_narrative',
      voiceId: 'fin_bu_mian_night',
      language: 'zh',
    });
    expect(q.catId).toBe('finance_narrative');
    expect(q.queries[0]).toMatch(/热门|爆款|热议/);
    expect(q.queries.join('|')).toMatch(/财经|资本|专栏/);
    expect(q.queries.every((x) => !/短剧|剧名|剧情简介|婚礼/.test(x))).toBe(true);
    // hints 是工艺向，不再写死对赌董事会具体梗
    expect(q.topicHints.every((h) => !/一轮融资里消失的对赌|创始人友情破裂的董事会/.test(h))).toBe(
      true
    );
  });

  it('same category different voices share category primary; search_angles differ', () => {
    const night = buildVoiceStyleTopicQueries({
      voiceCategory: 'finance_narrative',
      voiceId: 'fin_bu_mian_night',
      language: 'zh',
    });
    const deal = buildVoiceStyleTopicQueries({
      voiceCategory: 'finance_narrative',
      voiceId: 'fin_deal_anatomy',
      language: 'zh',
    });
    expect(night.queries[0]).toBe(deal.queries[0]);
    expect(night.topicHints.some((h) => /交易夜|激励|博弈/.test(h))).toBe(true);
    expect(deal.topicHints.some((h) => /条款|机制|受益|风险/.test(h))).toBe(true);
    expect(night.searchAngles.join('|')).not.toBe(deal.searchAngles.join('|'));
    expect(night.queries.join('|')).not.toBe(deal.queries.join('|'));
    expect(deal.queries.join('|')).toMatch(/条款|机制|并购|受益/);
    expect(night.queries.join('|')).toMatch(/交易夜|激励|资本博弈/);
  });

  it('self_media queries bias this week / past 7 days', () => {
    const q = buildVoiceStyleTopicQueries({
      voiceCategory: 'self_media',
      voiceId: 'sm_opin_sharp',
      language: 'zh',
    });
    expect(q.queries.join('|')).toMatch(/本周|近7天|今日/);
  });

  it('all major categories lead with trending/popular query, not hard-coded plots', () => {
    const cases = [
      ['hongguo_drama', 'hg_conflict_hook'],
      ['fanqie_web', 'fq_zs_huigui'],
      ['talk_brief', 'talk_qq_three'],
      ['finance_narrative', 'fin_deal_anatomy'],
      ['political_report', 'pol_wire_restraint'],
      ['self_media', 'sm_opin_sharp'],
      ['voiceover_brief', 'vo_news_host'],
      ['course_tutorial', 'course_dedao'],
    ] as const;
    for (const [cat, vid] of cases) {
      const q = buildVoiceStyleTopicQueries({
        voiceCategory: cat,
        voiceId: vid,
        language: 'zh',
      });
      expect(q.queries[0], cat).toMatch(/热门|爆款|热议|热播|近期|本周|近7天|今日|热搜/);
      // 文风专名不得进检索（只定笔法）
      expect(q.queries.every((x) => !/锵锵|窦文涛|鲁豫|正午|不面/.test(x)), cat).toBe(true);
    }
  });
});

describe('buildVoiceCategoryTrendQueries', () => {
  it('builds category-only queries without needing voiceId', () => {
    const q = buildVoiceCategoryTrendQueries({
      voiceCategory: 'talk_brief',
      language: 'zh',
    });
    expect(q.catId).toBe('talk_brief');
    expect(q.primary).toMatch(/热议|新闻|社会/);
    expect(q.queries.every((x) => !/锵锵|三人行|窦文涛/.test(x))).toBe(true);
  });

  it('aligns primary with buildVoiceStyleTopicQueries for same category', () => {
    const catOnly = buildVoiceCategoryTrendQueries({
      voiceCategory: 'hongguo_drama',
      language: 'zh',
    });
    const withVoice = buildVoiceStyleTopicQueries({
      voiceCategory: 'hongguo_drama',
      voiceId: 'hg_conflict_hook',
      language: 'zh',
    });
    expect(catOnly.primary).toBe(withVoice.queries[0]);
  });
});
