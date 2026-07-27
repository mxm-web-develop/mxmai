import { describe, expect, it } from 'vitest';
import {
  buildWritingExemplars,
  normalizeWritingFeatureTags,
  normalizeWritingStyleObj,
  normalizeWritingStylePackSummary,
} from './writing-style-types';

describe('writing-style-types', () => {
  it('normalizes frame voice fields', () => {
    const obj = normalizeWritingStyleObj(
      {
        confidence: 0.88,
        source: 'text',
        voice_summary: '冷静评论体，短句急推',
        feature_tags: ['tone', 'structure', 'rhythm', 'extra'],
        tone: ['克制', '犀利'],
        lexicon: { favored: ['换言之'], avoid: ['绝绝子'] },
        structure: { opening: '冲突事实开场', closing: '留判断空间' },
        avoid: ['感叹堆砌'],
      },
      { title: '样例文' }
    );
    expect(obj.source).toBe('text');
    expect(obj.voice_summary).toContain('冷静');
    expect(obj.feature_tags).toEqual(['tone', 'structure', 'rhythm']);
    expect(obj.lexicon?.favored).toEqual(['换言之']);
    expect(obj.structure?.opening).toContain('冲突');
  });

  it('truncates feature tags to 3', () => {
    expect(normalizeWritingFeatureTags(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(normalizeWritingFeatureTags('x')).toEqual([]);
  });

  it('normalizes pack with exemplars Top5', () => {
    const frames = [
      {
        schema_version: 1 as const,
        confidence: 0.9,
        source: 'text' as const,
        voice_summary: 'A',
        feature_tags: ['tone'],
        ref_type: 'storage_object' as const,
        ref_id: 'a',
        title: '文A',
      },
      {
        schema_version: 1 as const,
        confidence: 0.5,
        source: 'text' as const,
        voice_summary: 'B',
        feature_tags: ['structure', 'rhythm'],
        ref_type: 'storage_object' as const,
        ref_id: 'b',
        title: '文B',
      },
    ];
    const pack = normalizeWritingStylePackSummary(
      {
        voice_summary: '整包冷静评论体',
        tone: ['克制'],
        avoid: ['感叹'],
        exemplars: [
          { ref_key: 'storage_object:b', fit_score: 0.95, feature_tags: ['structure'] },
          { ref_key: 'storage_object:a', fit_score: 0.8 },
        ],
        frame_count: 2,
      },
      { frameCount: 2, folderName: '语感夹', frames }
    );
    expect(pack.voice_summary).toBe('整包冷静评论体');
    expect(pack.exemplars?.[0]?.ref_key).toBe('storage_object:b');
    expect(pack.exemplars?.[0]?.feature_tags).toEqual(['structure']);
    expect(pack.exemplars?.[1]?.feature_tags).toEqual(['tone']);
    expect(pack.exemplar_ref_ids).toEqual(['storage_object:b', 'storage_object:a']);
  });

  it('falls back to confidence when exemplars missing', () => {
    const frames = [
      {
        schema_version: 1 as const,
        confidence: 0.2,
        source: 'text' as const,
        feature_tags: ['tone'],
        ref_type: 'storage_object' as const,
        ref_id: 'low',
        title: '弱',
      },
      {
        schema_version: 1 as const,
        confidence: 0.99,
        source: 'text' as const,
        feature_tags: ['voice'],
        ref_type: 'storage_object' as const,
        ref_id: 'high',
        title: '强',
      },
    ];
    const exemplars = buildWritingExemplars({ frames });
    expect(exemplars[0]?.ref_key).toBe('storage_object:high');
  });
});
