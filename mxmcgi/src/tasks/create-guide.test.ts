import { describe, expect, it } from 'vitest';
import { extractCreateGuide, mergeCreateGuide } from './create-guide';

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

  it('extracts dual interactiveCard with nestedText preview between them', () => {
    const guide = extractCreateGuide({
      pre: [
        {
          step: 'interactiveCard',
          params: {
            label: '引入文稿',
            postPreHint: '正在分析…',
            fields: [{ name: 'source_material', required: true }],
          },
        },
        {
          step: 'nestedText',
          nestedTextTaskKey: 'text/expert/dialogue-content-scan',
          params: { outputTarget: 'business' },
        },
        {
          step: 'interactiveCard',
          params: {
            label: '确认形式与角色',
            postPreHint: '配置已确认',
            fields: [
              { name: 'dialogue_format', required: true },
              { name: 'cast', required: true },
            ],
          },
        },
      ],
    });
    expect(guide.interactiveCard?.fields.map((f) => f.name)).toEqual(['source_material']);
    expect(guide.nestedTextPreview?.nestedTextTaskKey).toBe('text/expert/dialogue-content-scan');
    expect(guide.nestedTextPreview?.loadingHint).toBe('正在分析…');
    expect(guide.followUpInteractiveCard?.label).toBe('确认形式与角色');
    expect(guide.followUpInteractiveCard?.fields.map((f) => f.name)).toEqual([
      'dialogue_format',
      'cast',
    ]);
  });
});

describe('mergeCreateGuide', () => {
  it('preserves midPreAfterField / topicField from template webSearch', () => {
    const merged = mergeCreateGuide(
      { interactiveCard: null, webSearch: null },
      {
        interactiveCard: {
          fields: [{ name: 'voice_id' }, { name: 'topic' }],
        },
        webSearch: {
          clientPreview: true,
          midPreAfterField: 'voice_id',
          topicField: 'topic',
          topicCount: 32,
          maxResults: 80,
          topicExtractTextKey: 'text/expert/industry-hot-topics',
        },
      }
    );
    expect(merged.webSearch?.midPreAfterField).toBe('voice_id');
    expect(merged.webSearch?.topicField).toBe('topic');
    expect(merged.webSearch?.topicCount).toBe(32);
    expect(merged.webSearch?.topicExtractTextKey).toBe('text/expert/industry-hot-topics');
  });

  it('preserves outlinePreview from template', () => {
    const merged = mergeCreateGuide(
      { interactiveCard: null, webSearch: null, outlinePreview: null },
      {
        outlinePreview: {
          clientPreview: true,
          midPreAfterField: 'structure_id',
          outlineField: 'outline',
          textKey: 'text/expert/topic-article-outline',
          loadingHint: '正在生成大纲…',
        },
      }
    );
    expect(merged.outlinePreview?.midPreAfterField).toBe('structure_id');
    expect(merged.outlinePreview?.textKey).toBe('text/expert/topic-article-outline');
  });

  it('merges topic-article mid-pre overlay with pipeline extractHotTopics', () => {
    const fromPipeline = extractCreateGuide({
      pre: [
        {
          step: 'interactiveCard',
          params: {
            label: '话题写作',
            fields: [
              { name: 'voice_category', title: '类别方向', required: true },
              { name: 'voice_id', title: '写作风格', required: true },
              { name: 'topic', title: '话题', required: true },
            ],
          },
        },
        {
          step: 'webSearch',
          params: {
            queryBuilder: 'voiceCategoryTrend',
            target: 'sources.websource',
            clientPreview: true,
            maxResults: 24,
            topicCount: 24,
          },
        },
        {
          step: 'extractHotTopics',
          params: { textKey: 'text/expert/writing-style-topics', maxTopics: 24 },
        },
      ],
    });
    const merged = mergeCreateGuide(fromPipeline, {
      webSearch: {
        clientPreview: true,
        midPreAfterField: 'voice_id',
        topicField: 'topic',
      },
      outlinePreview: {
        clientPreview: true,
        midPreAfterField: 'structure_id',
        textKey: 'text/expert/topic-article-outline',
      },
    });
    expect(merged.interactiveCard?.fields.map((f) => f.name)).toEqual([
      'voice_category',
      'voice_id',
      'topic',
    ]);
    expect(merged.webSearch?.topicExtractTextKey).toBe('text/expert/writing-style-topics');
    expect(merged.webSearch?.midPreAfterField).toBe('voice_id');
    expect(merged.webSearch?.clientPreview).toBe(true);
    expect(merged.outlinePreview?.midPreAfterField).toBe('structure_id');
  });
});
