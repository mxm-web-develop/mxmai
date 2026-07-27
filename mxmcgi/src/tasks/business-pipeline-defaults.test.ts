import { describe, expect, it, vi } from 'vitest';

vi.mock('../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: {},
}));

import { mergeEffectivePipeline } from './business-pipeline-defaults';
import type { TaskTemplate } from './types';

function baseTemplate(overrides?: Partial<TaskTemplate>): TaskTemplate {
  return {
    formSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        intel_kb: { type: 'object', 'x-ui-type': 'kbRecall' },
        intel_web: { type: 'object', 'x-ui-type': 'webSearch' },
      },
    },
    prompt: { unifiedTemplate: '${prompt}\n${intel_kb}\n${intel_web}' },
    ...overrides,
  } as TaskTemplate;
}

describe('mergeEffectivePipeline', () => {
  it('schema 有 kb/web 字段时，显式 pre 不能覆盖掉 resolveContextFields', () => {
    const template = baseTemplate({
      pipeline: {
        pre: [{ step: 'sensitiveCheck', params: { paths: ['prompt'] } }],
      },
    });
    const { pre } = mergeEffectivePipeline('writing', template);
    expect(pre.some((s) => s.step === 'resolveContextFields')).toBe(true);
    expect(pre.some((s) => s.step === 'sensitiveCheck')).toBe(true);
  });

  it('无显式 pipeline 时只注入 schema 派生步骤，不自动注入 sensitiveCheck', () => {
    const { pre } = mergeEffectivePipeline('writing', baseTemplate());
    expect(pre.map((s) => s.step)).toEqual(['resolveContextFields']);
    expect(pre.some((s) => s.step === 'sensitiveCheck')).toBe(false);
  });

  it('显式 pipeline 中的 sensitiveCheck 原样保留', () => {
    const template = baseTemplate({
      pipeline: {
        pre: [
          { step: 'sensitiveCheck', params: { paths: ['prompt'], listIds: ['x'] } },
          { step: 'sensitiveCheck', params: { paths: ['finalPrompt'], listIds: ['y'] } },
        ],
      },
    });
    const { pre } = mergeEffectivePipeline('writing', template);
    expect(pre.filter((s) => s.step === 'sensitiveCheck')).toHaveLength(2);
  });

  it('业务管线不再自动注入 knowledgeRetrieve', () => {
    const template = baseTemplate({
      knowledge: { useKnowledge: true, defaultKnowledgeBaseIds: ['kb-1'] },
    });
    const { pre } = mergeEffectivePipeline('writing', template);
    expect(pre.some((s) => s.step === 'knowledgeRetrieve')).toBe(false);
  });
});
