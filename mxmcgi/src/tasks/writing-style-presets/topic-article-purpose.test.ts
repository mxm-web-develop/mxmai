import { describe, expect, it } from 'vitest';
import {
  articleLengthGuide,
  purposeForVoiceCategory,
  structuresForPurpose,
  topicFormatForVoiceCategory,
} from './topic-article-purpose';

describe('purposeForVoiceCategory', () => {
  it('maps talk / voiceover / course / report categories', () => {
    expect(purposeForVoiceCategory('talk_brief')).toBe('talk_show_brief');
    expect(purposeForVoiceCategory('voiceover_brief')).toBe('voiceover_brief');
    expect(purposeForVoiceCategory('course_tutorial')).toBe('course_tutorial');
    expect(purposeForVoiceCategory('finance_narrative')).toBe('investigative');
    expect(purposeForVoiceCategory('political_report')).toBe('investigative');
  });

  it('maps short fiction / short drama to closed-story purposes', () => {
    expect(purposeForVoiceCategory('fanqie_web')).toBe('fiction_short');
    expect(purposeForVoiceCategory('hongguo_drama')).toBe('drama_beat');
  });

  it('maps column / self-media to publish_article', () => {
    expect(purposeForVoiceCategory('literary_column')).toBe('publish_article');
    expect(purposeForVoiceCategory('self_media')).toBe('publish_article');
  });
});

describe('fiction / drama structures', () => {
  it('offers closed-story beats without open-ended endings', () => {
    for (const purpose of ['fiction_short', 'drama_beat'] as const) {
      const structs = structuresForPurpose(purpose, 'zh');
      expect(structs.length).toBeGreaterThanOrEqual(2);
      const blob = structs
        .flatMap((s) => [s.title, ...s.beats])
        .join('|');
      expect(blob).not.toMatch(/未决|未完|待续|下章|开放式|连载/);
      expect(blob).toMatch(/收束|落点|打完|兑现/);
    }
  });
});

describe('articleLengthGuide', () => {
  it('injects medium floor for fiction_short standard', () => {
    const g = articleLengthGuide('fiction_short', 'standard', 'zh');
    expect(g).toMatch(/中篇/);
    expect(g).toMatch(/3500/);
    expect(g).toMatch(/不得明显短于/);
  });
});

describe('topicFormatForVoiceCategory', () => {
  it('keeps short-drama format only for hongguo_drama', () => {
    const drama = topicFormatForVoiceCategory('hongguo_drama');
    expect(drama.fieldHint).toMatch(/剧名/);
    expect(drama.exampleGood).toMatch(/【/);
  });

  it('finance format forbids short-drama titles and prefers column angles', () => {
    const fin = topicFormatForVoiceCategory('finance_narrative');
    expect(fin.format).toMatch(/专栏|自媒体|对赌|董事会/);
    expect(fin.format).toMatch(/禁止短剧/);
    expect(fin.exampleGood).not.toMatch(/【/);
    expect(fin.exampleBad).toMatch(/【|短剧|病房/);
  });

  it('talk_brief treats show name as craft only and forbids show meta-topics', () => {
    const talk = topicFormatForVoiceCategory('talk_brief');
    expect(talk.format).toMatch(/社会|新闻|经济|民生/);
    expect(talk.format).toMatch(/禁止.*节目|笔法/);
    expect(talk.exampleBad).toMatch(/锵锵|窦文涛|停播|元话题/);
  });
});
