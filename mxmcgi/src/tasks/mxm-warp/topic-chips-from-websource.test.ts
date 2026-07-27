import { describe, expect, it } from 'vitest';
import {
  extractTopicChipsFromWebsource,
  fieldsWantTopicChips,
  extractTopicChipsFromContractState,
} from './topic-chips-from-websource';

describe('topic-chips-from-websource', () => {
  it('prefers topicChips over items titles (avoid dumping search hits)', () => {
    const chips = extractTopicChipsFromWebsource({
      topicChips: ['提炼出的热点A', '提炼出的热点B'],
      items: [
        { title: '美联储暗示年内或再降息一次', url: 'https://a.example' },
        { title: '科技巨头财报季开局强劲', url: 'https://b.example' },
      ],
    });
    expect(chips).toEqual(['提炼出的热点A', '提炼出的热点B']);
  });

  it('empty topicChips does not fall back to items', () => {
    expect(
      extractTopicChipsFromWebsource({
        topicChips: [],
        items: [{ title: '美联储暗示年内或再降息一次' }],
      })
    ).toEqual([]);
  });

  it('prefers items[].title over text lines when topicChips absent', () => {
    const chips = extractTopicChipsFromWebsource({
      text: '查询: foo\n噪声行太短\n',
      items: [
        { title: '美联储暗示年内或再降息一次', url: 'https://a.example' },
        { title: '科技巨头财报季开局强劲', url: 'https://b.example' },
        { title: '短' },
      ],
    });
    expect(chips).toEqual(['美联储暗示年内或再降息一次', '科技巨头财报季开局强劲']);
  });

  it('falls back to parsing text when items missing', () => {
    const chips = extractTopicChipsFromWebsource({
      text: '[1] 欧洲央行维持利率不变并释放鸽派信号\n[2] 亚洲股市集体走高受科技股带动\n查询: 金融 热点\n',
    });
    expect(chips[0]).toContain('欧洲央行');
    expect(chips[1]).toContain('亚洲股市');
    expect(chips.every((c) => !c.startsWith('查询'))).toBe(true);
  });

  it('fieldsWantTopicChips detects x-ui and core_topic', () => {
    expect(fieldsWantTopicChips([{ name: 'date_mode' }])).toBe(false);
    expect(fieldsWantTopicChips([{ name: 'core_topic', 'x-ui': 'topic-chips' }])).toBe(true);
    expect(fieldsWantTopicChips([{ name: 'core_topic' }])).toBe(true);
  });

  it('reads from contract.sources.websource', () => {
    const chips = extractTopicChipsFromContractState({
      sources: {
        websource: {
          items: [{ title: '固态电池量产节奏再提前引发产业链躁动' }],
        },
      },
    });
    expect(chips).toEqual(['固态电池量产节奏再提前引发产业链躁动']);
  });
});
