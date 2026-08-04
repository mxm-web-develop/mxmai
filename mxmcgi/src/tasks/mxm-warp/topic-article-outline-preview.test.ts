import { describe, expect, it } from 'vitest';
import {
  fallbackOutlineFromStructure,
  parseTopicArticleOutline,
} from './topic-article-outline-parse';

describe('parseTopicArticleOutline', () => {
  it('parses nested outline object', () => {
    const raw = JSON.stringify({
      outline: {
        title: '假话与缺席的婚礼',
        sections: [
          { heading: '起', intent: '她说祝你幸福' },
          { heading: '承', intent: '他缺席整场婚礼', notes: '情绪刀' },
        ],
      },
    });
    const parsed = parseTopicArticleOutline(raw);
    expect(parsed?.title).toBe('假话与缺席的婚礼');
    expect(parsed?.sections).toHaveLength(2);
    expect(parsed?.sections[1]?.notes).toBe('情绪刀');
  });

  it('parses flat object and markdown fence', () => {
    const raw = '```json\n{"title":"A","sections":[{"heading":"一","intent":"开场"}]}\n```';
    const parsed = parseTopicArticleOutline(raw);
    expect(parsed?.title).toBe('A');
    expect(parsed?.sections[0]?.heading).toBe('一');
  });
});

describe('fallbackOutlineFromStructure', () => {
  it('builds sections from structure beats with short title (not raw topic)', () => {
    const fb = fallbackOutlineFromStructure({
      topic: '【为成全而说的假话】她说祝你幸福',
      purpose: 'publish_article',
      language: 'zh',
    });
    expect(fb.title).toBe('她说祝你幸福');
    expect(fb.title.length).toBeLessThanOrEqual(28);
    expect(fb.sections.length).toBeGreaterThanOrEqual(2);
    expect(fb.sections[0]?.intent).toContain('假话');
  });

  it('uses closed-story beats for fiction_short', () => {
    const fb = fallbackOutlineFromStructure({
      topic: '【录音曝光前夜】你想要什么',
      purpose: 'fiction_short',
      structureId: 'desire_conflict_turn',
      language: 'zh',
    });
    expect(fb.title).toBe('你想要什么');
    expect(fb.sections.length).toBe(4);
    expect(fb.sections.map((s) => s.heading).join('|')).toMatch(/欲望|冲突|反转|落点/);
    expect(fb.sections.map((s) => s.heading).join('|')).not.toMatch(/机制|未决/);
  });
});
