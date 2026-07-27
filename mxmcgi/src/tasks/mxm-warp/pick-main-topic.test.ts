import { describe, expect, it } from 'vitest';
import {
  ensureMainTopicInBasic,
  pickMainTopicByHeat,
  splitCoreTopics,
} from './pick-main-topic';

describe('pickMainTopicByHeat', () => {
  it('returns the earliest chip among selected', () => {
    const picked = pickMainTopicByHeat({
      selectedTopics: ['B事件', 'A事件', 'C事件'],
      topicChips: ['A事件', 'B事件', 'C事件'],
    });
    expect(picked).toBe('A事件');
  });

  it('returns sole selected topic', () => {
    expect(
      pickMainTopicByHeat({ selectedTopics: ['唯一'], topicChips: ['A', '唯一'] })
    ).toBe('唯一');
  });

  it('falls back to first selected when no chip overlap', () => {
    expect(
      pickMainTopicByHeat({
        selectedTopics: ['手写一', '手写二'],
        topicChips: ['芯片新闻'],
      })
    ).toBe('手写一');
  });
});

describe('ensureMainTopicInBasic', () => {
  it('does not overwrite user main_topic', () => {
    const { basic, autoFilled } = ensureMainTopicInBasic(
      { core_topic: 'A；B', main_topic: 'B' },
      { topicChips: ['A', 'B'] }
    );
    expect(basic.main_topic).toBe('B');
    expect(autoFilled).toBe(false);
  });

  it('auto-fills from chips heat', () => {
    const { basic, autoFilled, picked } = ensureMainTopicInBasic(
      { core_topic: 'B；A' },
      { topicChips: ['A', 'B'] }
    );
    expect(picked).toBe('A');
    expect(basic.main_topic).toBe('A');
    expect(autoFilled).toBe(true);
  });
});

describe('splitCoreTopics', () => {
  it('splits Chinese and ASCII semicolons', () => {
    expect(splitCoreTopics('甲；乙;丙')).toEqual(['甲', '乙', '丙']);
  });
});
