import { describe, expect, it } from 'vitest';
import { type VideoGeneratorOption } from './types';
import { normalizeVideoGeneratorRoute, resolveGeneratorLabel, resolveGeneratorRouteValue } from './generatorRouteUtils';

describe('generatorRouteUtils', () => {
  it('normalizes legacy resource/fragment to generator/fragment', () => {
    expect(normalizeVideoGeneratorRoute('resource', 'fragment')).toEqual({
      taskKey: 'generator',
      subtype: 'fragment',
    });
    expect(resolveGeneratorRouteValue('resource', 'fragment')).toBe('generator/fragment');
  });

  it('resolves display label from options', () => {
    const options: VideoGeneratorOption[] = [
      {
        taskKey: 'generator',
        subtype: 'fragment',
        label: '生成 · UP主素材片段',
        businessType: 'video-generator-fragment',
      },
    ];
    expect(resolveGeneratorLabel('resource/fragment', options)).toBe('生成 · UP主素材片段');
    expect(resolveGeneratorLabel('generator/fragment', options)).toBe('生成 · UP主素材片段');
  });
});
