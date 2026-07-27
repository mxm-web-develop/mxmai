import { describe, expect, it } from 'vitest';
import { extractCreateGuide } from './create-guide';

describe('extractCreateGuide', () => {
  it('extracts interactiveCard fields and pre websource search', () => {
    const guide = extractCreateGuide({
      pre: [
        {
          step: 'interactiveCard',
          params: {
            label: '确认行业与日期',
            hint: '先确认行业',
            fields: [
              { name: 'industry', title: '行业', enum: ['金融', '科技'], required: true },
              { name: 'date_mode', title: '日期', enum: ['today', 'yesterday'] },
            ],
          },
        },
        {
          step: 'webSearch',
          params: {
            target: 'sources.websource',
            maxResults: 20,
            depth: 'quick',
            topicExtractTextKey: 'text/expert/conclusion',
          },
        },
      ],
      enrich: [
        {
          step: 'webSearch',
          params: { target: 'enrich_search.result', maxResults: 10 },
        },
      ],
    });

    expect(guide.interactiveCard?.label).toBe('确认行业与日期');
    expect(guide.interactiveCard?.fields.map((f) => f.name)).toEqual(['industry', 'date_mode']);
    expect(guide.webSearch?.maxResults).toBe(20);
    expect(guide.webSearch?.topicExtractTextKey).toBe('text/expert/conclusion');
  });

  it('prefers extractHotTopics textKey over webSearch.topicExtractTextKey', () => {
    const guide = extractCreateGuide({
      pre: [
        {
          step: 'webSearch',
          params: {
            target: 'sources.websource',
            maxResults: 200,
            topicExtractTextKey: 'text/expert/conclusion',
          },
        },
        {
          step: 'extractHotTopics',
          params: { textKey: 'text/expert/industry-hot-topics', maxTopics: 8 },
        },
      ],
      enrich: [],
      post: [],
    });
    expect(guide.webSearch?.maxResults).toBe(200);
    expect(guide.webSearch?.topicExtractTextKey).toBe('text/expert/industry-hot-topics');
  });
});
