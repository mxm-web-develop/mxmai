import { describe, expect, it } from 'vitest';
import {
  buildStyleExemplars,
  flattenPaletteHexes,
  formatStyleExemplarHints,
  normalizeFeatureTags,
  normalizeStylePackSummary,
  normalizeStyleVisionObj,
} from './style-vision-types';

describe('style-vision-types', () => {
  it('normalizes solid + gradient palettes', () => {
    const obj = normalizeStyleVisionObj(
      {
        confidence: 0.9,
        source: 'image',
        aesthetic_summary: '极简扁平',
        feature_tags: ['配色', '布局', '风格', '多余'],
        palettes: [
          {
            name: '主品牌',
            roles: ['primary'],
            colors: [
              { kind: 'gradient', stops: [{ hex: '#112233' }, { hex: 'aabbcc' }], angle: '90deg' },
              { kind: 'solid', hex: '#FFFFFF' },
            ],
          },
        ],
        avoid: ['霓虹'],
      },
      { source: 'image' }
    );
    expect(obj.palettes?.[0]?.colors[0]).toMatchObject({ kind: 'gradient' });
    expect(flattenPaletteHexes(obj.palettes)).toEqual(['#112233', '#AABBCC', '#FFFFFF']);
    expect(obj.feature_tags).toEqual(['配色', '布局', '风格']);
  });

  it('truncates feature tags to 3', () => {
    expect(normalizeFeatureTags(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(normalizeFeatureTags('x')).toEqual([]);
  });

  it('normalizes pack summary with exemplars Top5', () => {
    const frames = [
      {
        schema_version: 1 as const,
        confidence: 0.9,
        source: 'image' as const,
        feature_tags: ['配色'],
        ref_type: 'storage_object' as const,
        ref_id: 'a',
        media_url: 'https://ex/a.png',
      },
      {
        schema_version: 1 as const,
        confidence: 0.5,
        source: 'image' as const,
        feature_tags: ['布局', '风格'],
        ref_type: 'storage_object' as const,
        ref_id: 'b',
        media_url: 'https://ex/b.png',
      },
    ];
    const pack = normalizeStylePackSummary(
      {
        style_summary: '清新插画',
        palettes: [{ colors: [{ kind: 'solid', hex: '#123456' }] }],
        avoid: ['写实'],
        exemplars: [
          { ref_key: 'storage_object:b', fit_score: 0.95, feature_tags: ['布局'] },
          { ref_key: 'storage_object:a', fit_score: 0.8 },
        ],
        frame_count: 2,
      },
      { frameCount: 2, folderName: '测试夹', frames }
    );
    expect(pack.style_summary).toBe('清新插画');
    expect(pack.palette).toEqual(['#123456']);
    expect(pack.donts).toEqual(['写实']);
    expect(pack.exemplars?.[0]?.ref_key).toBe('storage_object:b');
    expect(pack.exemplars?.[0]?.feature_tags).toEqual(['布局']);
    expect(pack.exemplars?.[1]?.feature_tags).toEqual(['配色']);
    expect(pack.exemplar_ref_ids).toEqual(['storage_object:b', 'storage_object:a']);
    expect(pack.exemplar_urls).toEqual(['https://ex/b.png', 'https://ex/a.png']);
  });

  it('falls back to confidence when exemplars missing', () => {
    const frames = [
      {
        schema_version: 1 as const,
        confidence: 0.2,
        source: 'image' as const,
        feature_tags: ['弱'],
        ref_type: 'storage_object' as const,
        ref_id: 'low',
        media_url: 'https://ex/low.png',
      },
      {
        schema_version: 1 as const,
        confidence: 0.99,
        source: 'image' as const,
        feature_tags: ['强'],
        ref_type: 'storage_object' as const,
        ref_id: 'hi',
        media_url: 'https://ex/hi.png',
      },
    ];
    const exemplars = buildStyleExemplars({ frames });
    expect(exemplars[0]?.ref_key).toBe('storage_object:hi');
    expect(formatStyleExemplarHints(exemplars)).toContain('ref1[强]');
  });
});
