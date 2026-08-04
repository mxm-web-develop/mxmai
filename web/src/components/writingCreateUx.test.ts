import { describe, expect, it } from 'vitest';
import {
  filterBasicFieldsByCreateGuide,
  getCreateGuideMidPreOutline,
  getCreateGuideMidPreTopicRecommend,
  indicatesWarpGatesCreate,
  needsCreateGuideClientWebSearchPreview,
  needsCreateGuideNestedTextPreview,
  resolvePostPreAssistantHint,
  shouldUseWritingWarpGuidedCreate,
} from './writingCreateUx';

describe('writingCreateUx capability signals', () => {
  const previewGuide = {
    interactiveCard: {
      fields: [{ name: 'industry' }, { name: 'date_mode' }, { name: 'article_length' }],
      hint: '先确认检索条件',
    },
    webSearch: { maxResults: 200, clientPreview: true as const },
  };
  const noPreviewGuide = {
    interactiveCard: {
      fields: [{ name: 'topic' }],
      hint: '请确认话题',
      postPreHint: '话题已确认。请继续选择差异度与份数。',
    },
    webSearch: null,
  };
  const previewSchema = {
    'x-createUx': 'warp-gates',
    properties: {
      industry: {},
      date_mode: { 'x-collect': 'pre' },
      core_topic: {},
      style: {},
    },
  };
  const noPreviewSchema = {
    'x-createUx': 'warp-gates',
    properties: {
      topic: {},
      structure_divergence: {},
      style_divergence: {},
      seek_count: {},
    },
  };

  it('indicatesWarpGatesCreate from createUx / x-createUx / interactiveCard', () => {
    expect(indicatesWarpGatesCreate({ createUx: 'warp-gates' })).toBe(true);
    expect(indicatesWarpGatesCreate({ schema: previewSchema })).toBe(true);
    expect(indicatesWarpGatesCreate({ createGuide: previewGuide })).toBe(true);
    expect(indicatesWarpGatesCreate({ schema: { properties: { title: {} } } })).toBe(false);
  });

  it('client webSearch preview is createGuide capability, not business name', () => {
    expect(needsCreateGuideClientWebSearchPreview({ createGuide: previewGuide })).toBe(true);
    expect(
      needsCreateGuideClientWebSearchPreview({
        createGuide: { webSearch: { topicExtractTextKey: 'text/expert/foo' } },
      })
    ).toBe(true);
    expect(needsCreateGuideClientWebSearchPreview({ createGuide: noPreviewGuide })).toBe(false);
    expect(
      needsCreateGuideClientWebSearchPreview({
        createGuide: { webSearch: { maxResults: 40, clientPreview: false } },
      })
    ).toBe(false);
    // mid-pre（风格→话题）不算 pre 结束后行业检索
    expect(
      needsCreateGuideClientWebSearchPreview({
        createGuide: {
          webSearch: {
            clientPreview: true,
            midPreAfterField: 'voice_id',
            topicCount: 32,
          },
        },
      })
    ).toBe(false);
  });

  it('midPre topic recommend reads afterField / topicCount', () => {
    const mid = getCreateGuideMidPreTopicRecommend({
      createGuide: {
        webSearch: {
          clientPreview: true,
          midPreAfterField: 'voice_id',
          topicField: 'topic',
          topicCount: 32,
          maxResults: 80,
          topicExtractTextKey: 'text/expert/industry-hot-topics',
        },
      },
    });
    expect(mid?.afterField).toBe('voice_id');
    expect(mid?.topicField).toBe('topic');
    expect(mid?.topicCount).toBe(32);
  });

  it('midPre outline reads structure_id → outline', () => {
    const mid = getCreateGuideMidPreOutline({
      createGuide: {
        outlinePreview: {
          clientPreview: true,
          midPreAfterField: 'structure_id',
          outlineField: 'outline',
          textKey: 'text/expert/topic-article-outline',
          loadingHint: '正在生成大纲…',
        },
      },
    });
    expect(mid?.afterField).toBe('structure_id');
    expect(mid?.outlineField).toBe('outline');
    expect(mid?.textKey).toBe('text/expert/topic-article-outline');
    expect(mid?.loadingHint).toContain('大纲');
  });

  it('shouldUseWritingWarpGuidedCreate ignores taskKey/subtype labels', () => {
    expect(
      shouldUseWritingWarpGuidedCreate({
        createUx: 'warp-gates',
        taskKey: 'anything',
        subtype: 'whatever',
      })
    ).toBe(true);
    expect(
      shouldUseWritingWarpGuidedCreate({
        createUx: 'schema-form',
        schema: { properties: { prompt: {} } },
      })
    ).toBe(false);
  });

  it('basic fields exclude pre-collected guide fields; keep only schema props', () => {
    const fields = [
      { name: 'core_topic' },
      { name: 'style' },
      { name: 'industry' },
      { name: 'structure_divergence' },
    ];
    const filtered = filterBasicFieldsByCreateGuide(fields, {
      schema: previewSchema,
      createGuide: previewGuide,
    });
    expect(filtered.map((f) => f.name)).toEqual(['core_topic', 'style']);
  });

  it('no-preview schema keeps its own basic fields', () => {
    const fields = [
      { name: 'structure_divergence' },
      { name: 'seek_count' },
      { name: 'topic' },
      { name: 'supplement' },
    ];
    const filtered = filterBasicFieldsByCreateGuide(fields, {
      schema: noPreviewSchema,
      createGuide: noPreviewGuide,
    });
    expect(filtered.map((f) => f.name)).toEqual(['structure_divergence', 'seek_count']);
  });

  it('client nestedText preview needs followUp card + text task key', () => {
    expect(
      needsCreateGuideNestedTextPreview({
        createGuide: {
          nestedTextPreview: {
            nestedTextTaskKey: 'text/expert/dialogue-content-scan',
            clientPreview: true,
          },
          followUpInteractiveCard: {
            fields: [{ name: 'dialogue_format' }, { name: 'cast' }],
          },
        },
      })
    ).toBe(true);
    expect(
      needsCreateGuideNestedTextPreview({
        createGuide: {
          nestedTextPreview: { nestedTextTaskKey: 'text/expert/dialogue-content-scan' },
        },
      })
    ).toBe(false);
  });

  it('post-pre hint prefers createGuide, else generic capability copy', () => {
    expect(
      resolvePostPreAssistantHint({
        createGuide: noPreviewGuide,
        usedClientWebSearchPreview: false,
      })
    ).toBe('话题已确认。请继续选择差异度与份数。');
    expect(
      resolvePostPreAssistantHint({
        createGuide: previewGuide,
        usedClientWebSearchPreview: true,
        topicChipCount: 12,
      })
    ).toContain('12');
    expect(
      resolvePostPreAssistantHint({
        usedClientWebSearchPreview: false,
      })
    ).toBe('基础信息已确认。请继续填写剩余项。');
    expect(
      resolvePostPreAssistantHint({
        createGuide: {
          interactiveCard: {
            fields: [{ name: 'source_material' }],
            postPreHint: '正在分析…',
          },
          nestedTextPreview: { nestedTextTaskKey: 'text/expert/dialogue-content-scan' },
          followUpInteractiveCard: {
            fields: [{ name: 'cast' }],
            postPreHint: '配置已确认。接下来将拆分台词。',
          },
        },
        usedClientWebSearchPreview: false,
      })
    ).toBe('配置已确认。接下来将拆分台词。');
  });
});
