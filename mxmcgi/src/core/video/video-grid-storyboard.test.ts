import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  applyStoryboardToVideoParams,
  buildStoryboardPromptText,
  isStoryboardGridAlreadyApplied,
  parseStoryboardGridParams,
  prepareStoryboardGridForTaskPersist,
  prepareStoryboardGridParams,
  sanitizeStoryboardGridPayload,
  splitAndUploadStoryboardCells,
  validateStoryboardGridForPrepare,
  type StoryboardGridParams,
  type StoryboardSplitResult,
} from './video-grid-storyboard';

vi.mock('../../storage/generated-temp', () => ({
  getGeneratedBucket: () => 'systemtemp',
  uploadGeneratedTemp: vi.fn(),
  deleteGeneratedBlob: vi.fn(),
}));

vi.mock('../storage/r2-uploader', () => ({
  getR2SystemTempPublicUrl: () => 'https://temp.r2.dev',
}));

vi.mock('../utils/grid-layout-splitter', () => ({
  splitGridLayoutImage: vi.fn(),
}));

vi.mock('../utils/grid-layout-analyzer', () => ({
  analyzeGridLayout: vi.fn(),
  hasUsableSeamBounds: vi.fn(() => false),
}));

vi.mock('../../models/atlascloud/upload-media', () => ({
  uploadBufferToAtlasMedia: vi.fn(),
  upscaleBufferForAtlasVideoMinEdge: vi.fn(async (buf: Buffer) => buf),
}));

vi.mock('../providers/provider-keys', () => ({
  getFirstProviderKey: vi.fn(async () => 'test-atlas-key'),
}));

