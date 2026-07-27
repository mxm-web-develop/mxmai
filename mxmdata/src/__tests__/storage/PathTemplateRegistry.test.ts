import { describe, it, expect } from 'vitest';
import { buildObjectKey } from '../../storage/PathTemplateRegistry';

describe('PathTemplateRegistry', () => {
  it('builds user_upload asset key', () => {
    const key = buildObjectKey('user_upload', 'reference', {
      userId: 'u1',
      folderPath: '_',
      yyyy: '20260603',
      uuid: 'abc-123',
      ext: 'jpg',
    });
    expect(key).toBe('upload/u1/assets/_/20260603/abc-123.jpg');
  });

  it('builds user_upload temp key', () => {
    const key = buildObjectKey('user_upload', 'temp', {
      userId: 'u1',
      yyyy: '20260603',
      uuid: 'abc-123',
      ext: 'jpg',
    });
    expect(key).toBe('upload/temp/u1/20260603/abc-123.jpg');
  });

  it('builds generated graph output key', () => {
    const key = buildObjectKey('generated', 'graph_output', {
      scope: 'graph',
      userId: 'u1',
      taskId: 'task-1',
      index: 0,
      ext: 'webp',
    });
    expect(key).toBe('gen/graph/u1/task-1/0.webp');
  });

  it('builds generated temp key', () => {
    const key = buildObjectKey('generated', 'temp_video_grid', {
      scope: 'video-grid',
      taskId: 't1',
      name: '3',
      ext: 'jpg',
    });
    expect(key).toBe('gen/temp/video-grid/t1/3.jpg');
  });

  it('builds system_static key', () => {
    const key = buildObjectKey('system_static', 'brand', {
      category: 'brand',
      version: 'v1',
      filename: 'electronics.webp',
      ext: 'webp',
    });
    expect(key).toBe('sys/brand/v1/electronics.webp');
  });
});
