import { describe, expect, it } from 'vitest';
import {
  isReferenceImageLocator,
  isUsableReferenceImageContent,
  parseReferenceImageLocator,
} from './reference-image';

describe('parseReferenceImageLocator', () => {
  it('recognizes relative storage object proxy paths', () => {
    const loc = parseReferenceImageLocator('/api/v1/media/object/3d18e7b7-e5cf-4fdc-a97e-bd1582ff3597');
    expect(loc).toEqual({
      kind: 'media-object',
      objectId: '3d18e7b7-e5cf-4fdc-a97e-bd1582ff3597',
    });
  });

  it('recognizes absolute gateway object URLs', () => {
    const loc = parseReferenceImageLocator(
      'http://8.216.100.106/api/v1/media/object/abc-123'
    );
    expect(loc).toEqual({ kind: 'media-object', objectId: 'abc-123' });
  });

  it('recognizes media asset query paths', () => {
    const loc = parseReferenceImageLocator(
      '/api/v1/media/asset?bucket=user-assets&key=user/upload/graph/a.jpg'
    );
    expect(loc).toEqual({
      kind: 'media-asset',
      bucket: 'user-assets',
      key: 'user/upload/graph/a.jpg',
    });
  });
});

describe('isUsableReferenceImageContent', () => {
  it('accepts gateway proxy paths used by Web/H5 uploads', () => {
    expect(
      isUsableReferenceImageContent('/api/v1/media/object/3d18e7b7-e5cf-4fdc-a97e-bd1582ff3597')
    ).toBe(true);
    expect(isReferenceImageLocator('/api/v1/media/object/test-id')).toBe(true);
  });

  it('rejects sanitize placeholders', () => {
    expect(isUsableReferenceImageContent('[Base64数据已过滤，大小: 100.00 KB]')).toBe(false);
  });
});
