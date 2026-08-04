import { describe, expect, it } from 'vitest';
import { groupBusinesses } from './bizListGroup';

describe('groupBusinesses', () => {
  it('merges same display category even when taskKey differs', () => {
    const groups = groupBusinesses(
      [
        {
          taskKey: 'generator',
          subtype: 'topic-article',
          taskLabel: '文稿',
          subtypeLabel: '话题写作',
          description: '话题写作说明',
        },
        {
          taskKey: 'group',
          subtype: 'deck',
          taskLabel: '方案',
          subtypeLabel: '演示文稿',
          description: '演示文稿说明',
        },
        {
          taskKey: 'generator',
          subtype: 'industry-daily',
          taskLabel: '文稿',
          subtypeLabel: '行业日报',
          description: '行业日报说明',
        },
      ],
      'zh'
    );

    expect(groups.map((g) => g.groupLabel)).toEqual(['文稿', '方案']);
    const manuscript = groups.find((g) => g.groupLabel === '文稿');
    expect(manuscript?.items.map((i) => i.title)).toEqual(['话题写作', '行业日报']);
  });

  it('keeps different categories separate', () => {
    const groups = groupBusinesses(
      [
        {
          taskKey: 'generator',
          subtype: 'a',
          taskLabel: '文稿',
          subtypeLabel: 'A',
        },
        {
          taskKey: 'generator',
          subtype: 'b',
          taskLabel: '方案',
          subtypeLabel: 'B',
        },
      ],
      'zh'
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].items).toHaveLength(1);
  });
});