describe('video-grid-storyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parseStoryboardGridParams reads nested object', () => {
    const p = parseStoryboardGridParams({
      storyboard_grid: {
        enabled: true,
        layout: '3x3',
        source_image: { content: 'https://example.com/grid.jpg' },
        cells: [{ index: 0, purpose: 'front' }],
        first_frame_index: 0,
        last_frame_index: 8,
      },
    });
    expect(p?.enabled).toBe(true);
    expect(p?.layout).toBe('3x3');
  });

  it('validateStoryboardGridForPrepare rejects missing source', () => {
    expect(() =>
      validateStoryboardGridForPrepare({
        storyboard_grid: { enabled: true, layout: '2x2' },
      }),
    ).toThrow(/源图/);
  });

  it('sanitizeStoryboardGridPayload removes null optional fields', () => {
    const params: Record<string, unknown> = {
      storyboard_grid: {
        enabled: true,
        layout: '2x2',
        last_frame_index: null,
        source_image: null,
      },
    };
    sanitizeStoryboardGridPayload(params);
    const g = params.storyboard_grid as Record<string, unknown>;
    expect(g).not.toHaveProperty('last_frame_index');
    expect(g).not.toHaveProperty('source_image');
  });

  it('validateStoryboardGridForPrepare rejects conflicting hero_still_images', () => {
    expect(() =>
      validateStoryboardGridForPrepare({
        storyboard_grid: {
          enabled: true,
          layout: '2x2',
          source_image: { content: 'https://a.jpg' },
        },
        hero_still_images: [{ content: 'https://b.jpg' }],
      }),
    ).toThrow(/hero_still_images/);
  });

  it('prepareStoryboardGridParams sets storyboard_prompt and r2v mode', () => {
    const params: Record<string, unknown> = {
      storyboard_grid: {
        enabled: true,
        layout: '2x2',
        source_image: { content: 'https://a.jpg' },
        cells: [
          { index: 0, purpose: 'A' },
          { index: 1, purpose: 'B' },
        ],
      },
    };
    prepareStoryboardGridParams(params);
    expect(params.storyboard_prompt).toContain('Panel 1');
    expect(params.atlas_video_mode).toBe('reference-to-video');
  });

  it('buildStoryboardPromptText orders top-left to bottom-right', () => {
    const text = buildStoryboardPromptText(
      [
        { index: 0, purpose: 'tl' },
        { index: 3, purpose: 'bl' },
      ],
      2,
    );
    expect(text).toContain('row0 col0');
    expect(text).toContain('row1 col0');
  });

  it('applyStoryboardToVideoParams maps reference_images and frames', () => {
    const splitResult: StoryboardSplitResult = {
      cellUrls: ['https://c0.jpg', 'https://c1.jpg', 'https://c2.jpg', 'https://c3.jpg'],
      tempKeys: ['k0', 'k1', 'k2', 'k3'],
      bucket: 'systemtemp',
      gridN: 2,
      totalCells: 4,
      layout: '2x2',
    };
    const grid: StoryboardGridParams = {
      enabled: true,
      layout: '2x2',
      first_frame_index: 1,
      last_frame_index: 3,
    };
    const params: Record<string, unknown> = {};
    const meta = applyStoryboardToVideoParams(params, splitResult, grid);

    expect(params.reference_images).toEqual(splitResult.cellUrls);
    expect(params.input_reference).toBe('https://c1.jpg');
    expect(params.last_frame).toBe('https://c3.jpg');
    expect(params.atlas_video_mode).toBe('reference-to-video');
    expect(meta.tempR2Keys).toHaveLength(4);
  });

  it('isStoryboardGridAlreadyApplied detects http reference_images', () => {
    expect(isStoryboardGridAlreadyApplied({ reference_images: ['https://a.jpg'] })).toBe(true);
    expect(isStoryboardGridAlreadyApplied({ reference_images: [] })).toBe(false);
    expect(
      isStoryboardGridAlreadyApplied({
        reference_images: [
          'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/video-grid/task/0.png',
        ],
      }),
    ).toBe(false);
  });

  it('splitAndUploadStoryboardCells uploads to Atlas when provider is atlascloud', async () => {
    const { splitGridLayoutImage } = await import('../utils/grid-layout-splitter');
    const { uploadBufferToAtlasMedia } = await import('../../models/atlascloud/upload-media');
    vi.mocked(splitGridLayoutImage).mockResolvedValue({
      images: ['data:image/png;base64,aa==', 'data:image/png;base64,bb=='],
      metadata: {
        gridN: 2,
        originalSize: { width: 10, height: 10 },
        cellSize: { width: 5, height: 5 },
        format: 'png',
        splitMode: 'equal',
      },
    });
    vi.mocked(uploadBufferToAtlasMedia).mockImplementation(async (_buf, filename) => {
      return `https://storage.atlascloud.ai/uploads/test/${filename}`;
    });

    const result = await splitAndUploadStoryboardCells(
      'task-atlas',
      'data:image/png;base64,xx',
      '2x2',
      null,
      { provider: 'atlascloud' },
    );
    expect(result.referenceHost).toBe('atlas');
    expect(result.cellUrls.every((u) => u.includes('atlascloud.ai'))).toBe(true);
    expect(result.tempKeys).toHaveLength(0);
    expect(uploadBufferToAtlasMedia).toHaveBeenCalledTimes(2);
  });

  it('prepareStoryboardGridForTaskPersist splits base64 before storage sanitize', async () => {
    const { splitGridLayoutImage } = await import('../utils/grid-layout-splitter');
    const { uploadGeneratedTemp } = await import('../../storage/generated-temp');
    const { analyzeGridLayout } = await import('../utils/grid-layout-analyzer');

    vi.mocked(analyzeGridLayout).mockResolvedValue({
      width: 100,
      height: 100,
      orientation: 'square',
      aspectLabel: '1:1',
      layout: '2x2',
      gridN: 2,
      confidence: 'high',
      layoutSource: 'cv',
      seamBounds: null,
      verticalGutters: [],
      horizontalGutters: [],
    });
    vi.mocked(splitGridLayoutImage).mockResolvedValue({
      images: [
        'data:image/png;base64,aa==',
        'data:image/png;base64,bb==',
        'data:image/png;base64,cc==',
        'data:image/png;base64,dd==',
      ],
      metadata: {
        gridN: 2,
        originalSize: { width: 100, height: 100 },
        cellSize: { width: 50, height: 50 },
        format: 'png',
        splitMode: 'equal',
      },
    });
    vi.mocked(uploadGeneratedTemp).mockImplementation(async (opts) => ({
      url: `https://temp.r2.dev/gen/temp/video-grid/${opts.taskId}/${opts.name}.png`,
      key: `gen/temp/video-grid/${opts.taskId}/${opts.name}.png`,
      bucket: 'systemtemp',
      provider: 'minio',
    }));

    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const requestParams: Record<string, unknown> = {
      taskType: 'video',
      params: {
        storyboard_grid: {
          enabled: true,
          layout: '2x2',
          source_image: { content: tinyPng, type: 'main-subject' },
          cells: [
            { index: 0, purpose: 'a' },
            { index: 1, purpose: 'b' },
            { index: 2, purpose: 'c' },
            { index: 3, purpose: 'd' },
          ],
        },
      },
    };

    const meta = await prepareStoryboardGridForTaskPersist('task-test', requestParams);
    expect(meta?.tempR2Keys).toHaveLength(4);
    const inner = requestParams.params as Record<string, unknown>;
    expect(inner.reference_images).toHaveLength(4);
    const grid = inner.storyboard_grid as Record<string, unknown>;
    expect(grid.source_image).toBeUndefined();
  });
});
