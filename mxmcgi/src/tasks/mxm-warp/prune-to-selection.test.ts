import { describe, expect, it } from 'vitest';
import {
  itemMatchesSelectedTopics,
  normalizeSelectedTopics,
  pruneWebsourceToSelection,
  resolveUrlsForTopic,
} from './prune-to-selection';

describe('prune-to-selection', () => {
  it('normalizes multi-source topic strings', () => {
    expect(normalizeSelectedTopics(['A；B', 'B', 'C'])).toEqual(['A', 'B', 'C']);
  });

  it('matches paraphrased topic via book-title / keywords', () => {
    expect(
      itemMatchesSelectedTopics(
        { title: '周星驰新片《功夫女足》杭州路演盛况', snippet: '迪丽热巴出席' },
        ['电影《功夫女足》票房破10亿周星驰杭州路演夸赞迪丽热巴']
      )
    ).toBe(true);
  });

  it('keeps only selected-related items and drops topicPool', () => {
    const { pruned, keptCount, droppedCount, selectedTopics } = pruneWebsourceToSelection(
      {
        query: '科技 热点',
        hitCount: 3,
        items: [
          { title: 'OpenAI 发布新模型', snippet: '…', url: 'https://a' },
          { title: '某球队夺冠', snippet: '…', url: 'https://b' },
          { title: '详解：OpenAI 发布新模型背后的算力', snippet: '相关', url: 'https://c' },
        ],
        topicChips: ['OpenAI 发布新模型', '某球队夺冠', '其它未选'],
        topicPool: ['OpenAI 发布新模型', '某球队夺冠', '其它未选', ...Array(30).fill('x')],
      },
      ['OpenAI 发布新模型']
    );
    expect(selectedTopics).toEqual(['OpenAI 发布新模型']);
    expect(keptCount).toBe(2);
    expect(droppedCount).toBe(1);
    expect(pruned.topicChips).toEqual(['OpenAI 发布新模型']);
    expect(pruned.topicPool).toBeUndefined();
    expect(pruned.prunedToSelection).toBe(true);
    expect((pruned.items ?? []).map((i) => i.title)).toEqual([
      'OpenAI 发布新模型',
      '详解：OpenAI 发布新模型背后的算力',
    ]);
  });

  it('clears items when nothing selected', () => {
    const { pruned, keptCount } = pruneWebsourceToSelection(
      {
        items: [{ title: 'A' }, { title: 'B' }],
        topicChips: ['A', 'B'],
      },
      []
    );
    expect(keptCount).toBe(0);
    expect(pruned.items).toEqual([]);
    expect(pruned.topicChips).toEqual([]);
  });

  it('keeps English-title items via topicSourceMap without CN↔EN aliases', () => {
    const selected = [
      'F1匈牙利大奖赛诺里斯夺冠麦凯伦积分领跑',
      '法拉利匈牙利站表现糟糕领队瓦塞尔承认执行不力',
    ];
    const topicSourceMap = {
      [selected[0]!]: ['https://example.com/norris-wins'],
      [selected[1]!]: ['https://example.com/ferrari-struggle'],
    };
    // 无 map 时：中文 chip 对不上英文标题
    expect(
      itemMatchesSelectedTopics(
        {
          title: 'Lando Norris wins Hungarian Grand Prix as McLaren extend lead',
          url: 'https://example.com/norris-wins',
        },
        selected
      )
    ).toBe(false);
    // 有 map：按 URL 回挂
    expect(
      itemMatchesSelectedTopics(
        {
          title: 'Lando Norris wins Hungarian Grand Prix as McLaren extend lead',
          url: 'https://example.com/norris-wins',
        },
        selected,
        topicSourceMap
      )
    ).toBe(true);

    const { keptCount } = pruneWebsourceToSelection(
      {
        items: [
          {
            title: 'Lando Norris wins Hungarian Grand Prix as McLaren extend lead',
            url: 'https://example.com/norris-wins',
          },
          {
            title: 'Ferrari struggle in Hungary as Vasseur admits poor execution',
            url: 'https://example.com/ferrari-struggle',
          },
          {
            title: 'Unrelated local weather report',
            url: 'https://example.com/weather',
          },
        ],
        topicSourceMap,
      },
      selected
    );
    expect(keptCount).toBe(2);
    expect(resolveUrlsForTopic(selected[0]!, topicSourceMap)).toEqual([
      'https://example.com/norris-wins',
    ]);
  });
});
